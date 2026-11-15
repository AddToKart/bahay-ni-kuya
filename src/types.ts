export const HARNESSES = ["opencode", "codex", "pi", "omp", "hermes"] as const;
export type Harness = (typeof HARNESSES)[number];

export const IDLE_MS = 4_000;
export const STALE_MS = 90_000;
export const HARD_TTL_MS = 24 * 60 * 60 * 1000;
export const SCAN_MS = 5_000;
export const INSTALLED_REFRESH_MS = 60_000;

export type SessionState = "idle" | "working";
export type EventType = "session_start" | "session_end" | "state" | "tool" | "error";

export interface IngestEvent {
  harness: string;
  sessionId: string;
  parentSessionId?: string | null;
  type: EventType;
  state?: SessionState;
  title?: string;
  tool?: string;
  directory?: string;
  ts?: number;
}

export interface SessionView {
  harness: Harness;
  sessionId: string;
  parentId: string | null;
  state: SessionState;
  title?: string;
  tool?: string;
  directory?: string;
  pid?: number;
  since: number;
  lastEventTs: number;
  source: "adapter" | "scan";
}

export interface HarnessView {
  name: Harness;
  installed: boolean;
  running: boolean;
  procs: number;
}

export interface Snapshot {
  type: "snapshot";
  ts: number;
  harnesses: HarnessView[];
  sessions: SessionView[];
}
