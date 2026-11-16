// CollabManager: Multi-housemate collaboration ("Lingguhang Hamon")
// Coordinates up to 4 OpenCode housemates using their actual OpenCode agents
// (e.g. custom agents like "tester", "build", "qa", etc.) in an autonomous test-fix pipeline:
// Builder/Coder -> Tester/Verifier -> Self-Healing Retry Loop -> Kuya Circuit Breaker.

import { audit } from "./audit";
import { log } from "./log";
import type { Store } from "./store";
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
  state: "standby" | "working" | "blocked" | "done";
  sessionId: string;
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
}

export class CollabManager {
  private tasks = new Map<string, CollabTask>();
  private activeTaskId: string | null = null;
  onAnnounce?: (line: string) => void;

  constructor(
    private store: Store,
    private housemates: Housemates,
    private supervisor: OpenCodeSupervisor,
  ) {}

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
    if (!task || task.status !== "running") return null;
    const member = task.members.find((m) => m.sessionId === sessionId);
    if (!member) return null;
    return member.state === "working" ? "working" : "standby";
  }

  /** Starts a multi-agent collaboration task with up to 4 housemates */
  async startTask(input: {
    goal: string;
    cwd?: string;
    members: CollabMemberInput[];
    maxAttempts?: number;
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

    // The primary builder is the first non-verifier (or the first member)
    const primaryBuilder = resolvedMembers.find((m) => !m.isVerifier) || resolvedMembers[0];
    const taskId = `collab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const cwd = input.cwd || this.housemates.get(primaryBuilder.key)?.directory || process.cwd();

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
    };

    this.tasks.set(taskId, task);
    this.activeTaskId = taskId;

    // Set desk standby for all members; primary builder becomes working
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

    const memberSummary = resolvedMembers.map((m) => `${m.name} [agent: ${m.agent}]`).join(", ");
    const startMsg = `Pakinggan ang inyong bagong Lingguhang Hamon: "${goal}". Team: ${memberSummary}`;
    this.announce(startMsg);
    task.log.push({ agent: "kuya", name: "Kuya", text: `📢 HAMON STARTED: "${goal}"\nTeam: ${memberSummary}`, ts: Date.now() });

    audit("kuya", "collab_start", taskId, {
      goal,
      members: memberSummary,
    });

    // Prompt the primary builder to start
    await this.promptActiveMember(task, primaryBuilder);

    return task;
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
        log(`collab: promptAsync failed for ${member.name}: ${String(err)}`);
      });
  }

  /**
   * Called when a housemate's turn reaches idle.
   * Handles handoff, verification pass/fail, and retry loops.
   */
  async handleSessionIdle(sessionId: string, replyText: string): Promise<boolean> {
    const task = this.getActiveTask();
    if (!task || task.status !== "running") return false;

    const activeMember = task.members.find((m) => m.key === task.activeMemberKey);
    if (!activeMember || activeMember.sessionId !== sessionId) {
      return false;
    }

    const rec = this.housemates.get(activeMember.key);
    let reply = replyText.trim();
    if (!reply && rec) {
      reply = await this.getLastAssistantMessage(sessionId, rec.directory);
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
      const isWorking = m.key === builder.key;
      m.state = isWorking ? "working" : "standby";
      const rec = this.housemates.get(m.key);
      if (rec) rec.state = isWorking ? "working" : "standby";
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
      const isWorking = m.key === targetMember.key;
      m.state = isWorking ? "working" : "standby";
      const rec = this.housemates.get(m.key);
      if (rec) rec.state = isWorking ? "working" : "standby";
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
