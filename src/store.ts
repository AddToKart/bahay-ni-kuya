import {
  HARNESSES,
  HARD_TTL_MS,
  IDLE_MS,
  STALE_MS,
  type Harness,
  type HarnessView,
  type IngestEvent,
  type SessionState,
  type SessionView,
  type Snapshot,
} from "./types";
import { matchHarness, type ProcInfo } from "./scan";

interface SessionRec {
  harness: Harness;
  sessionId: string;
  parentId: string | null;
  title?: string;
  tool?: string;
  directory?: string;
  workingUntil: number;
  lastEventTs: number;
  since: number;
  source: "adapter" | "scan";
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

export class Store {
  private sessions = new Map<string, SessionRec>();
  private harnesses = new Map<Harness, HarnessState>();

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
    const harness = event.harness as Harness;
    if (!HARNESSES.includes(harness)) return { ok: false, reason: `unknown harness: ${String(event.harness)}` };
    const sessionId = clip(event.sessionId, 160);
    if (!sessionId) return { ok: false, reason: "sessionId required" };
    const type = event.type;
    if (type !== "session_start" && type !== "session_end" && type !== "state" && type !== "tool" && type !== "error") {
      return { ok: false, reason: `bad type: ${String(type)}` };
    }
    if (type === "session_end") {
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
      };
      this.sessions.set(key, rec);
    }

    const parentId = clip(event.parentSessionId, 160);
    if (parentId && parentId !== sessionId) rec.parentId = parentId;
    const title = clip(event.title, 80);
    if (title) rec.title = title;
    const directory = clip(event.directory, 200);
    if (directory) rec.directory = directory;

    if (type === "session_start") {
      if (event.state === "working") rec.workingUntil = now + IDLE_MS;
    } else if (type === "state") {
      rec.workingUntil = event.state === "working" ? now + IDLE_MS : 0;
    } else if (type === "tool") {
      const tool = clip(event.tool, 60);
      if (tool) rec.tool = tool;
      rec.workingUntil = now + IDLE_MS;
    } else if (type === "error") {
      rec.workingUntil = now + IDLE_MS;
    }

    rec.lastEventTs = now;
    this.harnesses.get(harness)!.running = true;
    for (const [key, scanRec] of this.sessions) {
      if (scanRec.harness === harness && scanRec.source === "scan") this.sessions.delete(key);
    }
    return { ok: true };
  }

  applyScan(procs: ProcInfo[], now = Date.now()): void {
    const byHarness = new Map<Harness, ProcInfo[]>();
    for (const proc of procs) {
      const harness = matchHarness(proc);
      if (!harness) continue;
      const list = byHarness.get(harness);
      if (list) list.push(proc);
      else byHarness.set(harness, [proc]);
    }

    for (const harness of HARNESSES) {
      const state = this.harnesses.get(harness)!;
      const list = byHarness.get(harness) ?? [];
      state.procs = list.length;
      state.running = list.length > 0;
      state.pids = list.map((proc) => proc.pid);

      const nextCpu = new Map<number, number>();
      for (const proc of list) {
        const previous = state.cpuPrev.get(proc.pid);
        const delta = previous === undefined ? 0 : Math.max(0, proc.cpuMs - previous);
        nextCpu.set(proc.pid, proc.cpuMs);
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
            title: `${harness} · pid ${proc.pid}`,
            workingUntil: 0,
            lastEventTs: now,
            since: now,
            source: "scan",
          };
          this.sessions.set(key, rec);
        }
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
      sessions.push({
        harness: rec.harness,
        sessionId: rec.sessionId,
        parentId: rec.parentId,
        state: (now < rec.workingUntil ? "working" : "idle") as SessionState,
        title: rec.title,
        tool: rec.tool,
        directory: rec.directory,
        since: rec.since,
        lastEventTs: rec.lastEventTs,
        source: rec.source,
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

    return { type: "snapshot", ts: now, harnesses, sessions };
  }

  private deleteTree(harness: Harness, sessionId: string): void {
    const rootKey = keyOf(harness, sessionId);
    if (!this.sessions.has(rootKey)) return;
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
    for (const key of doomed) this.sessions.delete(key);
  }

  private dropHarnessSessions(harness: Harness): void {
    for (const [key, rec] of this.sessions) {
      if (rec.harness === harness) this.sessions.delete(key);
    }
  }
}
