// Agent House adapter for pi 0.83.0 (same extension API as omp 18.20.2).
//
// Install: copy to C:/Users/Cayz/.pi/agent/extensions/agent-house-pi.ts
// (or run `bun run scripts/install-adapters.ts`). No imports: the extension must load even when
// the harness's package graph changes, so only the verified `pi.on(...)` / `pi.events.on(...)`
// surface is used (types live in @earendil-works/pi-coding-agent, but are not needed at runtime).
//
// Contract: fire-and-forget. Every handler body is try/catched, every POST has a 1500 ms timeout,
// failures are swallowed and never retried. A down server means silent drops.
//
// Verified API (from the Orca extension already installed on this machine):
//   pi.on("session_start" | "before_agent_start" | "agent_end" | "agent_settled" |
//         "session_switch" | "session_branch" | "session_shutdown" | "tool_execution_start", handler)
//   ctx.sessionManager.getSessionId()   // stable session id
//   pi.events.on("task:subagent:lifecycle" | "subagent:async-started" |
//                "subagent:async-complete", handler)
//   subagent lifecycle payload: { id?|runId?, status: started|completed|failed|aborted,
//                                 agent?, description?, parentWorkflowRunId? }

type Bag = Record<string, unknown>;

interface ProcessLike {
  env?: Record<string, string | undefined>;
  pid?: number;
  cwd?: () => string;
}

interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: unknown;
}

type FetchLike = (url: string, init: FetchInit) => Promise<unknown>;

interface PiApi {
  on?: (name: string, handler: (event: unknown, ctx: unknown) => void) => void;
  events?: { on?: (name: string, handler: (event: unknown) => void) => void };
}

const HARNESS = "pi";
const DEFAULT_ENDPOINT = "http://127.0.0.1:4777/event";
// Harness globals are untyped here on purpose: the extension ships with zero imports.
const globals = globalThis as unknown as {
  process?: ProcessLike;
  fetch?: FetchLike;
  AbortSignal?: { timeout?: (ms: number) => unknown };
};

function env(key: string): string {
  try {
    const value = globals.process?.env?.[key];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

const ENDPOINT = (env("AGENT_HOUSE_URL") || DEFAULT_ENDPOINT).replace(/\/+$/, "");

function asBag(value: unknown): Bag {
  return typeof value === "object" && value !== null ? (value as Bag) : {};
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

function send(payload: Bag): void {
  try {
    const sessionId = payload.sessionId;
    if (typeof sessionId !== "string" || !sessionId) return;
    const fetchImpl = globals.fetch;
    if (typeof fetchImpl !== "function") return;
    const init: FetchInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ harness: HARNESS, ...payload }),
    };
    try {
      const timeout = globals.AbortSignal?.timeout;
      if (typeof timeout === "function") init.signal = timeout(1500);
    } catch {
      // no AbortSignal.timeout: still bounded by process lifetime
    }
    const request = fetchImpl(ENDPOINT, init);
    if (request && typeof request.catch === "function") request.catch(() => {});
  } catch {
    // never throw into the harness
  }
}

function sessionIdFromCtx(ctx: Bag): string {
  try {
    const manager = asBag(ctx.sessionManager);
    const getId = manager.getSessionId;
    if (typeof getId === "function") {
      const id = (getId as () => unknown).call(manager);
      if (typeof id === "string" && id.trim()) return id.trim().slice(0, 160);
    }
  } catch {
    // fall through
  }
  return "";
}

function currentCwd(): string {
  try {
    const read = globals.process?.cwd;
    return typeof read === "function" ? String(read.call(globals.process) || "") : "";
  } catch {
    return "";
  }
}

function currentPid(): string {
  const pid = globals.process?.pid;
  return typeof pid === "number" && pid > 0 ? String(pid) : "0";
}

export default function (pi: PiApi): void {
  let rootSession = "";
  let rootDirectory = "";
  let childSession = false;
  let lastState = "";
  let lastStateAt = 0;
  const reported = new Map<string, string>();

  function ensureSession(ctx: Bag): string {
    if (!rootSession) {
      rootSession = sessionIdFromCtx(ctx) || `${HARNESS}-${currentPid()}`;
      rootDirectory = currentCwd();
    }
    return rootSession;
  }

  function postState(state: "working" | "idle", ctx: Bag): void {
    if (childSession) return;
    const sessionId = ensureSession(ctx);
    const now = Date.now();
    if (state === lastState && now - lastStateAt < 300) return;
    lastState = state;
    lastStateAt = now;
    send({ sessionId, type: "state", state, directory: clip(rootDirectory, 200) });
  }

  function openSession(state: "idle" | "working", ctx: Bag): void {
    lastState = "";
    reported.clear();
    send({
      sessionId: ensureSession(ctx),
      type: "session_start",
      state,
      directory: clip(rootDirectory, 200),
    });
  }

  function closeSession(): void {
    if (rootSession && !childSession) send({ sessionId: rootSession, type: "session_end" });
    rootSession = "";
    rootDirectory = "";
    lastState = "";
    reported.clear();
  }

  function skip(ctx: Bag): boolean {
    if (ctx.agentKind === "sub") {
      // Child sessions are reported through the subagent bus, never as roots.
      childSession = true;
      return true;
    }
    return false;
  }

  function reportSubagent(event: Bag, forced?: string): void {
    if (childSession) return;
    const rawId = event.id ?? event.runId ?? event.subagentId ?? event.sessionId;
    if (typeof rawId !== "string" || !rawId) return;
    const status = forced ?? event.status;
    if (typeof status !== "string") return;
    const stage = status.toLowerCase();
    if (reported.get(rawId) === stage) return;
    reported.set(rawId, stage);
    const sessionId = `${ensureSession({})}/sub/${rawId.slice(0, 100)}`;
    if (stage === "started" || stage === "running" || stage === "pending") {
      send({
        sessionId,
        parentSessionId: rootSession,
        type: "session_start",
        state: "working",
        title: clip(event.description, 80) ?? clip(event.agent, 80) ?? "subagent",
      });
      return;
    }
    if (stage === "completed" || stage === "failed" || stage === "aborted" || stage === "done" || stage === "error") {
      send({ sessionId, type: "session_end" });
      reported.delete(rawId);
    }
  }

  function on(name: string, handler: (event: Bag, ctx: Bag) => void): void {
    try {
      if (typeof pi.on !== "function") return;
      pi.on(name, (event, ctx) => {
        try {
          handler(asBag(event), asBag(ctx));
        } catch {
          // swallow per-event failures
        }
      });
    } catch {
      // an unsupported event name must not break extension load
    }
  }

  on("session_start", (event, ctx) => {
    if (skip(ctx)) return;
    const nextId = sessionIdFromCtx(ctx);
    if (rootSession && nextId && nextId !== rootSession) {
      send({ sessionId: rootSession, type: "session_end" });
      closeSession();
    }
    openSession("idle", ctx);
  });

  for (const name of ["session_switch", "session_branch"]) {
    on(name, (event, ctx) => {
      if (skip(ctx)) return;
      closeSession();
      openSession("idle", ctx);
    });
  }

  on("before_agent_start", (event, ctx) => {
    if (childSession) return;
    const sessionId = ensureSession(ctx);
    lastState = "working";
    lastStateAt = Date.now();
    send({
      sessionId,
      type: "state",
      state: "working",
      title: clip(event.prompt, 80),
      directory: clip(rootDirectory, 200),
    });
  });

  on("tool_execution_start", (event, ctx) => {
    if (childSession) return;
    const tool = clip(event.toolName, 60);
    if (!tool) return;
    const sessionId = ensureSession(ctx);
    lastState = "working";
    lastStateAt = Date.now();
    send({ sessionId, type: "tool", tool, directory: clip(rootDirectory, 200) });
  });

  on("agent_end", (event, ctx) => postState("idle", ctx));
  on("agent_settled", (event, ctx) => postState("idle", ctx));

  on("session_shutdown", () => {
    closeSession();
    childSession = false;
  });

  // Subagent lifecycle bus. Guarded: pi may expose no event bus at all.
  try {
    const bus = pi.events;
    if (bus && typeof bus.on === "function") {
      const wrap = (handler: (event: Bag) => void) => (event: unknown) => {
        try {
          handler(asBag(event));
        } catch {
          // ignore
        }
      };
      bus.on("task:subagent:lifecycle", wrap((event) => reportSubagent(event, clip(event.status, 20))));
      bus.on("subagent:async-started", wrap((event) => reportSubagent(event, "started")));
      bus.on("subagent:async-complete", wrap((event) => reportSubagent(event, "completed")));
    }
  } catch {
    // no bus: root session tracking still works
  }
}
