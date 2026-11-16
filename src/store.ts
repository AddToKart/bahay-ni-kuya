import {
  HARNESSES,
  HARD_TTL_MS,
  IDLE_MS,
  STALE_MS,
  type ChatLine,
  type Harness,
  type HarnessView,
  type IngestEvent,
  type QuestionView,
  type SessionState,
  type SessionView,
  type Snapshot,
} from "./types";
import { matchHarness, type ProcInfo } from "./scan";
import { ConfessionQueue, MAX_QUESTION_TEXT } from "./questions";

interface SessionRec {
  harness: Harness;
  sessionId: string;
  parentId: string | null;
  state?: SessionState;
  title?: string;
  tool?: string;
  directory?: string;
  pid?: number;
  workingUntil: number;
  lastEventTs: number;
  since: number;
  source: "adapter" | "scan";
  errorCount: number;
  nominated?: boolean;
  housemateKey?: string;
  guest?: boolean;
}

interface HarnessState {
  installed: boolean;
  running: boolean;
  procs: number;
  pids: number[];
  cpuPrev: Map<number, number>;
}

const clip = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined;

const keyOf = (harness: Harness, sessionId: string) => `${harness}\u0000${sessionId}`;

/** Held states persist until their paired end event (no idle decay). */
const HOLD = Number.MAX_SAFE_INTEGER;
const CHAT_MAX = 200;
const HELD_STATES: Record<string, true> = {
  arriving: true,
  evicting: true,
  queued_for_confession: true,
  in_confession: true,
  called: true,
};

export class Store {
  private sessions = new Map<string, SessionRec>();
  private harnesses = new Map<Harness, HarnessState>();
  private questions = new ConfessionQueue();
  private chat: ChatLine[] = [];

  constructor() {
    for (const harness of HARNESSES) {
      this.harnesses.set(harness, {
        installed: false,
        running: false,
        procs: 0,
        pids: [],
        cpuPrev: new Map(),
      });
    }
  }

  setInstalled(installed: Record<Harness, boolean>): void {
    for (const harness of HARNESSES) {
      this.harnesses.get(harness)!.installed = installed[harness] === true;
    }
  }

  ingest(event: IngestEvent, now = Date.now()): { ok: boolean; reason?: string } {
    if (!event || typeof event !== "object") return { ok: false, reason: "body must be an object" };
    const type = event.type;
    const validTypes = [
      "session_start",
      "session_end",
      "state",
      "tool",
      "error",
      "task_started",
      "task_completed",
      "blocked",
      "subagent_started",
      "subagent_ended",
      "housemate_summoned",
      "housemate_arrived",
      "housemate_evict_started",
      "housemate_evicted",
      "question_asked",
      "question_answered",
      "kuya_call",
      "kuya_call_ended",
      "chat_message",
      "guest_arrived",
      "guest_left",
    ];
    if (!validTypes.includes(type)) {
      return { ok: false, reason: `bad type: ${String(type)}` };
    }

    // question_answered is the only event that may omit harness/sessionId: resolve from the queue.
    if (type === "question_answered") {
      const id = clip(event.id, 80);
      if (!id) return { ok: false, reason: "question_answered requires id" };
      if (!this.questions.get(id)) return { ok: false, reason: `unknown question: ${id}` };
      const result = this.answerQuestion(id, { option: event.option, text: event.text });
      return result.ok ? { ok: true } : { ok: false, reason: result.reason };
    }

    let harness = event.harness as Harness;
    if (!HARNESSES.includes(harness)) return { ok: false, reason: `unknown harness: ${String(event.harness)}` };

    let sessionId = clip(event.sessionId, 160);
    if (!sessionId) {
      sessionId =
        clip(event.housemateKey, 160) ?? clip(event.guestKey, 160) ?? clip(event.id, 160);
    }
    if (type === "housemate_summoned") sessionId = clip(event.housemateKey, 160) ?? sessionId;
    if (type === "guest_arrived" || type === "guest_left") {
      sessionId = clip(event.guestKey, 160) ?? sessionId;
    }
    if (!sessionId) return { ok: false, reason: "sessionId required" };

    if (
      type === "session_end" ||
      type === "subagent_ended" ||
      type === "housemate_evicted" ||
      type === "guest_left"
    ) {
      this.deleteTree(harness, sessionId);
      return { ok: true };
    }

    const key = keyOf(harness, sessionId);
    let rec = this.sessions.get(key);
    if (!rec) {
      rec = {
        harness,
        sessionId,
        parentId: null,
        workingUntil: 0,
        lastEventTs: now,
        since: now,
        source: "adapter",
        errorCount: 0,
      };
      this.sessions.set(key, rec);
    }

    let parentId = clip(event.parentSessionId, 160);
    if (type === "guest_arrived") parentId = clip(event.hostKey, 160) ?? parentId;
    if (parentId && parentId !== sessionId) rec.parentId = parentId;
    const title = clip(event.title, 80);
    if (title) rec.title = title;
    const name = clip(event.name, 80);
    if (name) rec.title = name;
    const directory = clip(event.directory, 200);
    if (directory) rec.directory = directory;
    const housemateKey = clip(event.housemateKey, 80);
    if (housemateKey) rec.housemateKey = housemateKey;
    if (type === "housemate_summoned" && !rec.housemateKey) rec.housemateKey = sessionId;
    if (type === "guest_arrived") rec.guest = true;

    if (type === "session_start" || type === "subagent_started") {
      rec.state = event.state ?? (rec.parentId ? "working" : "idle");
      rec.workingUntil = rec.state === "working" ? now + IDLE_MS : 0;
    } else if (type === "task_started") {
      rec.state = "working";
      rec.workingUntil = now + IDLE_MS;
    } else if (type === "task_completed") {
      rec.state = "idle";
      rec.workingUntil = 0;
      rec.tool = undefined;
    } else if (type === "blocked") {
      rec.state = "blocked";
      rec.workingUntil = now + 60_000;
    } else if (type === "error") {
      rec.state = "error";
      rec.errorCount = (rec.errorCount || 0) + 1;
      if (rec.errorCount >= 3) rec.nominated = true;
      rec.workingUntil = now + IDLE_MS;
    } else if (type === "state") {
      rec.state = event.state ?? "idle";
      rec.workingUntil = rec.state === "working" ? now + IDLE_MS : 0;
    } else if (type === "tool") {
      const tool = clip(event.tool, 60);
      if (tool) rec.tool = tool;
      rec.state = "working";
      rec.workingUntil = now + IDLE_MS;
    } else if (type === "housemate_summoned") {
      rec.state = "arriving";
      rec.workingUntil = HOLD;
      rec.source = "adapter";
    } else if (type === "housemate_arrived") {
      rec.state = "idle";
      rec.workingUntil = 0;
    } else if (type === "housemate_evict_started") {
      rec.state = "evicting";
      rec.workingUntil = HOLD;
      if (event.reason) rec.title = clip(event.title ?? rec.title, 80);
    } else if (type === "kuya_call") {
      rec.state = "called";
      rec.workingUntil = HOLD;
    } else if (type === "kuya_call_ended") {
      rec.state = "idle";
      rec.workingUntil = 0;
    } else if (type === "question_asked") {
      const id = clip(event.id, 80);
      const kind = event.kind;
      const text = clip(event.text, MAX_QUESTION_TEXT);
      if (!id || !kind || !text) {
        return { ok: false, reason: "question_asked requires id, kind, text" };
      }
      if (!["permission", "question", "choice", "text"].includes(kind)) {
        return { ok: false, reason: `bad question kind: ${String(kind)}` };
      }
      if (kind === "choice" && (!Array.isArray(event.options) || event.options.length === 0)) {
        return { ok: false, reason: "choice questions require options" };
      }
      const question = this.questions.ask({
        id,
        harness,
        sessionId,
        housemateKey: rec.housemateKey,
        kind,
        text,
        options: event.options,
        now,
      });
      rec.state = question.status === "in_confession" ? "in_confession" : "queued_for_confession";
      rec.workingUntil = HOLD;
    } else if (type === "chat_message") {
      const text = clip(event.text, 400);
      const role = event.role === "kuya" ? "kuya" : "housemate";
      if (text) {
        this.chat.push({ sessionId, role, text, ts: now });
        if (this.chat.length > CHAT_MAX) this.chat = this.chat.slice(-CHAT_MAX);
      }
    } else if (type === "guest_arrived") {
      rec.state = "working";
      rec.workingUntil = HOLD;
      rec.guest = true;
      if (!rec.title) rec.title = "guest";
    }

    rec.lastEventTs = now;
    this.harnesses.get(harness)!.running = true;
    for (const [key, scanRec] of this.sessions) {
      if (scanRec.harness === harness && scanRec.source === "scan") this.sessions.delete(key);
    }
    return { ok: true };
  }

  /** Resolve a question and move the queue chair to the next asker. */
  answerQuestion(
    id: string,
    answer: { option?: number; text?: string },
  ): { ok: boolean; reason?: string; promoted?: QuestionView } {
    const result = this.questions.answer(id, answer, Date.now());
    if (!result.ok) return { ok: false, reason: `unknown or already answered question: ${id}` };
    this.applyQuestionState(result.question!, "idle");
    if (result.promoted) this.applyQuestionState(result.promoted, "in_confession");
    return { ok: true, promoted: result.promoted ?? undefined };
  }

  /** Skip (re-queue) a question; returns the promoted next asker, if any. */
  skipQuestion(id: string): { ok: boolean; promoted?: QuestionView } {
    const promoted = this.questions.skip(id);
    if (promoted) this.applyQuestionState(promoted, "in_confession");
    return { ok: true, promoted: promoted ?? undefined };
  }

  private applyQuestionState(question: QuestionView, state: SessionState): void {
    const rec = this.sessions.get(keyOf(question.harness as Harness, question.sessionId));
    if (!rec) return;
    rec.state = state;
    rec.workingUntil = state === "in_confession" ? HOLD : 0;
  }

  applyScan(procs: ProcInfo[], now = Date.now()): void {
    // 1. Identify all processes matching any harness
    const matchedWithHarness: { proc: ProcInfo; harness: Harness }[] = [];
    for (const proc of procs) {
      const harness = matchHarness(proc);
      if (harness) matchedWithHarness.push({ proc, harness });
    }

    // Set of all matched PIDs across all harnesses
    const matchedPids = new Set(matchedWithHarness.map((m) => m.proc.pid));

    // Deduplication: count only top-level matched processes.
    // A matched process whose parent is also matched is a worker/child, NOT a new instance.
    const topLevelMatches = matchedWithHarness.filter((m) => !matchedPids.has(m.proc.ppid));

    // Group top-level processes by harness
    const byHarness = new Map<Harness, ProcInfo[]>();
    for (const { proc, harness } of topLevelMatches) {
      const list = byHarness.get(harness);
      if (list) list.push(proc);
      else byHarness.set(harness, [proc]);
    }

    // Map children under their top-level ancestor to sum CPU time
    const childrenCpu = new Map<number, number>();
    for (const { proc } of matchedWithHarness) {
      if (matchedPids.has(proc.ppid)) {
        childrenCpu.set(proc.ppid, (childrenCpu.get(proc.ppid) ?? 0) + proc.cpuMs);
      }
    }

    for (const harness of HARNESSES) {
      const state = this.harnesses.get(harness)!;
      const list = byHarness.get(harness) ?? [];
      state.procs = list.length;
      state.running = list.length > 0;
      state.pids = list.map((proc) => proc.pid);

      const nextCpu = new Map<number, number>();
      for (const proc of list) {
        const totalCpu = proc.cpuMs + (childrenCpu.get(proc.pid) ?? 0);
        const previous = state.cpuPrev.get(proc.pid);
        const delta = previous === undefined ? 0 : Math.max(0, totalCpu - previous);
        nextCpu.set(proc.pid, totalCpu);
        proc.working = delta > 400;
      }
      state.cpuPrev = nextCpu;

      if (!state.running) {
        this.dropHarnessSessions(harness);
        continue;
      }

      const hasAdapterSessions = [...this.sessions.values()].some(
        (rec) => rec.harness === harness && rec.source === "adapter",
      );
      if (hasAdapterSessions) {
        for (const [key, rec] of this.sessions) {
          if (rec.harness === harness && rec.source === "scan") this.sessions.delete(key);
        }
        continue;
      }

      const wanted = new Set(list.map((proc) => `scan:${proc.pid}`));
      for (const [key, rec] of this.sessions) {
        if (rec.harness === harness && rec.source === "scan" && !wanted.has(rec.sessionId)) {
          this.sessions.delete(key);
        }
      }
      for (const proc of list) {
        const sessionId = `scan:${proc.pid}`;
        const key = keyOf(harness, sessionId);
        let rec = this.sessions.get(key);
        if (!rec) {
          rec = {
            harness,
            sessionId,
            parentId: null,
            title: `${harness}`,
            pid: proc.pid,
            workingUntil: 0,
            lastEventTs: now,
            since: now,
            source: "scan",
          };
          this.sessions.set(key, rec);
        }
        rec.pid = proc.pid;
        rec.lastEventTs = now;
        rec.workingUntil = proc.working ? now + IDLE_MS : 0;
      }
    }
  }

  sweep(now = Date.now()): void {
    for (const [key, rec] of this.sessions) {
      const hardExpired = now - rec.lastEventTs > HARD_TTL_MS;
      const staleWithoutProcess =
        rec.source === "adapter" && now - rec.lastEventTs > STALE_MS && !this.harnesses.get(rec.harness)!.running;
      if (hardExpired || staleWithoutProcess) this.sessions.delete(key);
    }
  }

  snapshot(now = Date.now()): Snapshot {
    const sessions: SessionView[] = [];
    for (const rec of this.sessions.values()) {
      let state: SessionState = "idle";
      if (HELD_STATES[rec.state ?? ""] === true) {
        state = rec.state as SessionState;
      } else if (rec.state === "blocked") {
        state = now < rec.workingUntil ? "blocked" : "idle";
      } else if (rec.state === "error") {
        state = now < rec.workingUntil ? "error" : "idle";
      } else {
        state = now < rec.workingUntil ? "working" : "idle";
      }

      sessions.push({
        harness: rec.harness,
        sessionId: rec.sessionId,
        parentId: rec.parentId,
        state,
        title: rec.title,
        tool: rec.tool,
        directory: rec.directory,
        pid: rec.pid,
        since: rec.since,
        lastEventTs: rec.lastEventTs,
        source: rec.source,
        errorCount: rec.errorCount,
        nominated: rec.nominated,
        housemateKey: rec.housemateKey,
        guest: rec.guest,
      });
    }
    sessions.sort((a, b) => {
      if (a.harness !== b.harness) return a.harness.localeCompare(b.harness);
      const childOrder = (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0);
      if (childOrder !== 0) return childOrder;
      if (a.since !== b.since) return a.since - b.since;
      return a.sessionId.localeCompare(b.sessionId);
    });

    const harnesses: HarnessView[] = HARNESSES.map((name) => {
      const state = this.harnesses.get(name)!;
      return { name, installed: state.installed, running: state.running, procs: state.procs };
    });

    return {
      type: "snapshot",
      ts: now,
      harnesses,
      sessions,
      questions: this.questions.list(now),
      chat: [...this.chat],
    };
  }

  private deleteTree(harness: Harness, sessionId: string): void {
    const rootKey = keyOf(harness, sessionId);
    if (!this.sessions.has(rootKey)) {
      this.dropQuestionsFor(sessionId);
      return;
    }
    const doomed = new Set<string>([rootKey]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [key, rec] of this.sessions) {
        if (rec.harness !== harness || doomed.has(key) || !rec.parentId) continue;
        if (doomed.has(keyOf(harness, rec.parentId))) {
          doomed.add(key);
          grew = true;
        }
      }
    }
    for (const key of doomed) {
      const rec = this.sessions.get(key);
      if (rec) this.dropQuestionsFor(rec.sessionId);
      this.sessions.delete(key);
    }
  }

  /** Remove all questions for a dead session; promote the next asker if the chair freed. */
  private dropQuestionsFor(sessionId: string): void {
    const promoted = this.questions.drop(sessionId);
    if (promoted) this.applyQuestionState(promoted, "in_confession");
  }

  private dropHarnessSessions(harness: Harness): void {
    for (const [key, rec] of this.sessions) {
      if (rec.harness === harness) this.sessions.delete(key);
    }
  }
}
