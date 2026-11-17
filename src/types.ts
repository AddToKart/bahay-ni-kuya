export const HARNESSES = ["opencode", "codex", "pi", "omp", "hermes"] as const;
export type Harness = (typeof HARNESSES)[number];

export const IDLE_MS = 4_000;
export const STALE_MS = 90_000;
export const HARD_TTL_MS = 24 * 60 * 60 * 1000;
export const SCAN_MS = 5_000;
export const INSTALLED_REFRESH_MS = 60_000;

export type SessionState =
  | "idle"
  | "working"
  | "standby"
  | "blocked"
  | "error"
  // v2 (Phase 2) states — additive; v1 consumers render unknown states as idle
  | "arriving"
  | "evicting"
  | "queued_for_confession"
  | "in_confession"
  | "called";

export type EventType =
  | "session_start"
  | "session_end"
  | "state"
  | "tool"
  | "error"
  | "task_started"
  | "task_completed"
  | "blocked"
  | "subagent_started"
  | "subagent_ended"
  // v2 (Phase 2) events — additive
  | "housemate_summoned"
  | "housemate_arrived"
  | "housemate_evict_started"
  | "housemate_evicted"
  | "question_asked"
  | "question_answered"
  | "kuya_call"
  | "kuya_call_ended"
  | "chat_message"
  | "guest_arrived"
  | "guest_left"
  // Collab (Lingguhang Hamon) events
  | "collab_started"
  | "collab_step"
  | "collab_completed"
  | "collab_failed"
  // v3 (houses) events — additive
  | "house_opened"
  | "house_closed";

export type QuestionKind = "permission" | "question" | "choice" | "text";
export type QuestionStatus = "queued" | "in_confession" | "answered";

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
  total?: number;
}

export interface IngestEvent {
  harness: string;
  sessionId: string;
  parentSessionId?: string | null;
  type: EventType;
  state?: SessionState;
  title?: string;
  tool?: string;
  directory?: string;
  reason?: string;
  error?: string;
  ts?: number;
  // v2 fields (all optional, additive)
  housemateKey?: string;
  name?: string;
  presetId?: string;
  id?: string;
  kind?: QuestionKind;
  options?: string[];
  option?: number;
  text?: string;
  guestKey?: string;
  hostKey?: string;
  role?: "housemate" | "kuya";
  // real opencode metadata (Phase 4)
  agent?: string;
  model?: string;
  cost?: number;
  tokens?: TokenUsage;
  currentAction?: string;
  currentThought?: string;
  // v3 (houses)
  houseId?: string;
}

export interface QuestionView {
  id: string;
  harness: string;
  sessionId: string;
  housemateKey?: string;
  kind: QuestionKind;
  text: string;
  options?: string[];
  askedAt: number;
  status: QuestionStatus;
  answer?: { option?: number; text?: string };
  answeredAt?: number;
}

export interface ChatLine {
  sessionId: string;
  role: "housemate" | "kuya";
  text: string;
  ts: number;
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
  errorCount?: number;
  nominated?: boolean;
  housemateKey?: string;
  guest?: boolean;
  agent?: string;
  model?: string;
  cost?: number;
  tokens?: TokenUsage;
  currentAction?: string;
  currentThought?: string;
  houseId?: string;
  lastError?: string;
  errorTimestamp?: number;
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
  questions: QuestionView[];
  chat: ChatLine[];
}
