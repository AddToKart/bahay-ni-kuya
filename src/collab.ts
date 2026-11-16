// CollabManager: Multi-housemate collaboration ("Lingguhang Hamon")
// Coordinates up to 4 OpenCode housemates in an autonomous test-fix pipeline:
// Developer/Coder -> Tester/QA -> Self-Healing Retry Loop -> Kuya Circuit Breaker.

import { audit } from "./audit";
import { log } from "./log";
import type { Store } from "./store";
import type { Housemates, HousemateRec } from "./housemates";
import type { OpenCodeSupervisor } from "./opencode-supervisor";

export type CollabRole = "coder" | "tester" | "frontend" | "reviewer";

export interface CollabMemberInput {
  key: string;
  role: CollabRole;
}

export interface CollabMember {
  key: string;
  name: string;
  role: CollabRole;
  state: "standby" | "working" | "blocked" | "done";
  sessionId: string;
}

export interface CollabTask {
  id: string;
  goal: string;
  cwd: string;
  members: CollabMember[];
  currentStep: "coding" | "testing" | "reviewing" | "done" | "blocked";
  activeMemberKey: string;
  attempt: number;
  maxAttempts: number;
  lastHandoffReport: string;
  createdAt: number;
  completedAt?: number;
  status: "running" | "done" | "failed" | "blocked" | "canceled";
  log: Array<{ role: string; name: string; text: string; ts: number }>;
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

    // Validate members exist
    const resolvedMembers: CollabMember[] = [];
    for (const m of input.members) {
      const rec = this.housemates.get(m.key);
      if (!rec) throw new Error(`Housemate not found: ${m.key}`);
      resolvedMembers.push({
        key: rec.key,
        name: rec.name,
        role: m.role || "coder",
        state: "standby",
        sessionId: rec.sessionId,
      });
    }

    // Ensure we have at least one tester/reviewer role
    let hasTester = resolvedMembers.some((m) => m.role === "tester" || m.role === "reviewer");
    if (!hasTester) {
      // Designate the last housemate as tester
      resolvedMembers[resolvedMembers.length - 1].role = "tester";
    }

    // Find the primary coder (first non-tester)
    const coder = resolvedMembers.find((m) => m.role !== "tester") || resolvedMembers[0];
    const taskId = `collab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const cwd = input.cwd || this.housemates.get(coder.key)?.directory || process.cwd();

    const task: CollabTask = {
      id: taskId,
      goal,
      cwd,
      members: resolvedMembers,
      currentStep: "coding",
      activeMemberKey: coder.key,
      attempt: 1,
      maxAttempts: input.maxAttempts && input.maxAttempts > 0 ? input.maxAttempts : 3,
      lastHandoffReport: "",
      createdAt: Date.now(),
      status: "running",
      log: [],
    };

    this.tasks.set(taskId, task);
    this.activeTaskId = taskId;

    // Set desk standby for all members; coder becomes working
    for (const m of resolvedMembers) {
      const isCoder = m.key === coder.key;
      m.state = isCoder ? "working" : "standby";
      const rec = this.housemates.get(m.key);
      if (rec) {
        rec.state = isCoder ? "working" : "standby";
      }
      this.store.ingest({
        harness: "opencode",
        sessionId: m.sessionId,
        type: "collab_step",
        state: isCoder ? "working" : "standby",
        title: isCoder
          ? `[Lingguhang Hamon] ${m.name} (${m.role}): ${goal.slice(0, 40)}`
          : `[Lingguhang Hamon] ${m.name} Standby (${m.role})`,
        directory: cwd,
      });
    }

    const memberSummary = resolvedMembers.map((m) => `${m.name} (${m.role})`).join(", ");
    this.announce(`Pakinggan ang inyong bagong Lingguhang Hamon: "${goal}". Team: ${memberSummary}`);

    audit("kuya", "collab_start", taskId, {
      goal,
      members: memberSummary,
    });

    // Prompt the first coder to begin implementation
    await this.promptActiveMember(task, coder);

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

  /** Dispatches an OpenCode prompt to the active member */
  private async promptActiveMember(task: CollabTask, member: CollabMember, extraPrompt?: string): Promise<void> {
    const client = this.supervisor.client;
    if (!client) throw new Error("opencode supervisor not ready");

    const rec = this.housemates.get(member.key);
    if (!rec) return;

    const teamList = task.members.map((m) => `- ${m.name} (Role: ${m.role})`).join("\n");
    let message = "";

    if (member.role === "tester") {
      message = [
        `[KUYA'S LINGGUHANG HAMON - VERIFICATION STEP (Attempt ${task.attempt}/${task.maxAttempts})]`,
        `Overall Mission Goal: ${task.goal}`,
        `Team Roster:`,
        teamList,
        ``,
        `Recent Handoff Report from Developer:`,
        task.lastHandoffReport || "(None provided)",
        ``,
        `Instructions for ${member.name} (Tester / QA):`,
        `1. Inspect the codebase changes in this project.`,
        `2. Run tests (e.g. bun test, npm test, or whatever verification scripts apply).`,
        `3. If all tests PASS and feature is verified, end your response with:`,
        `   VERIFICATION_PASSED: <summary of tests run and verified>`,
        `4. If any tests FAIL or bugs are found, end your response with:`,
        `   VERIFICATION_FAILED: <exact error message, failing file, and description of the bug>`,
      ].join("\n");
    } else {
      // Coder / Developer
      const retryContext =
        task.attempt > 1
          ? `[BUG FIX ROUND ${task.attempt}/${task.maxAttempts}]\nThe tester found the following issues:\n${extraPrompt || task.lastHandoffReport}\n`
          : "";

      message = [
        `[KUYA'S LINGGUHANG HAMON - COLLABORATION TASK]`,
        `Overall Mission Goal: ${task.goal}`,
        `Your Role: ${member.role}`,
        `Team Roster:`,
        teamList,
        ``,
        retryContext,
        `Instructions for ${member.name}:`,
        `Work directly in this repository to implement your part of the mission.`,
        `When complete, provide a concise handoff summary describing:`,
        `- What files you modified or created.`,
        `- What features or fixes were implemented.`,
        `- Instructions for what the next housemate (Tester/QA) should verify.`,
      ].join("\n");
    }

    task.log.push({ role: member.role, name: member.name, text: message.slice(0, 300), ts: Date.now() });

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
        log(`collab: promptAsync failed for ${member.name}: ${String(err)}`);
      });
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
    task.log.push({ role: activeMember.role, name: activeMember.name, text: reply, ts: Date.now() });

    // Step 1: Was active member a Developer / Coder? -> Handoff to Tester
    if (activeMember.role !== "tester") {
      task.lastHandoffReport = reply;
      const tester = task.members.find((m) => m.role === "tester") || task.members[task.members.length - 1];

      this.announce(`Natapos na ni ${activeMember.name} ang kanyang bahagi. Handoff kay ${tester.name} para sa pagsusuri!`);

      // Switch active member to tester
      activeMember.state = "standby";
      if (rec) rec.state = "standby";
      this.store.ingest({
        harness: "opencode",
        sessionId: activeMember.sessionId,
        type: "collab_step",
        state: "standby",
        title: `[Hamon] ${activeMember.name} Standby`,
      });

      tester.state = "working";
      const testerRec = this.housemates.get(tester.key);
      if (testerRec) testerRec.state = "working";
      task.activeMemberKey = tester.key;
      task.currentStep = "testing";

      this.store.ingest({
        harness: "opencode",
        sessionId: tester.sessionId,
        type: "collab_step",
        state: "working",
        title: `[Hamon] ${tester.name} Testing & Verification`,
      });

      await this.promptActiveMember(task, tester);
      return true;
    }

    // Step 2: Was active member the Tester? -> Check if verification passed or failed
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

      this.announce(`Tagumpay ang inyong Lingguhang Hamon! Lahat ng tests ay pumasa. Mahusay, mga housemates! 🎉`);
      audit("kuya", "collab_done", task.id, { goal: task.goal, attempts: task.attempt });
      return true;
    }

    // Verification failed! Self-healing loop trigger
    task.attempt++;
    if (task.attempt <= task.maxAttempts) {
      const coder = task.members.find((m) => m.role !== "tester") || task.members[0];
      this.announce(
        `May nakitang problema si ${activeMember.name} sa pagsusuri (Attempt ${task.attempt}/${task.maxAttempts}). ${coder.name}, ayusin ang mga bugs!`,
      );

      // Tester goes back to standby, coder wakes up to fix bugs
      activeMember.state = "standby";
      if (rec) rec.state = "standby";
      this.store.ingest({
        harness: "opencode",
        sessionId: activeMember.sessionId,
        type: "collab_step",
        state: "standby",
        title: `[Hamon] ${activeMember.name} Standby`,
      });

      coder.state = "working";
      const coderRec = this.housemates.get(coder.key);
      if (coderRec) coderRec.state = "working";
      task.activeMemberKey = coder.key;
      task.currentStep = "coding";

      this.store.ingest({
        harness: "opencode",
        sessionId: coder.sessionId,
        type: "collab_step",
        state: "working",
        title: `[Hamon] ${coder.name} Fixing Bugs (Round ${task.attempt})`,
      });

      await this.promptActiveMember(task, coder, reply);
      return true;
    }

    // 🚨 Kuya Circuit Breaker: Max attempts exceeded!
    task.status = "blocked";
    task.currentStep = "blocked";
    const coder = task.members.find((m) => m.role !== "tester") || task.members[0];

    coder.state = "blocked";
    const coderRec = this.housemates.get(coder.key);
    if (coderRec) coderRec.state = "blocked";

    this.store.ingest({
      harness: "opencode",
      sessionId: coder.sessionId,
      type: "blocked",
      state: "blocked",
      error: `Circuit breaker tripped: ${task.maxAttempts} failed verification attempts`,
    });

    this.announce(
      `Pansamantalang nahinto ang Lingguhang Hamon dahil lumagpas sa ${task.maxAttempts} retry attempts. ${coder.name}, pumunta ka sa Confession Room!`,
    );

    // Call the coder to the Confession Room so Kuya can talk to them
    await this.housemates
      .call(
        coder.key,
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

    this.announce(`Itinigil ang Lingguhang Hamon "${task.goal.slice(0, 40)}".`);
    return true;
  }
}
