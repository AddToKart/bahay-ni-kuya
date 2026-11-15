// Scripted Agent House demo: posts contract events at realistic timings so the house fills up
// and empties out. Usage:
//   bun run scripts/fake-events.ts            # one ~18s pass
//   bun run scripts/fake-events.ts --loop     # repeat forever
//   AGENT_HOUSE_URL=http://127.0.0.1:4781/event bun run scripts/fake-events.ts
//
// Exits non-zero when the server cannot be reached within 3 seconds.

interface DemoEvent {
  harness: "opencode" | "codex" | "pi" | "omp" | "hermes";
  sessionId: string;
  parentSessionId?: string;
  type: "session_start" | "session_end" | "state" | "tool" | "error";
  state?: "working" | "idle";
  title?: string;
  tool?: string;
  directory?: string;
}

interface Step {
  at: number;
  label: string;
  event: DemoEvent;
}

const DEFAULT_ENDPOINT = "http://127.0.0.1:4777/event";
const ENDPOINT = (process.env.AGENT_HOUSE_URL || DEFAULT_ENDPOINT).replace(/\/+$/, "");
const ORIGIN = ENDPOINT.replace(/\/event(?:\/.*)?$/, "");
const DIRECTORY = process.cwd().replace(/\\/g, "/");
const LOOP = process.argv.includes("--loop");

const ROOT_OPENCODE = "ses_demo_opencode_root";
const ROOT_CODEX = "ses_demo_codex_root";
const ROOT_HERMES = "ses_demo_hermes_root";
const HERMES_A = "ses_demo_hermes_child_a";
const HERMES_B = "ses_demo_hermes_child_b";

const steps: Step[] = [
  { at: 0, label: "opencode root appears", event: { harness: "opencode", sessionId: ROOT_OPENCODE, type: "session_start", state: "idle", title: "refactor the layout engine" } },
  { at: 350, label: "opencode edit", event: { harness: "opencode", sessionId: ROOT_OPENCODE, type: "tool", tool: "edit" } },
  { at: 1100, label: "opencode bash", event: { harness: "opencode", sessionId: ROOT_OPENCODE, type: "tool", tool: "bash" } },
  { at: 1800, label: "codex root idles in", event: { harness: "codex", sessionId: ROOT_CODEX, type: "session_start", state: "idle", title: "waiting for review" } },
  { at: 3000, label: "hermes root appears", event: { harness: "hermes", sessionId: ROOT_HERMES, type: "session_start", state: "idle", title: "delegate the review" } },
  { at: 3200, label: "hermes working", event: { harness: "hermes", sessionId: ROOT_HERMES, type: "state", state: "working" } },
  { at: 3400, label: "hermes child A spawns", event: { harness: "hermes", sessionId: HERMES_A, parentSessionId: ROOT_HERMES, type: "session_start", state: "working", title: "lint sweep" } },
  { at: 3600, label: "hermes child B spawns", event: { harness: "hermes", sessionId: HERMES_B, parentSessionId: ROOT_HERMES, type: "session_start", state: "working", title: "docs check" } },
  { at: 4200, label: "child A grep", event: { harness: "hermes", sessionId: HERMES_A, type: "tool", tool: "grep" } },
  { at: 5200, label: "child A edit", event: { harness: "hermes", sessionId: HERMES_A, type: "tool", tool: "edit" } },
  { at: 6000, label: "child A idle", event: { harness: "hermes", sessionId: HERMES_A, type: "state", state: "idle" } },
  { at: 6200, label: "child B read", event: { harness: "hermes", sessionId: HERMES_B, type: "tool", tool: "read" } },
  { at: 8000, label: "child B idle", event: { harness: "hermes", sessionId: HERMES_B, type: "state", state: "idle" } },
  { at: 8200, label: "hermes bash", event: { harness: "hermes", sessionId: ROOT_HERMES, type: "tool", tool: "bash" } },
  { at: 9500, label: "hermes idle", event: { harness: "hermes", sessionId: ROOT_HERMES, type: "state", state: "idle" } },
  { at: 10500, label: "opencode write", event: { harness: "opencode", sessionId: ROOT_OPENCODE, type: "tool", tool: "write" } },
  { at: 11500, label: "opencode idle", event: { harness: "opencode", sessionId: ROOT_OPENCODE, type: "state", state: "idle" } },
  { at: 12500, label: "codex wakes up", event: { harness: "codex", sessionId: ROOT_CODEX, type: "state", state: "working", title: "review the diff" } },
  { at: 12800, label: "codex read", event: { harness: "codex", sessionId: ROOT_CODEX, type: "tool", tool: "read" } },
  { at: 14000, label: "codex idle", event: { harness: "codex", sessionId: ROOT_CODEX, type: "state", state: "idle" } },
  { at: 15500, label: "hermes ends (children go with it)", event: { harness: "hermes", sessionId: ROOT_HERMES, type: "session_end" } },
  { at: 16500, label: "opencode test run", event: { harness: "opencode", sessionId: ROOT_OPENCODE, type: "tool", tool: "test" } },
  { at: 17200, label: "opencode idle", event: { harness: "opencode", sessionId: ROOT_OPENCODE, type: "state", state: "idle" } },
  { at: 17800, label: "opencode ends", event: { harness: "opencode", sessionId: ROOT_OPENCODE, type: "session_end" } },
  { at: 18300, label: "codex ends", event: { harness: "codex", sessionId: ROOT_CODEX, type: "session_end" } },
];

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function serverIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${ORIGIN}/healthz`, { signal: AbortSignal.timeout(500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(): Promise<boolean> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (await serverIsUp()) return true;
    await sleep(150);
  }
  return false;
}

async function post(event: DemoEvent): Promise<void> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ directory: DIRECTORY, ...event }),
    signal: AbortSignal.timeout(1500),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`POST ${ENDPOINT} -> ${response.status} ${body}`);
  }
}

interface LiveSession {
  harness: DemoEvent["harness"];
  sessionId: string;
  parentSessionId?: string;
  title?: string;
  state: "working" | "idle";
}

const live = new Map<string, LiveSession>();

// The server drops adapter sessions for harnesses whose process scan finds nothing, so a
// process-less demo re-asserts its cast every 1.5 s (well under the 5 s scan interval).
function remember(event: DemoEvent): void {
  if (event.type === "session_end") {
    // Mirror the server: ending a session deletes its descendants too.
    live.delete(event.sessionId);
    for (const [id, session] of live) {
      if (session.parentSessionId === event.sessionId) live.delete(id);
    }
    return;
  }
  const existing = live.get(event.sessionId);
  if (event.type === "session_start") {
    live.set(event.sessionId, {
      harness: event.harness,
      sessionId: event.sessionId,
      parentSessionId: event.parentSessionId ?? existing?.parentSessionId,
      title: event.title ?? existing?.title,
      state: event.state ?? "idle",
    });
    return;
  }
  if (!existing) return;
  if (event.type === "tool") existing.state = "working";
  else if (event.state) existing.state = event.state;
  if (event.title) existing.title = event.title;
}

function keepAlive(): void {
  for (const session of live.values()) {
    const event: DemoEvent = {
      harness: session.harness,
      sessionId: session.sessionId,
      type: "session_start",
      state: session.state,
      title: session.title,
    };
    if (session.parentSessionId) event.parentSessionId = session.parentSessionId;
    void post(event).catch(() => {});
  }
}

function stamp(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`.padStart(6);
}

async function runOnce(pass: number): Promise<void> {
  live.clear();
  const started = performance.now();
  console.log(`Agent House demo pass ${pass} -> ${ENDPOINT}`);
  const heartbeat = setInterval(keepAlive, 1500);
  try {
    for (const step of steps) {
      const wait = step.at - (performance.now() - started);
      if (wait > 0) await sleep(wait);
      await post(step.event);
      remember(step.event);
      console.log(`[${stamp(performance.now() - started)}] ${step.label}`);
    }
  } finally {
    clearInterval(heartbeat);
  }
  console.log(`[${stamp(performance.now() - started)}] demo complete`);
}

async function main(): Promise<void> {
  const up = await waitForServer();
  if (!up) {
    console.error(`Agent House server unreachable at ${ORIGIN} (tried /healthz for 3s).`);
    console.error("Start it with: bun run src/server.ts   (or set AGENT_HOUSE_URL)");
    process.exit(1);
  }
  let pass = 1;
  do {
    await runOnce(pass);
    pass += 1;
    if (LOOP) await sleep(1000);
  } while (LOOP);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
