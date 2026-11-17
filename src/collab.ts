// CollabManager: Multi-housemate collaboration ("Lingguhang Hamon")
// Coordinates up to 4 OpenCode housemates using their actual OpenCode agents
// (e.g. custom agents like "tester", "build", "qa", etc.) in an autonomous test-fix pipeline:
// Builder/Coder -> Tester/Verifier -> Self-Healing Retry Loop -> Kuya Circuit Breaker.

import { audit } from "./audit";
import { log } from "./log";
import type { Store } from "./store";
import type { SessionState } from "./types";
import type { Housemates } from "./housemates";
import type { OpenCodeSupervisor } from "./opencode-supervisor";

export function isVerifierAgent(agentName: string): boolean {
  const name = (agentName || "").toLowerCase();
  return (
    name.includes("test") ||
    name.includes("qa") ||
    name.includes("review") ||
    name.includes("eval") ||
    name.includes("check") ||
    name.includes("audit")
  );
}

export interface CollabMemberInput {
  key: string;
  isVerifier?: boolean;
}

export interface CollabMember {
  key: string;
  name: string;
  agent: string; // The housemate's native OpenCode agent (e.g. "tester", "build", custom agent)
  isVerifier: boolean;
  state: "standby" | "working" | "blocked" | "done" | "error";
  sessionId: string;
  lastError?: string;
}

export interface CollabSubtask {
  memberKey: string;
  memberName: string;
  agent: string;
  title: string;
  instructions: string;
  assignedFiles: string[];
  completed: boolean;
  report?: string;
}

export interface KuyaConfig {
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
    variant?: string;
  };
}

export interface CollabTask {
  id: string;
  goal: string;
  cwd: string;
  members: CollabMember[];
  currentStep: "building" | "verifying" | "done" | "blocked";
  activeMemberKey: string;
  attempt: number;
  maxAttempts: number;
  lastHandoffReport: string;
  createdAt: number;
  completedAt?: number;
  status: "running" | "done" | "failed" | "blocked" | "canceled";
  log: Array<{ agent: string; name: string; text: string; ts: number }>;
  rushMode?: boolean;
  kuyaConfig?: KuyaConfig;
  subtasks?: CollabSubtask[];
}

export class CollabManager {
  private tasks = new Map<string, CollabTask>();
  private activeTaskId: string | null = null;
  onAnnounce?: (line: string) => void;

  constructor(
    private store: Store,
    private housemates: Housemates,
    private supervisor: OpenCodeSupervisor,
  ) {
    this.housemates.onSessionError = (sessionId: string, error: string) => {
      void this.handleSessionError(sessionId, error);
    };
  }

  getActiveTask(): CollabTask | null {
    if (!this.activeTaskId) return null;
    return this.tasks.get(this.activeTaskId) || null;
  }

  getTasks(): CollabTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(id: string): CollabTask | undefined {
    return this.tasks.get(id);
  }

  isSessionInCollab(sessionId: string): boolean {
    const task = this.getActiveTask();
    if (!task || task.status !== "running") return false;
    return task.members.some((m) => m.sessionId === sessionId);
  }

  getMemberCollabState(sessionId: string): SessionState | null {
    const task = this.getActiveTask();
    if (!task || (task.status !== "running" && task.status !== "blocked")) return null;
    const member = task.members.find((m) => m.sessionId === sessionId);
    if (!member) return null;
    if (member.state === "error") return "error";
    if (member.state === "blocked") return "blocked";
    return member.state === "working" ? "working" : "standby";
  }

  /** Starts a multi-agent collaboration task with up to 4 housemates */
  async startTask(input: {
    goal: string;
    cwd?: string;
    members: CollabMemberInput[];
    maxAttempts?: number;
    rushMode?: boolean;
    kuyaConfig?: KuyaConfig;
  }): Promise<CollabTask> {
    const goal = input.goal?.trim();
    if (!goal) throw new Error("Task goal required");
    if (!Array.isArray(input.members) || input.members.length < 2) {
      throw new Error("Collaboration requires at least 2 housemates");
    }
    if (input.members.length > 4) {
      throw new Error("Collaboration supports up to 4 housemates");
    }

    // Resolve members from real summoned housemates and their OpenCode agents
    const resolvedMembers: CollabMember[] = [];
    for (const m of input.members) {
      const rec = this.housemates.get(m.key);
      if (!rec) throw new Error(`Housemate not found: ${m.key}`);
      const isVerifier = m.isVerifier ?? isVerifierAgent(rec.agent);
      resolvedMembers.push({
        key: rec.key,
        name: rec.name,
        agent: rec.agent,
        isVerifier,
        state: "standby",
        sessionId: rec.sessionId,
      });
    }

    const builders = resolvedMembers.filter((m) => !m.isVerifier);
    const primaryBuilder = builders[0] || resolvedMembers[0];
    const taskId = `collab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const cwd = input.cwd || this.housemates.get(primaryBuilder.key)?.directory || process.cwd();
    const isRushMode = Boolean(input.rushMode && builders.length >= 2);

    const task: CollabTask = {
      id: taskId,
      goal,
      cwd,
      members: resolvedMembers,
      currentStep: "building",
      activeMemberKey: primaryBuilder.key,
      attempt: 1,
      maxAttempts: input.maxAttempts && input.maxAttempts > 0 ? input.maxAttempts : 3,
      lastHandoffReport: "",
      createdAt: Date.now(),
      status: "running",
      log: [],
      rushMode: isRushMode,
      kuyaConfig: input.kuyaConfig,
    };

    this.tasks.set(taskId, task);
    this.activeTaskId = taskId;

    const memberSummary = resolvedMembers.map((m) => `${m.name} [agent: ${m.agent}]`).join(", ");
    const startMsg = `Pakinggan ang inyong bagong Lingguhang Hamon: "${goal}". Team: ${memberSummary}`;
    this.announce(startMsg);
    task.log.push({ agent: "kuya", name: "Kuya", text: `📢 HAMON STARTED: "${goal}"\nTeam: ${memberSummary}`, ts: Date.now() });

    audit("kuya", "collab_start", taskId, {
      goal,
      members: memberSummary,
      rushMode: isRushMode,
    });

    if (isRushMode) {
      // ⚡ RUSH MODE: Kuya AI decomposes the task and dispatches all builders in parallel!
      const subtasks = await this.decomposeWithKuya(goal, cwd, builders, input.kuyaConfig);
      task.subtasks = subtasks;

      const rushAnnounce = `⚡ RUSH MODE PINAG-USAPAN: Pinamumunuan ni Kuya ang parallel dispatch ng ${builders.length} builders nang sabay-sabay!`;
      this.announce(rushAnnounce);
      task.log.push({
        agent: "kuya",
        name: "Kuya",
        text: `⚡ KUYA RUSH MODE ORCHESTRATION:\n${subtasks.map((s) => `• 🦫 ${s.memberName} [${s.agent}]: ${s.title}\n  Assigned Files: ${s.assignedFiles.join(", ") || "(Domain scoped)"}\n  Instructions: ${s.instructions}`).join("\n\n")}`,
        ts: Date.now(),
      });

      // All builders work simultaneously at their desks
      for (const m of resolvedMembers) {
        const isBuilder = !m.isVerifier;
        m.state = isBuilder ? "working" : "standby";
        const rec = this.housemates.get(m.key);
        if (rec) rec.state = isBuilder ? "working" : "standby";

        const subtask = subtasks.find((s) => s.memberKey === m.key);
        this.store.ingest({
          harness: "opencode",
          sessionId: m.sessionId,
          type: "collab_step",
          state: isBuilder ? "working" : "standby",
          title: isBuilder
            ? `[Rush Mode] ${m.name} [agent: ${m.agent}]: ${subtask?.title || goal.slice(0, 30)}`
            : `[Lingguhang Hamon] ${m.name} Standby [agent: ${m.agent}]`,
          directory: cwd,
        });
      }

      // Prompt each builder simultaneously
      for (const b of builders) {
        const subtask = subtasks.find((s) => s.memberKey === b.key);
        await this.promptRushBuilder(task, b, subtask);
      }
    } else {
      // Turn-based Relay mode: primary builder starts, others standby
      for (const m of resolvedMembers) {
        const isWorking = m.key === primaryBuilder.key;
        m.state = isWorking ? "working" : "standby";
        const rec = this.housemates.get(m.key);
        if (rec) {
          rec.state = isWorking ? "working" : "standby";
        }
        this.store.ingest({
          harness: "opencode",
          sessionId: m.sessionId,
          type: "collab_step",
          state: isWorking ? "working" : "standby",
          title: isWorking
            ? `[Lingguhang Hamon] ${m.name} [agent: ${m.agent}]: ${goal.slice(0, 40)}`
            : `[Lingguhang Hamon] ${m.name} Standby [agent: ${m.agent}]`,
          directory: cwd,
        });
      }

      // Prompt the primary builder to start
      await this.promptActiveMember(task, primaryBuilder);
    }

    return task;
  }

  private async decomposeWithKuya(
    goal: string,
    cwd: string,
    builders: CollabMember[],
    kuyaConfig?: KuyaConfig,
  ): Promise<CollabSubtask[]> {
    const client = this.supervisor.client;
    if (client && kuyaConfig?.model) {
      try {
        const session = await client.createSession({
          directory: cwd,
          title: "Kuya Orchestrator [Hamon]",
          agent: kuyaConfig.agent || "build",
          model: {
            id: kuyaConfig.model.modelID,
            providerID: kuyaConfig.model.providerID,
            ...(kuyaConfig.model.variant ? { variant: kuyaConfig.model.variant } : {}),
          },
        });

        const promptText = [
          `You are Kuya, the Meta-Orchestrator of Bahay Ni Kuya.`,
          `Analyze this mission goal for a team of ${builders.length} builder agents:`,
          `Goal: "${goal}"`,
          ``,
          `Builders:`,
          ...builders.map((b, i) => `${i + 1}. ${b.name} (OpenCode Agent: ${b.agent})`),
          ``,
          `Decompose this task into exactly ${builders.length} independent subtasks that can be worked on IN PARALLEL without file collisions.`,
          `Assign disjoint file domains to each builder so they do NOT overwrite each other's files.`,
          `Return ONLY a raw JSON array matching this format (no markdown fences, or json block):`,
          `[`,
          `  {`,
          `    "builderIndex": 0,`,
          `    "title": "Short subtask title",`,
          `    "instructions": "Specific instructions for this builder",`,
          `    "assignedFiles": ["file1.ext", "file2.ext"]`,
          `  }`,
          `]`,
        ].join("\n");

        const promptPromise = client.prompt(session.id, cwd, {
          message: promptText,
          agent: kuyaConfig.agent,
          model: kuyaConfig.model,
        });

        const res: any = await Promise.race([
          promptPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Kuya decomposition timeout")), 30000)),
        ]);

        let rawContent = "";
        if (res && Array.isArray(res.parts)) {
          rawContent = res.parts
            .filter((p: any) => p.type === "text" && typeof p.text === "string")
            .map((p: any) => p.text)
            .join("\n");
        } else if (res && typeof res.text === "string") {
          rawContent = res.text;
        } else {
          rawContent = await this.getLastAssistantMessage(session.id, cwd);
        }

        const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*\}\s*\]/) || rawContent.match(/\{[\s\S]*"subtasks"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const list = Array.isArray(parsed) ? parsed : parsed.subtasks;
          if (Array.isArray(list) && list.length >= builders.length) {
            return builders.map((b, idx) => {
              const item = list[idx] || list.find((it: any) => it.builderIndex === idx) || list[0];
              return {
                memberKey: b.key,
                memberName: b.name,
                agent: b.agent,
                title: item.title || `Subtask ${idx + 1} for ${b.name}`,
                instructions: item.instructions || goal,
                assignedFiles: Array.isArray(item.assignedFiles) ? item.assignedFiles : [],
                completed: false,
              };
            });
          }
        }
      } catch (err) {
        log(`collab: Kuya OpenCode decomposition error/fallback: ${String(err)}`);
      }
    }

    return this.heuristicDecomposition(goal, builders);
  }

  private heuristicDecomposition(goal: string, builders: CollabMember[]): CollabSubtask[] {
    if (builders.length === 2) {
      const b1 = builders[0];
      const b2 = builders[1];
      const isB2UI = /ui|front|style|css|design|anim/i.test(b2.agent);
      return [
        {
          memberKey: b1.key,
          memberName: b1.name,
          agent: b1.agent,
          title: "Core Logic & Structure",
          instructions: `Implement the foundational architecture, logic, endpoints, and data handling for: "${goal}". Focus on core functionality and contracts. Keep file changes isolated to your assigned domain.`,
          assignedFiles: ["src/", "app.js", "server.js", "data.json", "index.html"],
          completed: false,
        },
        {
          memberKey: b2.key,
          memberName: b2.name,
          agent: b2.agent,
          title: isB2UI ? "UI, Styling & Animations" : "Extended Features & Enhancements",
          instructions: `Enhance the project with ${isB2UI ? "responsive UI styling, smooth animations, visual polish, and component layouts" : "secondary features, integrations, and extensions"} for: "${goal}". Avoid conflicting with core logic files.`,
          assignedFiles: ["styles.css", "dashboard.html", "components/", "theme.css"],
          completed: false,
        },
      ];
    }

    return builders.map((b, idx) => ({
      memberKey: b.key,
      memberName: b.name,
      agent: b.agent,
      title: `Domain Module ${idx + 1}`,
      instructions: `Work on module/domain slice #${idx + 1} for: "${goal}". Focus on your assigned files and agent capabilities (${b.agent}).`,
      assignedFiles: [`module_${idx + 1}/`, `part_${idx + 1}.js`],
      completed: false,
    }));
  }

  private async promptRushBuilder(task: CollabTask, member: CollabMember, subtask?: CollabSubtask): Promise<void> {
    const client = this.supervisor.client;
    if (!client) throw new Error("opencode supervisor not ready");
    const rec = this.housemates.get(member.key);
    if (!rec) return;

    const teamList = task.members.map((m) => `- ${m.name} (OpenCode Agent: ${m.agent})`).join("\n");
    const assignedFilesStr = subtask?.assignedFiles?.length ? subtask.assignedFiles.join(", ") : "your specific domain files";

    const message = [
      `[KUYA'S LINGGUHANG HAMON - ⚡ RUSH MODE PARALLEL ASSIGNMENT]`,
      `Overall Mission Goal: ${task.goal}`,
      `Your Assigned Subtask: ${subtask?.title || "Implementation"}`,
      `Your OpenCode Agent: ${member.agent}`,
      `Team Roster:`,
      teamList,
      ``,
      `⚡ RUSH MODE PARALLEL DIRECTIVE:`,
      `You are working SIMULTANEOUSLY alongside other housemates. To prevent file collision / merge conflicts:`,
      `- STRICTLY limit your modifications and additions to your assigned files/domain: ${assignedFilesStr}.`,
      `- Do NOT overwrite or touch files belonging to other housemates.`,
      ``,
      `Detailed Instructions for ${member.name}:`,
      subtask?.instructions || task.goal,
      ``,
      `When complete, provide a concise handoff summary describing:`,
      `- What files you modified or created.`,
      `- What features or changes were implemented.`,
      `- Confirmation of completion of your assigned subtask.`,
    ].join("\n");

    task.log.push({ agent: "kuya", name: "Kuya", text: message, ts: Date.now() });

    void client
      .promptAsync(rec.sessionId, rec.directory, {
        message,
        agent: rec.agent,
        model: {
          providerID: rec.provider,
          modelID: rec.model,
          ...(rec.variant ? { variant: rec.variant } : {}),
        },
      })
      .catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log(`collab: promptAsync failed for ${member.name}: ${errorMsg}`);
        void this.handleSessionError(rec.sessionId, errorMsg);
      });
  }

  private announce(text: string): void {
    log(`collab: ${text}`);
    this.store.ingest({
      harness: "opencode",
      sessionId: "kuya",
      type: "chat_message",
      role: "kuya",
      text,
    });
    this.onAnnounce?.(text);
  }

  private async getLastAssistantMessage(sessionId: string, directory: string): Promise<string> {
    const client = this.supervisor.client;
    if (!client) return "";
    try {
      const msgs = await client.messages(sessionId, directory);
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role === "assistant") {
          if (Array.isArray(m.parts)) {
            return m.parts
              .filter((p: any) => p.type === "text" && typeof p.text === "string")
              .map((p: any) => p.text)
              .join("\n")
              .trim();
          }
          if (typeof m.text === "string") return m.text.trim();
        }
      }
    } catch {}
    return "";
  }

  /** Dispatches an OpenCode prompt to the active member using their native agent */
  private async promptActiveMember(task: CollabTask, member: CollabMember, extraPrompt?: string): Promise<void> {
    const client = this.supervisor.client;
    if (!client) throw new Error("opencode supervisor not ready");

    const rec = this.housemates.get(member.key);
    if (!rec) return;

    const teamList = task.members.map((m) => `- ${m.name} (OpenCode Agent: ${m.agent})`).join("\n");
    let message = "";

    if (member.isVerifier) {
      message = [
        `[KUYA'S LINGGUHANG HAMON - VERIFICATION STEP (Attempt ${task.attempt}/${task.maxAttempts})]`,
        `Overall Mission Goal: ${task.goal}`,
        `Team Roster:`,
        teamList,
        ``,
        `Recent Handoff Report from Builder:`,
        task.lastHandoffReport || "(None provided)",
        ``,
        `Instructions for ${member.name} (${member.agent}):`,
        `1. Using your capabilities as '${member.agent}', inspect the changes in this repository.`,
        `2. Run tests and validations (e.g. bun test, npm test, or your testing tools).`,
        `3. If all tests PASS and the goal is satisfied, end your reply with:`,
        `   VERIFICATION_PASSED: <summary of tests run and verified>`,
        `4. If any tests FAIL or bugs are found, end your reply with:`,
        `   VERIFICATION_FAILED: <exact error output, failing file, and description of what broke>`,
      ].join("\n");
    } else {
      // Builder / Developer
      const builders = task.members.filter((m) => !m.isVerifier);
      const isRelay = builders.length > 1 && builders[0].key !== member.key;
      const priorBuilder = isRelay ? builders[builders.findIndex((m) => m.key === member.key) - 1] : null;

      let builderContext = "";
      if (task.attempt > 1) {
        builderContext = `[BUG FIX ROUND ${task.attempt}/${task.maxAttempts}]\nThe verification agent found the following issues:\n${extraPrompt || task.lastHandoffReport}\n`;
      } else if (isRelay && task.lastHandoffReport) {
        builderContext = `[BUILDER RELAY - PREVIOUS WORK]\n${priorBuilder?.name || "Previous housemate"} (${priorBuilder?.agent || "builder"}) completed their part with this handoff summary:\n${task.lastHandoffReport}\n\nPlease build upon their work and contribute your specialized capabilities to complete the mission goal.\n`;
      }

      const nextBuilderIndex = builders.findIndex((m) => m.key === member.key) + 1;
      const nextMember = nextBuilderIndex < builders.length
        ? builders[nextBuilderIndex]
        : task.members.find((m) => m.isVerifier);

      const nextActionPrompt = nextMember
        ? (nextMember.isVerifier
            ? `- What the next housemate (${nextMember.name} [${nextMember.agent}]) should test or check.`
            : `- What the next housemate (${nextMember.name} [${nextMember.agent}]) should build upon or style.`)
        : `- Summary of completed work for Kuya's inspection.`;

      message = [
        `[KUYA'S LINGGUHANG HAMON - COLLABORATION TASK]`,
        `Overall Mission Goal: ${task.goal}`,
        `Your OpenCode Agent: ${member.agent}`,
        `Team Roster:`,
        teamList,
        ``,
        builderContext,
        `Instructions for ${member.name}:`,
        `Use your '${member.agent}' agent capabilities in this repository to achieve the mission goal.`,
        `When complete, provide a concise handoff summary describing:`,
        `- What files you modified or created.`,
        `- What features, styling, or fixes were implemented.`,
        nextActionPrompt,
      ].join("\n");
    }

    task.log.push({ agent: "kuya", name: "Kuya", text: message, ts: Date.now() });

    void client
      .promptAsync(rec.sessionId, rec.directory, {
        message,
        agent: rec.agent, // Native OpenCode custom agent!
        model: {
          providerID: rec.provider,
          modelID: rec.model,
          ...(rec.variant ? { variant: rec.variant } : {}),
        },
      })
      .catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log(`collab: promptAsync failed for ${member.name}: ${errorMsg}`);
        void this.handleSessionError(rec.sessionId, errorMsg);
      });
  }

  /**
   * Called when a housemate's turn reaches idle.
   * Handles handoff, verification pass/fail, and retry loops.
   */
  async handleSessionIdle(sessionId: string, replyText: string): Promise<boolean> {
    const task = this.getActiveTask();
    if (!task || task.status !== "running") return false;

    // ⚡ 1. Rush Mode: parallel builders running simultaneously
    if (task.rushMode && task.subtasks && task.subtasks.length > 0 && task.currentStep === "building") {
      const member = task.members.find((m) => m.sessionId === sessionId);
      if (!member) return false;

      const rec = this.housemates.get(member.key);
      if (member.state === "error" || rec?.lastError) {
        log(`collab: handleSessionIdle ignored for ${member.name} due to active error state: ${member.lastError || rec?.lastError}`);
        return true;
      }

      let reply = replyText.trim();
      if (!reply && rec) {
        reply = await this.getLastAssistantMessage(sessionId, rec.directory);
      }

      if (/rate\s*limit|quota exceeded|out of tokens|429 too many|credit balance/i.test(reply)) {
        await this.handleSessionError(sessionId, reply);
        return true;
      }

      task.log.push({ agent: member.agent, name: member.name, text: reply, ts: Date.now() });

      const subtask = task.subtasks.find((s) => s.memberKey === member.key);
      if (subtask && member.state === "working") {
        subtask.completed = true;
        subtask.report = reply;
        member.state = "standby";
        if (rec) rec.state = "standby";

        this.store.ingest({
          harness: "opencode",
          sessionId: member.sessionId,
          type: "collab_step",
          state: "standby",
          title: `[Hamon] ${member.name} (${member.agent}) Subtask Completed [Standby]`,
        });

        const subtaskDoneMsg = `Natapos na ni ${member.name} (${member.agent}) ang subtask na "${subtask.title}". Naka-standby na habang hinihintay ang iba pang builders.`;
        this.announce(subtaskDoneMsg);
        task.log.push({ agent: "kuya", name: "Kuya", text: `✅ SUBTASK COMPLETED: ${subtaskDoneMsg}`, ts: Date.now() });

        const allDone = task.subtasks.every((s) => s.completed);
        if (!allDone) {
          return true; // Still waiting for remaining parallel builders
        }

        // All parallel builders are finished!
        const allDoneMsg = `⚡ RUSH MODE SUBTASKS COMPLETE: Natapos na ng lahat ng builders ang kanilang parallel assignments!`;
        this.announce(allDoneMsg);
        task.log.push({
          agent: "kuya",
          name: "Kuya",
          text: `⚡ ALL SUBTASKS FINISHED:\n${task.subtasks.map((s) => `• 🦫 ${s.memberName} [${s.title}]:\n${s.report || "Done"}`).join("\n\n")}`,
          ts: Date.now(),
        });

        task.lastHandoffReport = task.subtasks
          .map((s) => `[${s.memberName} (${s.agent}) - ${s.title}]\n${s.report || "Done"}`)
          .join("\n\n");

        const verifier = task.members.find((m) => m.isVerifier);
        if (verifier) {
          const handoffText = `Natapos na ng lahat ng builders ang kanilang bahagi sa Rush Mode. Handoff kay ${verifier.name} (${verifier.agent}) para sa pagsusuri!`;
          this.announce(handoffText);
          task.log.push({ agent: "kuya", name: "Kuya", text: `📢 HANDOFF TO VERIFIER: ${handoffText}`, ts: Date.now() });

          verifier.state = "working";
          const verifierRec = this.housemates.get(verifier.key);
          if (verifierRec) verifierRec.state = "working";
          task.activeMemberKey = verifier.key;
          task.currentStep = "verifying";

          this.store.ingest({
            harness: "opencode",
            sessionId: verifier.sessionId,
            type: "collab_step",
            state: "working",
            title: `[Hamon] ${verifier.name} (${verifier.agent}) Verification`,
          });

          await this.promptActiveMember(task, verifier);
          return true;
        }

        // No verifier present: Hamon completed ready for Kuya's inspection/approval
        task.status = "done";
        task.completedAt = Date.now();
        task.currentStep = "done";
        this.activeTaskId = null;

        for (const m of task.members) {
          m.state = "done";
          const mRec = this.housemates.get(m.key);
          if (mRec) mRec.state = "idle";
          this.store.ingest({
            harness: "opencode",
            sessionId: m.sessionId,
            type: "collab_completed",
            state: "idle",
          });
        }

        const finishMsg = `Natapos ng lahat ng builders ang kanilang bahagi sa Lingguhang Hamon "${task.goal.slice(0, 40)}"! Handa na para sa pagsusuri at final approval ni Kuya. 🎉`;
        this.announce(finishMsg);
        task.log.push({
          agent: "kuya",
          name: "Kuya",
          text: `🏆 ALL BUILDERS FINISHED: ${finishMsg}\n(Maaaring mag-follow up si Kuya para sa karagdagang utos, o i-click ang Approve & Mark Done upang tapusin.)`,
          ts: Date.now(),
        });
        audit("kuya", "collab_builders_done", task.id, { goal: task.goal });
        return true;
      }
    }

    // 2. Turn-based Relay or Verification step
    const activeMember = task.members.find((m) => m.key === task.activeMemberKey);
    if (!activeMember || activeMember.sessionId !== sessionId) {
      return false;
    }

    const rec = this.housemates.get(activeMember.key);
    if (activeMember.state === "error" || rec?.lastError) {
      log(`collab: handleSessionIdle ignored for ${activeMember.name} due to active error state: ${activeMember.lastError || rec?.lastError}`);
      return true;
    }

    let reply = replyText.trim();
    if (!reply && rec) {
      reply = await this.getLastAssistantMessage(sessionId, rec.directory);
    }

    if (/rate\s*limit|quota exceeded|out of tokens|429 too many|credit balance/i.test(reply)) {
      await this.handleSessionError(sessionId, reply);
      return true;
    }

    task.log.push({ agent: activeMember.agent, name: activeMember.name, text: reply, ts: Date.now() });

    // Step 1: Was active member a Builder?
    if (!activeMember.isVerifier) {
      task.lastHandoffReport = reply;
      const builders = task.members.filter((m) => !m.isVerifier);
      const currentIndex = builders.findIndex((m) => m.key === activeMember.key);
      const nextBuilder = currentIndex >= 0 && currentIndex < builders.length - 1 ? builders[currentIndex + 1] : null;
      const verifier = task.members.find((m) => m.isVerifier);

      // Case 1A: There is another builder in the relay chain!
      if (nextBuilder) {
        const handoffText = `Natapos na ni ${activeMember.name} (${activeMember.agent}) ang kanyang bahagi. Handoff kay ${nextBuilder.name} (${nextBuilder.agent}) para magpatuloy at mag-enhance!`;
        this.announce(handoffText);
        task.log.push({ agent: "kuya", name: "Kuya", text: `📢 BUILDER RELAY: ${handoffText}`, ts: Date.now() });

        activeMember.state = "standby";
        if (rec) rec.state = "standby";
        this.store.ingest({
          harness: "opencode",
          sessionId: activeMember.sessionId,
          type: "collab_step",
          state: "standby",
          title: `[Hamon] ${activeMember.name} (${activeMember.agent}) Standby`,
        });

        nextBuilder.state = "working";
        const nextRec = this.housemates.get(nextBuilder.key);
        if (nextRec) nextRec.state = "working";
        task.activeMemberKey = nextBuilder.key;
        task.currentStep = "building";

        this.store.ingest({
          harness: "opencode",
          sessionId: nextBuilder.sessionId,
          type: "collab_step",
          state: "working",
          title: `[Hamon] ${nextBuilder.name} (${nextBuilder.agent}) Building`,
        });

        await this.promptActiveMember(task, nextBuilder);
        return true;
      }

      // Case 1B: Last builder finished, and a VERIFIER exists in the team!
      if (verifier) {
        const handoffText = `Natapos na ng mga builder ang kanilang bahagi. Handoff kay ${verifier.name} (${verifier.agent}) para sa pagsusuri!`;
        this.announce(handoffText);
        task.log.push({ agent: "kuya", name: "Kuya", text: `📢 HANDOFF TO VERIFIER: ${handoffText}`, ts: Date.now() });

        activeMember.state = "standby";
        if (rec) rec.state = "standby";
        this.store.ingest({
          harness: "opencode",
          sessionId: activeMember.sessionId,
          type: "collab_step",
          state: "standby",
          title: `[Hamon] ${activeMember.name} (${activeMember.agent}) Standby`,
        });

        verifier.state = "working";
        const verifierRec = this.housemates.get(verifier.key);
        if (verifierRec) verifierRec.state = "working";
        task.activeMemberKey = verifier.key;
        task.currentStep = "verifying";

        this.store.ingest({
          harness: "opencode",
          sessionId: verifier.sessionId,
          type: "collab_step",
          state: "working",
          title: `[Hamon] ${verifier.name} (${verifier.agent}) Verification`,
        });

        await this.promptActiveMember(task, verifier);
        return true;
      }

      // Case 1C: Last builder finished, and NO verifier was summoned!
      // All builders have contributed. Complete task and await Kuya's inspection/approval.
      task.status = "done";
      task.completedAt = Date.now();
      task.currentStep = "done";
      this.activeTaskId = null;

      for (const m of task.members) {
        m.state = "done";
        const mRec = this.housemates.get(m.key);
        if (mRec) mRec.state = "idle";
        this.store.ingest({
          harness: "opencode",
          sessionId: m.sessionId,
          type: "collab_completed",
          state: "idle",
        });
      }

      const finishMsg = `Natapos ng lahat ng builders ang kanilang bahagi sa Lingguhang Hamon "${task.goal.slice(0, 40)}"! Handa na para sa pagsusuri at final approval ni Kuya. 🎉`;
      this.announce(finishMsg);
      task.log.push({
        agent: "kuya",
        name: "Kuya",
        text: `🏆 ALL BUILDERS FINISHED: ${finishMsg}\n(Maaaring mag-follow up si Kuya para sa karagdagang utos, o i-click ang Approve & Mark Done upang tapusin.)`,
        ts: Date.now(),
      });
      audit("kuya", "collab_builders_done", task.id, { goal: task.goal });
      return true;
    }

    // Step 2: Was active member the Verifier? -> Check if verification passed or failed
    const isPassed =
      reply.includes("VERIFICATION_PASSED") ||
      (/all tests pass|0 fail|tests passed/i.test(reply) && !/VERIFICATION_FAILED|1 fail|tests failed/i.test(reply));

    if (isPassed) {
      // 🏆 VICTORY! All tests passed!
      task.status = "done";
      task.completedAt = Date.now();
      task.currentStep = "done";
      this.activeTaskId = null;

      for (const m of task.members) {
        m.state = "done";
        const mRec = this.housemates.get(m.key);
        if (mRec) mRec.state = "idle";
        this.store.ingest({
          harness: "opencode",
          sessionId: m.sessionId,
          type: "collab_completed",
          state: "idle",
        });
      }

      const winMsg = `Tagumpay ang inyong Lingguhang Hamon! Lahat ng tests ay pumasa. Mahusay, mga housemates! 🎉`;
      this.announce(winMsg);
      task.log.push({ agent: "kuya", name: "Kuya", text: `🏆 VICTORY: ${winMsg}`, ts: Date.now() });
      audit("kuya", "collab_done", task.id, { goal: task.goal, attempts: task.attempt });
      return true;
    }

    // Verification failed! Self-healing loop trigger
    task.attempt++;
    if (task.attempt <= task.maxAttempts) {
      const builder = task.members.find((m) => !m.isVerifier) || task.members[0];
      const retryMsg = `May nakitang problema si ${activeMember.name} (${activeMember.agent}) sa pagsusuri (Attempt ${task.attempt}/${task.maxAttempts}). ${builder.name} (${builder.agent}), ayusin ang mga bugs!`;
      this.announce(retryMsg);
      task.log.push({ agent: "kuya", name: "Kuya", text: `⚠️ BUG FIX LOOP: ${retryMsg}`, ts: Date.now() });

      // Verifier goes back to standby, builder wakes up to fix bugs
      activeMember.state = "standby";
      if (rec) rec.state = "standby";
      this.store.ingest({
        harness: "opencode",
        sessionId: activeMember.sessionId,
        type: "collab_step",
        state: "standby",
        title: `[Hamon] ${activeMember.name} (${activeMember.agent}) Standby`,
      });

      builder.state = "working";
      const builderRec = this.housemates.get(builder.key);
      if (builderRec) builderRec.state = "working";
      task.activeMemberKey = builder.key;
      task.currentStep = "building";

      this.store.ingest({
        harness: "opencode",
        sessionId: builder.sessionId,
        type: "collab_step",
        state: "working",
        title: `[Hamon] ${builder.name} (${builder.agent}) Fixing Bugs (Round ${task.attempt})`,
      });

      await this.promptActiveMember(task, builder, reply);
      return true;
    }

    // 🚨 Kuya Circuit Breaker: Max attempts exceeded!
    task.status = "blocked";
    task.currentStep = "blocked";
    const builder = task.members.find((m) => !m.isVerifier) || task.members[0];

    builder.state = "blocked";
    const builderRec = this.housemates.get(builder.key);
    if (builderRec) builderRec.state = "blocked";

    this.store.ingest({
      harness: "opencode",
      sessionId: builder.sessionId,
      type: "blocked",
      state: "blocked",
      error: `Circuit breaker tripped: ${task.maxAttempts} failed verification attempts`,
    });

    const cbMsg = `Pansamantalang nahinto ang Lingguhang Hamon dahil lumagpas sa ${task.maxAttempts} retry attempts. ${builder.name}, pumunta ka sa Confession Room!`;
    this.announce(cbMsg);
    task.log.push({ agent: "kuya", name: "Kuya", text: `🛑 CIRCUIT BREAKER TRIPPED: ${cbMsg}`, ts: Date.now() });

    // Call the builder to the Confession Room so Kuya can talk to them
    await this.housemates
      .call(
        builder.key,
        `Kuya: May problema sa Lingguhang Hamon (${task.maxAttempts} attempts na ang nag-fail). Ano ang status at blocker?`,
        "interrupt",
      )
      .catch(() => undefined);

    return true;
  }

  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status === "done" || task.status === "failed") return false;

    task.status = "canceled";
    task.completedAt = Date.now();
    if (this.activeTaskId === id) this.activeTaskId = null;

    for (const m of task.members) {
      m.state = "done";
      const rec = this.housemates.get(m.key);
      if (rec) {
        rec.state = "idle";
        void this.housemates.abortSession(rec.sessionId).catch(() => undefined);
      }
      this.store.ingest({
        harness: "opencode",
        sessionId: m.sessionId,
        type: "collab_completed",
        state: "idle",
      });
    }

    const cancelMsg = `Itinigil ang Lingguhang Hamon "${task.goal.slice(0, 40)}".`;
    this.announce(cancelMsg);
    task.log.push({ agent: "kuya", name: "Kuya", text: `❌ CANCELED: ${cancelMsg}`, ts: Date.now() });
    return true;
  }

  approveTask(id: string): CollabTask {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Collaboration task not found");
    task.status = "done";
    task.completedAt = Date.now();
    task.currentStep = "done";
    if (this.activeTaskId === id) this.activeTaskId = null;

    for (const m of task.members) {
      m.state = "done";
      const rec = this.housemates.get(m.key);
      if (rec) {
        rec.state = "idle";
        void this.housemates.dismissCall(m.key).catch(() => undefined);
      }
      this.store.ingest({
        harness: "opencode",
        sessionId: m.sessionId,
        type: "collab_completed",
        state: "idle",
      });
    }

    const winMsg = `Inaprubahan at minarkahang TAPOS ni Kuya ang Lingguhang Hamon "${task.goal.slice(0, 40)}"! Mabuhay ang team! 🎉`;
    this.announce(winMsg);
    task.log.push({ agent: "kuya", name: "Kuya", text: `✅ APPROVED BY KUYA: ${winMsg}`, ts: Date.now() });
    audit("kuya", "collab_approved", task.id, { goal: task.goal });
    return task;
  }

  /** Handles unexpected errors, rate limits (429), or token exhaustion from an OpenCode housemate */
  async handleSessionError(sessionId: string, errorText: string): Promise<boolean> {
    const task = this.getActiveTask();
    if (!task || (task.status !== "running" && task.status !== "blocked")) return false;
    const member = task.members.find((m) => m.sessionId === sessionId);
    if (!member) return false;

    const cleanError = errorText.trim() || "Unknown error occurred";
    member.state = "error";
    member.lastError = cleanError;

    const rec = this.housemates.get(member.key);
    if (rec) {
      rec.state = "error";
      rec.lastError = cleanError;
      rec.errorTimestamp = Date.now();
      rec.currentAction = `Error: ${cleanError.slice(0, 60)}`;
    }

    let errorCategory = "Agent Execution Error";
    if (/rate\s*limit|429/i.test(cleanError)) {
      errorCategory = "Rate Limit Reached (HTTP 429)";
    } else if (/token|quota|credit|balance|exhaust/i.test(cleanError)) {
      errorCategory = "Out of Tokens / Quota Exceeded";
    } else if (/timeout/i.test(cleanError)) {
      errorCategory = "Request Timeout";
    }

    this.announce(`⚠️ May problema kay ${member.name} (${member.agent}): [${errorCategory}] ${cleanError}`);
    task.log.push({
      agent: "kuya",
      name: "Kuya",
      text: `🛑 AGENT ERROR [${member.name} - ${member.agent}]:\nCategory: ${errorCategory}\nDetails: ${cleanError}\n\n💡 Paalala ni Kuya: Maaaring nag-rate limit ang provider o naubusan ng libreng tokens. Gamitin ang Retry button o magpalit ng model sa housemate summoner.`,
      ts: Date.now(),
    });

    this.store.ingest({
      harness: "opencode",
      sessionId: member.sessionId,
      type: "error",
      state: "error",
      error: cleanError,
      currentAction: `Error: ${errorCategory}`,
    });

    const activeBuilders = task.members.filter((m) => !m.isVerifier);
    const allBuildersErrored = activeBuilders.every(
      (b) => b.state === "error" || b.state === "blocked" || b.state === "done",
    );
    if (allBuildersErrored && activeBuilders.some((b) => b.state === "error")) {
      task.status = "blocked";
      task.currentStep = "blocked";
      this.announce(`🛑 Nahinto ang Lingguhang Hamon dahil nagka-error ang housemate. Maaari itong i-retry ni Kuya.`);
    }

    return true;
  }

  async retryTask(id: string, feedback?: string): Promise<CollabTask> {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Collaboration task not found");

    task.maxAttempts = Math.max(task.maxAttempts + 1, task.attempt + 1);
    task.status = "running";
    this.activeTaskId = id;

    const builder = task.members.find((m) => !m.isVerifier) || task.members[0];
    task.activeMemberKey = builder.key;
    task.currentStep = "building";

    // Dismiss builder from confession if called
    await this.housemates.dismissCall(builder.key).catch(() => undefined);

    for (const m of task.members) {
      delete m.lastError;
      const isWorking = m.key === builder.key;
      m.state = isWorking ? "working" : "standby";
      const rec = this.housemates.get(m.key);
      if (rec) {
        delete rec.lastError;
        delete rec.errorTimestamp;
        rec.state = isWorking ? "working" : "standby";
        rec.currentAction = isWorking ? "Working on task" : "standby";
      }
      this.store.ingest({
        harness: "opencode",
        sessionId: m.sessionId,
        type: "collab_step",
        state: isWorking ? "working" : "standby",
        title: isWorking
          ? `[Lingguhang Hamon Retry] ${m.name} Fixing (${task.attempt}/${task.maxAttempts})`
          : `[Lingguhang Hamon] ${m.name} Standby`,
      });
    }

    // If task is in Rush Mode, resume parallel builders
    if (task.rushMode && task.subtasks && task.subtasks.length > 0) {
      const unfinished = task.subtasks.filter((s) => !s.completed);
      const targetSubtasks = unfinished.length > 0 ? unfinished : task.subtasks;
      for (const st of targetSubtasks) {
        st.completed = false;
        const b = task.members.find((m) => m.key === st.memberKey);
        if (b) {
          b.state = "working";
          const rec = this.housemates.get(b.key);
          if (rec) {
            delete rec.lastError;
            delete rec.errorTimestamp;
            rec.state = "working";
            rec.currentAction = "Working on subtask";
          }
          await this.promptRushBuilder(task, b, st);
        }
      }
      const rushRetryNotice = `Binuksan muli ni Kuya ang Rush Mode Lingguhang Hamon! Lahat ng builders ay muling nagtatrabaho nang sabay-sabay!`;
      this.announce(rushRetryNotice);
      task.log.push({
        agent: "kuya",
        name: "Kuya",
        text: `🔄 RUSH MODE RETRY AUTHORIZED BY KUYA: ${rushRetryNotice}${feedback ? `\nKuya's Guidance: ${feedback}` : ""}`,
        ts: Date.now(),
      });
      return task;
    }

    const retryNotice = `Binuksan muli ni Kuya ang Lingguhang Hamon para sa bagong attempt (${task.attempt}/${task.maxAttempts})! ${builder.name}, simulan ang pag-ayos!`;
    this.announce(retryNotice);
    task.log.push({
      agent: "kuya",
      name: "Kuya",
      text: `🔄 RETRY AUTHORIZED BY KUYA: ${retryNotice}${feedback ? `\nKuya's Guidance: ${feedback}` : ""}`,
      ts: Date.now(),
    });

    await this.promptActiveMember(
      task,
      builder,
      feedback ? `Kuya's Guidance for this retry:\n${feedback}` : undefined,
    );

    return task;
  }

  async followupTask(id: string, message: string, targetKey?: string): Promise<CollabTask> {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Collaboration task not found");
    const cleanMsg = message.trim();
    if (!cleanMsg) throw new Error("Follow-up message cannot be empty");

    task.status = "running";
    this.activeTaskId = id;

    let targetMember = targetKey ? task.members.find((m) => m.key === targetKey) : undefined;
    if (!targetMember) {
      targetMember = task.members.find((m) => !m.isVerifier) || task.members[0];
    }

    task.activeMemberKey = targetMember.key;
    task.currentStep = targetMember.isVerifier ? "verifying" : "building";

    // Dismiss target from confession room if currently called
    await this.housemates.dismissCall(targetMember.key).catch(() => undefined);

    for (const m of task.members) {
      delete m.lastError;
      const isWorking = m.key === targetMember.key;
      m.state = isWorking ? "working" : "standby";
      const rec = this.housemates.get(m.key);
      if (rec) {
        delete rec.lastError;
        delete rec.errorTimestamp;
        rec.state = isWorking ? "working" : "standby";
      }
      this.store.ingest({
        harness: "opencode",
        sessionId: m.sessionId,
        type: "collab_step",
        state: isWorking ? "working" : "standby",
        title: isWorking
          ? `[Lingguhang Hamon] ${m.name} Follow-up`
          : `[Lingguhang Hamon] ${m.name} Standby`,
      });
    }

    const note = `May bagong bilin si Kuya para kay ${targetMember.name}: "${cleanMsg}"`;
    this.announce(note);
    task.log.push({
      agent: "kuya",
      name: "Kuya",
      text: `📝 KUYA'S FOLLOW-UP:\n${cleanMsg}`,
      ts: Date.now(),
    });

    const client = this.supervisor.client;
    if (client) {
      const rec = this.housemates.get(targetMember.key);
      if (rec) {
        const fullPrompt = [
          `[KUYA'S FOLLOW-UP INSTRUCTION - LINGGUHANG HAMON]`,
          `Task Goal: ${task.goal}`,
          `New Instruction from Kuya:`,
          cleanMsg,
          ``,
          `Please proceed to address Kuya's request in the codebase.`,
          `When complete, summarize your changes and report back.`,
        ].join("\n");

        void client
          .promptAsync(rec.sessionId, rec.directory, {
            message: fullPrompt,
            agent: rec.agent,
            model: {
              providerID: rec.provider,
              modelID: rec.model,
              ...(rec.variant ? { variant: rec.variant } : {}),
            },
          })
          .catch((err: unknown) => {
            log(`collab: promptAsync followup failed for ${targetMember.name}: ${String(err)}`);
          });
      }
    }

    return task;
  }
}
