// Scripted Bahay ni Kuya demo: posts contract events at realistic timings to play a full
// "Day in the House": wake up, chores, task given, office, subagents, confession room,
// error and recovery, nomination, completion, chores, sleep.
//
// Usage:
//   bun run scripts/fake-events.ts            # one ~19s pass
//   bun run scripts/fake-events.ts --loop     # repeat forever
//   BAHAY_NI_KUYA_URL=http://127.0.0.1:4781/event bun run scripts/fake-events.ts

import type { EventType, Harness, SessionState } from "../src/types";

interface DemoEvent {
  harness: Harness;
  sessionId?: string;
  parentSessionId?: string;
  type: EventType;
  state?: SessionState;
  title?: string;
  tool?: string;
  directory?: string;
  reason?: string;
  error?: string;
  housemateKey?: string;
  name?: string;
  id?: string;
  kind?: "permission" | "question" | "choice" | "text";
  text?: string;
  options?: string[];
  option?: number;
  guestKey?: string;
  hostKey?: string;
  role?: "housemate" | "kuya";
}

interface Step {
  at: number;
  label: string;
  event: DemoEvent;
}

const DEFAULT_ENDPOINT = "http://127.0.0.1:4777/event";
const ENDPOINT = (process.env.BAHAY_NI_KUYA_URL || DEFAULT_ENDPOINT).replace(/\/+$/, "");
const ORIGIN = ENDPOINT.replace(/\/event(?:\/.*)?$/, "");
const DIRECTORY = process.cwd().replace(/\\/g, "/");
const LOOP = process.argv.includes("--loop");
const TIME_SCALE = Number(process.env.FAKE_SCALE || 1);

const SES_OPENCODE = "ses_demo_opencode";
const SES_CODEX = "ses_demo_codex";
const SES_PI = "ses_demo_pi";
const SES_OMP = "ses_demo_omp";
const SES_HERMES = "ses_demo_hermes";
const SES_SUBAGENT = "ses_demo_opencode_sub";

const steps: Step[] = [
  // 1. WAKE UP & MORNING HOUSE LIFE
  { at: 0, label: "opencode wakes up for morning chores", event: { harness: "opencode", sessionId: SES_OPENCODE, type: "session_start", state: "idle", title: "Morning routine" } },
  { at: 300, label: "codex wakes up, joins house life", event: { harness: "codex", sessionId: SES_CODEX, type: "session_start", state: "idle", title: "Having coffee" } },
  { at: 600, label: "pi wakes up, heading to kitchen", event: { harness: "pi", sessionId: SES_PI, type: "session_start", state: "idle", title: "Making breakfast" } },
  { at: 900, label: "omp wakes up, heading to gameroom", event: { harness: "omp", sessionId: SES_OMP, type: "session_start", state: "idle", title: "Playing pool" } },
  { at: 1200, label: "hermes wakes up, reading in living room", event: { harness: "hermes", sessionId: SES_HERMES, type: "session_start", state: "idle", title: "Morning newspaper" } },

  // 2. TASK GIVEN & OFFICE CALL
  { at: 2500, label: "KUYA: opencode has task, called to office", event: { harness: "opencode", sessionId: SES_OPENCODE, type: "task_started", title: "Refactor A* pathfinding and animation" } },
  { at: 3200, label: "opencode starts reading code", event: { harness: "opencode", sessionId: SES_OPENCODE, type: "tool", tool: "read_file" } },
  { at: 4000, label: "opencode edits file", event: { harness: "opencode", sessionId: SES_OPENCODE, type: "tool", tool: "edit_file" } },

  // 3. HERMES RESEARCH IN READING NOOK
  { at: 4500, label: "KUYA: hermes has research task, visits library reading nook", event: { harness: "hermes", sessionId: SES_HERMES, type: "task_started", title: "Survey agent architectures" } },
  { at: 5000, label: "hermes reading book", event: { harness: "hermes", sessionId: SES_HERMES, type: "tool", tool: "search_papers" } },

  // 4. SUBAGENT SPAWNED
  { at: 5800, label: "opencode spawns lint auditor subagent", event: { harness: "opencode", sessionId: SES_SUBAGENT, parentSessionId: SES_OPENCODE, type: "subagent_started", title: "AST & lint checker" } },
  { at: 6500, label: "subagent checks syntax", event: { harness: "opencode", sessionId: SES_SUBAGENT, parentSessionId: SES_OPENCODE, type: "tool", tool: "ast_grep" } },

  // 5. BLOCKED (PERMISSION ASKED) -> CONFESSION ROOM
  { at: 7500, label: "codex gets task", event: { harness: "codex", sessionId: SES_CODEX, type: "task_started", title: "Deploy schema migration" } },
  { at: 8200, label: "codex blocked on permission -> Confession Room", event: { harness: "codex", sessionId: SES_CODEX, type: "blocked", reason: "Needs user permission for production write" } },

  // 6. CONFESSION ROOM RESOLUTION
  { at: 9800, label: "Kuya grants permission: codex resumes task in office", event: { harness: "codex", sessionId: SES_CODEX, type: "task_started", title: "Applying migration" } },
  { at: 10400, label: "codex runs migration tool", event: { harness: "codex", sessionId: SES_CODEX, type: "tool", tool: "run_migration" } },

  // 7. ERROR AND RECOVERY (PI)
  { at: 11000, label: "pi called to office", event: { harness: "pi", sessionId: SES_PI, type: "task_started", title: "Compile native assets" } },
  { at: 11600, label: "pi encounters compiler error (facepalm)", event: { harness: "pi", sessionId: SES_PI, type: "error", error: "CompileError: missing symbol" } },
  { at: 12400, label: "pi recovers and fixes error", event: { harness: "pi", sessionId: SES_PI, type: "tool", tool: "patch_header" } },

  // 8. NOMINATED MARKER DEMO (OMP: 3 REPEATED ERRORS)
  { at: 13000, label: "omp gets test runner task", event: { harness: "omp", sessionId: SES_OMP, type: "task_started", title: "Run end-to-end integration tests" } },
  { at: 13500, label: "omp error 1", event: { harness: "omp", sessionId: SES_OMP, type: "error", error: "Test 1 Failed" } },
  { at: 13900, label: "omp error 2", event: { harness: "omp", sessionId: SES_OMP, type: "error", error: "Test 2 Failed" } },
  { at: 14300, label: "omp error 3 -> NOMINATED!", event: { harness: "omp", sessionId: SES_OMP, type: "error", error: "Test 3 Failed" } },

  // 9. TASK COMPLETION & RETURN TO HOUSE LIFE
  { at: 15000, label: "subagent completes and poofs away", event: { harness: "opencode", sessionId: SES_SUBAGENT, parentSessionId: SES_OPENCODE, type: "subagent_ended" } },
  { at: 15500, label: "opencode completes task (thumbs up)", event: { harness: "opencode", sessionId: SES_OPENCODE, type: "task_completed" } },
  { at: 16000, label: "codex completes task", event: { harness: "codex", sessionId: SES_CODEX, type: "task_completed" } },
  { at: 16400, label: "pi completes task", event: { harness: "pi", sessionId: SES_PI, type: "task_completed" } },
  { at: 16800, label: "hermes completes research", event: { harness: "hermes", sessionId: SES_HERMES, type: "task_completed" } },
  { at: 17200, label: "omp finishes run", event: { harness: "omp", sessionId: SES_OMP, type: "task_completed" } },

  // 10. EVENING CHORES & NIGHT SLEEP
  { at: 17800, label: "housemates enjoy evening dinner and games", event: { harness: "opencode", sessionId: SES_OPENCODE, type: "state", state: "idle" } },
  { at: 18500, label: "night falls: opencode goes to bed", event: { harness: "opencode", sessionId: SES_OPENCODE, type: "session_end" } },
  { at: 18700, label: "night falls: codex goes to bed", event: { harness: "codex", sessionId: SES_CODEX, type: "session_end" } },
  { at: 18900, label: "night falls: pi goes to bed", event: { harness: "pi", sessionId: SES_PI, type: "session_end" } },
  { at: 19100, label: "night falls: omp goes to bed", event: { harness: "omp", sessionId: SES_OMP, type: "session_end" } },
  { at: 19300, label: "night falls: hermes goes to bed (all sleeping Zzz)", event: { harness: "hermes", sessionId: SES_HERMES, type: "session_end" } },

  // 11. PHASE 2 — PBB FLOW: summon, confession queue, call, guest, evict
  { at: 20000, label: "KUYA summons bea (walks in with a bag)", event: { harness: "opencode", type: "housemate_summoned", housemateKey: "hm_bea", name: "Bea" } },
  { at: 21500, label: "bea has arrived, starts house life", event: { harness: "opencode", type: "housemate_arrived", housemateKey: "hm_bea" } },
  { at: 22000, label: "KUYA summons ben", event: { harness: "opencode", type: "housemate_summoned", housemateKey: "hm_ben", name: "Ben" } },
  { at: 23500, label: "ben has arrived", event: { harness: "opencode", type: "housemate_arrived", housemateKey: "hm_ben" } },
  { at: 25000, label: "bea asks a permission question (chair free)", event: { harness: "opencode", type: "question_asked", housemateKey: "hm_bea", id: "q_bea_1", kind: "permission", text: "Kailangan ko po mag-edit ng src/api.ts. Ituloy?" } },
  { at: 27000, label: "ben asks while bea is inside (queue)", event: { harness: "opencode", type: "question_asked", housemateKey: "hm_ben", id: "q_ben_1", kind: "choice", text: "Anong diskarte po ang gagamitin ko?", options: ["Refactor", "Patch lang"] } },
  { at: 30000, label: "KUYA answers bea's permission", event: { harness: "opencode", type: "question_answered", id: "q_bea_1", option: 0 } },
  { at: 32000, label: "KUYA answers ben's choice", event: { harness: "opencode", type: "question_answered", id: "q_ben_1", option: 1 } },
  { at: 34000, label: "KUYA calls bea to the Confession Room", event: { harness: "opencode", type: "kuya_call", housemateKey: "hm_bea" } },
  { at: 35000, label: "bea: narito na po ako, Kuya", event: { harness: "opencode", type: "chat_message", housemateKey: "hm_bea", role: "housemate", text: "Narito na po ako, Kuya." } },
  { at: 36000, label: "KUYA: kumusta ang task?", event: { harness: "opencode", type: "chat_message", housemateKey: "hm_bea", role: "kuya", text: "Kumusta ang task mo?" } },
  { at: 37000, label: "bea: okay naman po", event: { harness: "opencode", type: "chat_message", housemateKey: "hm_bea", role: "housemate", text: "Okay naman po, malapit na matapos." } },
  { at: 38000, label: "call ended, bea walks back", event: { harness: "opencode", type: "kuya_call_ended", housemateKey: "hm_bea" } },
  { at: 40000, label: "ben's guest arrives (lanyard)", event: { harness: "opencode", type: "guest_arrived", guestKey: "hm_guest_1", hostKey: "hm_ben" } },
  { at: 42000, label: "ben's guest leaves (folder handed over)", event: { harness: "opencode", type: "guest_left", guestKey: "hm_guest_1", hostKey: "hm_ben" } },
  { at: 44000, label: "KUYA evicts ben (suitcase, walk-out)", event: { harness: "opencode", type: "housemate_evict_started", housemateKey: "hm_ben", reason: "kuya_evict" } },
  { at: 49000, label: "ben has left the house", event: { harness: "opencode", type: "housemate_evicted", housemateKey: "hm_ben" } },
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

async function runPass(): Promise<void> {
  const start = Date.now();
  for (const step of steps) {
    const target = start + Math.round(step.at * TIME_SCALE);
    const delay = target - Date.now();
    if (delay > 0) await sleep(delay);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[+${elapsed.padStart(5, " ")}s] ${step.label}`);
    await post(step.event);
  }
}

console.log(`Bahay ni Kuya fake event player -> ${ENDPOINT}`);
if (!(await waitForServer())) {
  console.error(`ERROR: server at ${ORIGIN} is not responding within 3s. Start it with 'bun run start'.`);
  process.exit(1);
}

do {
  await runPass();
  if (LOOP) {
    console.log("--- loop pause 2s ---");
    await sleep(2000);
  }
} while (LOOP);
