# Phase 4 — Real opencode housemates (branch `opencode-housemates`)

## Goal and why it matters

Phase 2 built the stage with fake events. Phase 4 replaces the fake source with real opencode
control: KUYA summons actual opencode housemates (choosing agent and model), they work inside
isolated worktrees, ask real permissions/questions through the Confession Room, receive real
Kuya calls, spawn real guests (subagents), and get evicted without ever orphaning a process on
Windows. This is the phase that makes the PBB flow true.

## Prerequisites and dependencies

- **P2 complete** (visuals + v2 protocol) and **P3 complete with a go**; this phase adapts to
  `spikes/opencode-control/FINDINGS.md` and must list, in its report, each UNVERIFIED claim from
  P2/P3 and how P4 resolved it (resolved / degraded mode).
- Files: `src/server.ts`, `src/store.ts`, `src/security.ts`, `src/types.ts`, new
  `src/opencode-supervisor.ts`, `src/opencode-client.ts`, `src/housemates.ts`,
  `src/questions.ts`, `src/audit.ts`, `src/ratelimit.ts`, `src/procutil.ts`;
  `public/main.ts`, `public/confession.ts`, `public/flow.ts`, `public/console.ts`,
  `public/index.html`; `config/housemates.json`, `config/guests.json`, `config/house.json`,
  `config/runners.json` (allowlistedRoots wiring fix).

## Standing rules (verbatim from master-plan §1)

Rules 1–10 apply. Specific to P4: Rule 4 (P3 evidence drives every opencode call; anything not
verified in P3 and needed here gets its own verification step in this phase), Rule 7 (security
for every new endpoint), Rule 8 (worktrees kept, never auto-deleted, never auto-merged), Rule 9
(Windows process-tree management, restart reconcile).

## Ordered task list

### A. Supervisor

| ID | Task | Files |
| --- | --- | --- |
| P4-T1 | `src/opencode-supervisor.ts`: start managed opencode servers in the background — no terminal dependency. Spawn `opencode serve --port <p> --hostname 127.0.0.1 [--pure if D5 approved] [--print-logs --log-level INFO]` via `Bun.spawn` with `stdout/stderr: "pipe"`; capture the bound address from startup logs (or use the requested port); keep a per-server record `{id, port, pid, startedAt, logs: ring(500), sessions: Map}` | `src/opencode-supervisor.ts` |
| P4-T2 | Health checks: every 10 s hit the server's health surface (P3-verified route); 3 consecutive failures ⇒ mark unhealthy; auto-restart with backoff (1 s, 2 s, 4 s, max 30 s, 3 restarts then alert via Kuya banner + audit log) | same |
| P4-T3 | Log capture: stdout/stderr lines into a bounded ring buffer per server, exposed via `GET /api/opencode/servers` and used for debugging; secrets never appear (redact per `src/audit.ts` filter) | same + `src/audit.ts` |
| P4-T4 | Clean shutdown: on server SIGINT/SIGINT-forward or `POST /api/opencode/shutdown`, abort all managed sessions (P3-verified abort route; fallback: per-session process kill), wait ≤5 s, then kill the opencode process **tree** via `src/procutil.ts` (P3 item 11's exact command, plus PID-tree walk fallback) | `src/opencode-supervisor.ts`, `src/procutil.ts` (new) |
| P4-T5 | Reconcile from a state file: write `%USERPROFILE%\.bahay-ni-kuya\opencode-state.json` on every change `{servers:[{id,port,pid}],sessions:[{key,sessionId,worktree,branch,presetId,startedAt}]}`; on startup, read it, check each pid/port for liveness (process exists AND health responds), adopt live ones, drop dead ones with a Kuya banner ("natagpuang patay na session") | same |
| P4-T6 | No orphans: `procutil.killTree(pid)` implements `taskkill /T /F /PID <pid>` with a PowerShell `Get-CimInstance` child-walk fallback; verify with a spawned dummy child in a unit test | `src/procutil.ts`, `test/phase4-procutil.test.ts` |

### B. Casting (summon dialog)

| ID | Task | Files |
| --- | --- | --- |
| P4-T10 | Agent dropdown filled live from opencode via `GET /api/opencode/agents` (server proxies the P3-verified agent list); **primary-capable only** (mode `primary`/`all`, per P3 item 8 findings); loading state while fetching; graceful empty state with "opencode n/a" | `public/console.ts` (summon dialog), `src/server.ts` |
| P4-T11 | Model dropdown filled live from connected providers via `GET /api/opencode/models`, plus first entry `"agent default"`; when the chosen agent declares a fixed model and D5/override findings say it wins, show the agent's model as read-only with an explanatory note | same |
| P4-T12 | Reasoning/variant option: shown only when the selected model exposes variants (P3 item 8); dropdown of variant names from the live catalog | same |
| P4-T13 | Project folder dropdown (allowlisted roots from `/api/roots` after the P4-T32 wiring fix), persona note textarea (≤400 chars), "Save as preset" checkbox | same |
| P4-T14 | `config/housemates.json` schema (validated at load, like runners.json): `[{id, name, harness: "opencode", agent, model, provider, reasoning, persona, permissions, projectRoots, sprite, maxConcurrentTasks}]`; `permissions` is an object of opencode permission keys → `"ask"\|"allow"\|"deny"` (P3-verified permission model; unknown keys rejected); `sprite` selects the chibi variant (existing `INSTANCE_VARIANTS` or named harness variant) | `config/housemates.json`, `src/housemates.ts` |
| P4-T15 | Hover cards: agent badge + model badge (colored chips), live token usage + cost per housemate (input/output/reasoning/cache from P3 item 7's verified fields) and per guest rolled up into the host; every unavailable field renders `n/a` — never estimated, never blank | `public/main.ts` `updateCard`, `src/housemates.ts` usage join |

### C. Real flows

| ID | Task | Files |
| --- | --- | --- |
| P4-T16 | Real SUMMON: `POST /api/housemates` → create git worktree `kuya/<name>-<id>` in the project repo (branch from the repo's default branch or chosen base; dirty-tree warning first per Rule 8), then create the session via the P3-verified create call with `{agent, model, variant, directory: worktreePath}`; emit `housemate_summoned` → visuals from P2; on first turn completion or idle, `housemate_arrived` | `src/housemates.ts`, `src/opencode-client.ts`, `public/main.ts` |
| P4-T17 | Real EVICT: `DELETE /api/housemates/:key` → graceful abort of any running turn (P3-verified abort), wait up to 5 s for idle, then end the process tree if the session owns a dedicated process; confirm dialog in the UI shows the worktree's uncommitted or unmerged changes as a **diff stat** (fetched before the confirm); worktree and branch are KEPT (never removed) and their absolute paths + branch names are reported in the response and the evict banner; `housemate_evict_started`/`housemate_evicted` events drive P2 visuals; a dead session is removed with a banner and its queued questions dropped | `src/housemates.ts`, `public/console.ts`, `public/main.ts` |
| P4-T18 | Real CONFESSION: map opencode permission/question events (P3 item 5's captured shapes) to `question_asked {id, harness:"opencode", session, kind, text, options}`; answers go through the verified reply calls (`POST /api/confession/answer` → `opencode-client.respond(id, {option|text})`); the queue from `src/questions.ts` is shared; **questions are never auto-answered** (no `--auto`, no allow-all); when a session dies with questions pending, they are dropped with a banner | `src/questions.ts`, `src/opencode-client.ts`, `public/confession.ts` |
| P4-T19 | Real CALL/TALK: `POST /api/housemates/:key/call {message}` → if busy, present the two options from the spec: `"after current turn"` (queue the message) or `"interrupt now"` (abort then send) with a confirm dialog; replies stream back into the diary chat panel via `chat_message` events; `kuya_call`/`kuya_call_ended` wrap the flow | `src/housemates.ts`, `public/confession.ts` |
| P4-T20 | GUESTS: child sessions (`parentID` per P3 item 9) spawn guests through the P2 visuals; a **minimum visible time** (default 3 s, `config/guests.json: minVisibleMs`) delays `guest_left` so fast subagents don't flicker (the character finishes its walk-in first); `config/guests.json` holds `allowed: string[]`, `denied: string[]` (subagent agent names), `maxPerHost: 3`, `maxTotal: 8`, `maxDepth: 2`, `queueSpots: 4` (outside the entrance), `timeLimitMs` (default 300 000) after which the guest is escalated to the Confession Room (a question of kind `question` is raised to Kuya: "guest X overran — evict?"); guest permission/question asks join the same confession queue | `config/guests.json`, `src/housemates.ts`, `public/guests.ts` |
| P4-T21 | Housemate cap: `config/house.json.housemateCap` (default per D6 = 4); `POST /api/housemates` over the cap ⇒ 429 with a Kuya banner "punong-punon na ang bahay"; guests counted separately (`maxTotal`) | `src/housemates.ts`, `config/house.json` |
| P4-T22 | Audit log of every action: append-only `%USERPROFILE%\.bahay-ni-kuya\audit.jsonl` `{ts, actor: "kuya"\|"house", action, target, detail}` — actions: summon, evict, call, answer, skip, interrupt, preset save/delete, config change, layout save, dispatch; `GET /api/audit?limit=100` (Bearer) reads the tail | `src/audit.ts`, `src/server.ts` |
| P4-T23 | Tests: simulated-event suite (store + queue + registry with fake opencode client) + **at least one real end-to-end run** on the throwaway repo (`%TEMP%` fixture from P3-T1): summon → prompt → answer permission → evict; marked `// REAL`, env-gated (`BAHAY_E2E=1`), killed by `procutil` in `finally` | `test/phase4-*.test.ts` |

### D. Security hardening (Rule 7 closeout for all control endpoints)

| ID | Task | Files |
| --- | --- | --- |
| P4-T30 | Rate limiting: token-bucket per endpoint class (mutating `/api/*`: 10/min default; `/event` ingest: 50/s per harness) via `src/ratelimit.ts`; 429 + `Retry-After`; limits in `config/house.json` | `src/ratelimit.ts`, `src/server.ts`, `config/house.json` |
| P4-T31 | Audit-log every control action (P4-T22 covers it; this task wires ALL endpoints incl. existing `/api/layout/save` and `/api/tasks`) | `src/server.ts` |
| P4-T32 | Allowlisted roots fix: `getAllowlistedRoots()` reads `config/runners.json allowlistedRoots` and merges with an explicit default `[<repo>/..]`; `homedir()` and `parent(cwd)` blanket entries are removed (F-SEC-03); `/api/roots` returns the same list; docs updated | `src/security.ts`, `config/runners.json` |
| P4-T33 | Rejected-request tests for every endpoint: 401 (no/bad token), 403 (foreign Host/Origin), 413 (>limit), 429 (rate), 400 (bad cwd/body) | `test/phase4-security.test.ts` |

### E. Wrap-up

| ID | Task | Files |
| --- | --- | --- |
| P4-T33b | Standing rules 1–10 checklist in the phase report (esp. worktrees kept, no auto-merge, audit log, caps) | report |
| P4-T34 | STOP demo: summon two opencode housemates with different agent and model; one answers a permission in the Confession Room; one spawns a guest; one is evicted — screen recording + `docs/screenshots/phase-4/` | screenshots |

## Data formats

**HousemateRec (in-memory + state file):**

```ts
interface HousemateRec {
  key: string;                 // hm_<name>_<id4>
  name: string;
  harness: "opencode";
  agent: string;
  model: string;               // provider/model or "agent default"
  variant?: string;
  persona?: string;
  sessionId: string;           // opencode session id
  serverId: string;
  worktree?: string;           // absolute path
  branch?: string;             // kuya/<name>-<id>
  state: "arriving"|"idle"|"working"|"blocked"|"queued_for_confession"|"in_confession"|"called"|"evicting";
  guests: string[];            // guest keys
  usage?: UsageSnapshot;       // verified or undefined
}
interface UsageSnapshot { available: true; inputTokens: number; outputTokens: number;
  reasoningTokens?: number; cacheRead?: number; cacheWrite?: number; cost?: number; }
```

**Presets (`config/housemates.json` example):**

```jsonc
[
  { "id": "bea-frontend", "name": "Bea", "harness": "opencode",
    "agent": "frontend-ui-engineer", "model": "chatgpt-free/gpt-5.6-terra",
    "provider": "chatgpt-free", "reasoning": "high",
    "persona": "Masipag na frontend engineer; laging may update sa dulo ng turn.",
    "permissions": { "bash": "ask", "edit": "allow", "webfetch": "ask" },
    "projectRoots": ["D:/code_ni_kurt"], "sprite": "variant-1",
    "maxConcurrentTasks": 1 }
]
```

**Guests (`config/guests.json` example):**

```jsonc
{ "allowed": ["general", "review", "explore"], "denied": [],
  "maxPerHost": 3, "maxTotal": 8, "maxDepth": 2,
  "queueSpots": 4, "minVisibleMs": 3000, "timeLimitMs": 300000 }
```

**Audit line:** `{"ts":1731739200000,"actor":"kuya","action":"summon","target":"hm_bea_a1b2",
"detail":{"agent":"frontend-ui-engineer","model":"chatgpt-free/gpt-5.6-terra"}}`

## Endpoints (P4 additions; full table in master-plan §7.2)

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| POST | /api/housemates | Bearer | `{presetId?, name, agent, model, provider?, reasoning?, projectRoot, personaNote?, permissions?}` | 201 HousemateRec / 400 bad preset / 429 over cap |
| GET | /api/housemates | Bearer | — | HousemateRec[] with live usage |
| DELETE | /api/housemates/:key | Bearer | `{keepWorktree: true}` | `{ok, worktree, branch, diffStat}` |
| POST | /api/housemates/:key/call | Bearer | `{message, when?: "after-turn"\|"interrupt"}` | 202 |
| POST | /api/housemates/:key/answer | Bearer | `{questionId, option?, text?}` | `{ok}` |
| GET | /api/opencode/agents | Bearer | — | live agent catalog |
| GET | /api/opencode/models | Bearer | — | live provider/model catalog |
| GET | /api/housemates/:key/usage | Bearer | — | UsageSnapshot or `{available:false}` |
| GET | /api/audit | Bearer | `?limit=` | last N audit lines |

All: loopback + Host/Origin + Bearer + rate limit + audit.

## State machines

- Housemate: `arriving → idle ⇄ working → (blocked → queued_for_confession → in_confession) →
  … → evicting → (deleted)`, plus `called` branch from any active state; every transition emits
  the P2 event of the same name; reconcile restores the last persisted state on restart.
- Session/server: `starting → healthy ⇄ unhealthy → restarting → (dead | healthy)`; sessions
  inherit the server's health.
- Guest: `entering → at_desk → (timeLimit breach) → confession_escalation → leaving`.

## UI components and interactions

- Summon dialog (modal, opens from Console "Summon"): preset dropdown, name, agent (live),
  model (live + "agent default"), variant, project folder, persona, permissions summary,
  Save-as-preset, dirty-repo warning line (Rule 8), Summon button.
- Evict confirm (modal): diff stat block (uncommitted + unmerged vs base), kept-path lines
  (worktree + branch), Cancel/Evict.
- Diary panel: unchanged from P2; header now shows real agent/model from the session.
- Hover card: agent/model badges + usage line + rolled-up guest usage.
- Dead-session banner: "si X ay nawala — sessions tinanggal" via Kuya layer.

## Scene and animation behavior

All visuals come from P2 unchanged; P4 only feeds them real events. One addition: when a managed
session's worktree has uncommitted changes at evict time, the evict walk-out is preceded by a
brief `exclamation` emote and the banner shows the diff stat (informational only).

## Configuration files and fields

- `config/house.json` (extends P2): `{entrance, housemateCap, rateLimits{...}, audit{...}}`.
- `config/housemates.json`, `config/guests.json` as above (validated at load; errors logged and
  server refuses to start the affected feature, not the whole server).
- `config/runners.json`: `allowlistedRoots` becomes authoritative (P4-T32).

## Security considerations

- Every new endpoint: loopback, Host/Origin, Bearer (never query strings), body caps, rate
  limits, audit lines (P4-T30..33). Tests for rejects are part of the acceptance.
- `--auto` and any yolo flag: never set by the house unless the preset/job explicitly enables a
  specific permission (stored in `permissions`), and the audit log records it (Rule 7).
- Credentials: opencode auth is its own; we never read `auth.json` or provider keys; the client
  passes basic-auth credentials via env (`OPENCODE_SERVER_USERNAME/PASSWORD`) only if P3
  findings say the server requires them — values come from the environment, never from files we
  write. No key is logged; log capture redacts.
- Worktrees: created per housemate; kept forever on evict; the confirm dialog is the only place
  a human sees the diff stat. Merges: never automatic (P5's Approve button is the only merge
  path, into a user-chosen branch).

## Test plan

Unit:
- `test/phase4-registry.test.ts` — presets load/validate; cap enforcement; usage rollup
  (guest→host); `n/a` propagation when usage unavailable.
- `test/phase4-queue-real.test.ts` — real question payloads from P3 evidence files map to
  `question_asked`; answers map to verified reply calls (mocked transport with recorded shapes).
- `test/phase4-supervisor.test.ts` — fake server process (a tiny Bun script that binds a port
  and exits on signal): health transitions, restart backoff, state-file reconcile, kill-tree.
- `test/phase4-procutil.test.ts` — killTree kills a spawned child+grandchild pair on Windows.
- `test/phase4-security.test.ts` — P4-T33 rejected-request matrix.

Integration/real:
- `test/phase4-e2e-real.test.ts` (`// REAL`, env-gated): full loop on the P3 fixture repo;
  asserts worktree exists and is kept after evict, no orphan processes remain
  (`Get-Process opencode` filtered by our started pids).

Visual:
- `docs/screenshots/phase-4/` demo sequence + visual-check update.

## Verification steps with evidence to capture

1. P2/P3 UNVERIFIED items → status table in the report (resolved with evidence path, or degraded
   mode chosen).
2. Demo recording + screenshots.
3. `git worktree list` + `git branch` output showing kept `kuya/<name>-<id>` entries after evict.
4. Process list after the demo showing zero opencode orphans.
5. `bun test` full pass; security matrix results.
6. Audit log tail showing every action from the demo.

## Acceptance criteria

- All P4 tasks T1–T6, T10–T23, T30–T34 done; no TODOs.
- No opencode process orphans after any flow (verified by process listing).
- Worktree/branch never auto-deleted; diff stat visible at evict confirm.
- Questions never auto-answer; dead sessions handled with banner + queue cleanup.
- Caps and rate limits enforced with tests; audit log complete for the demo session.
- Standing rules 1–10 signed.

## Risks with fallbacks

- R1: API gaps discovered mid-phase (e.g. no abort route) → degraded mode documented per flow
  (e.g. evict = kill tree immediately, after-confirm), recorded in the report; protocol unchanged.
- R2: shared DB contention with the user's own opencode TUI → managed servers get dedicated
  ports and (if D5 approved) `--pure`; contention evidence from P3 decides one-server-for-all.
- R3: orphans → `procutil` with tree-walk fallback; reconcile sweep at startup kills any
  process whose port matches our state file but whose health is dead.
- R10: worktree sprawl → the evict response and the hover card show kept paths; `GET
  /api/housemates` lists all worktrees; a `kuya worktrees` CLI subcommand is a P5 candidate.

## Effort estimate

L (~6–8 working sessions).

## STOP gate

User reviews: demo recording, kept-worktree list, audit log tail, UNVERIFIED-resolution table,
decisions D5/D6 confirmation in the report, visual-check list. Next phase (5) starts only after
this review.
