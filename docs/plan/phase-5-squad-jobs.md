# Phase 5 — Squad jobs (branch `squad-jobs`)

## Goal and why it matters

Squad jobs turn the house into a rules-based team workspace: KUYA hands a brief to a squad of
opencode housemates (frontend, backend, two testers, a proofreader); the **house engine** — no
boss agent, no LLM in the loop — runs rounds, enforces path ownership and test immutability, runs
the gates itself, routes findings deterministically, and stops when objective gates pass and
reviewers approve N consecutive rounds. This is the core product shift: from watching agents to
running a squad.

## Prerequisites and dependencies

- P4 complete (supervisor, casting, summon/evict/confession/call, guests, caps, audit).
- Files: new `src/db.ts`, `src/jobs/{engine,gates,findings,enforcement,prompts}.ts`,
  `scripts/kuya-cli.ts`, `public/jobpanel.ts`; extended `src/server.ts`, `public/main.ts`,
  `public/flow.ts`, `config/jobs/*.json`.

## Standing rules (verbatim from master-plan §1)

Rules 1–10 apply. Specific to P5: Rule 8 (all jobs in one integration worktree `kuya/job-<id>`;
never auto-delete; never auto-merge — Approve only, into a user-chosen target), Rule 7 (job
control endpoints secured; gates run only by the house), Rule 4 (token/cost budgets use verified
usage data from P3/P4).

## Ordered task list

| ID | Task | Files |
| --- | --- | --- |
| P5-T1 | No boss agent: `src/jobs/engine.ts` is a deterministic loop with zero LLM calls — a state machine over rounds/turns/gates/findings; every decision is a rule (ordered steps, caps, exit conditions); pseudocode below | `src/jobs/engine.ts` |
| P5-T2 | Job template `config/jobs/*.json`, validated at load: `team: [{name, agent, model, role, ownedPaths: globs[], mayEditTests: bool, mayRunShell: bool, persona}]` (roles from a fixed set: `frontend, backend, tester, proofreader`; exactly one frontend, one backend in the first squad; testers ≥1; proofreader ≥1); validation errors list file+field and disable jobs (not the server) | `config/jobs/first-squad.json`, `src/jobs/engine.ts` (loader) |
| P5-T3 | `brief` (markdown goal, ≤4000 chars) and `rubric` (markdown checklist for reviewers) fields in the template | template schema |
| P5-T4 | `repo` path validated inside allowlisted roots (P4-T32 rules) at submit time | `src/jobs/engine.ts` |
| P5-T5 | `gates`: array of `{name, cmd, args[], cwd?, timeoutMs}` the HOUSE runs (never agents): `typecheck`, `lint`, `tests`, `build`, optional `e2e` / `screenshot`; each with a timeout (default 120 000 ms); gate results recorded `{gate, ok, durationMs, outputTail(50)}` | template + `src/jobs/gates.ts` |
| P5-T6 | `rounds`: ordered steps; default sequence `build (parallel write-scoped roles on disjoint paths) → gateA (typecheck+lint) → test (tester roles) → proofread → gateB (tests+build) → verdicts`; configurable order in the template | engine |
| P5-T7 | Exit rule: all gates pass AND zero open blocker/major findings AND every reviewer approves N consecutive rounds (`approvalsRequired` default 2) ⇒ status `awaiting_kuya` (Ready for Kuya panel) | engine |
| P5-T8 | Caps: `maxRounds` (default 8), `wallTimeMs`, `turnsPerRole`, `tokenBudget` / `costBudget` (from verified usage; skipped when `{"available":false}` with a logged warning), `maxConcurrentHousemates`, stagnation rule: same finding signature 3× or 2 consecutive rounds with no diff ⇒ `paused` + escalation question to the Confession Room ("paano tayo makakausad?") | engine |
| P5-T9 | First squad: `frontend` (agent `frontend-ui-engineer`), `backend` (agent `backend-systems-engineer`), `tester-1` (agent `qa-engineer`), `tester-2` (agent `code-reviewer`, read-only, different model), `proofreader` (NEW agent, see P5-T10) — all opencode, mapped to existing agents (D7); roles own disjoint path sets in the template | `config/jobs/first-squad.json` |
| P5-T10 | Proofreader agent: review-only (copy, comments, docs, UI text; cannot edit code) — propose `~/.config/opencode/agent/proofreader.md` **as a new file for approval** (D7); never overwrite existing agent files; the proposal text ships in the phase report; the job template references it only after approval (fallback: `code-reviewer` doubles as proofreader until approved) | report + template |
| P5-T11 | bun:sqlite `data/bahay.db` with tables `jobs, rounds, turns, findings, messages(minimal), artifacts, audit_log` (DDL in master-plan §8; migrations are versioned `PRAGMA user_version` steps in `src/db.ts`); WAL mode; all writes through one module | `src/db.ts` |
| P5-T12 | Finding record: `{id, severity: blocker|major|minor|nit, area?, path?, evidence, repro?, ownerRole, status: open|fixed|disputed|wontfix, raisedBy, round, signature}` (schema in master-plan §8) | `src/jobs/findings.ts` |
| P5-T13 | Findings from two sources: (a) house-run gates — failing output parsed (TS/tsc/test-runner line patterns; parser keeps raw tail as `evidence`) and routed by file path to the owning role; (b) agents via `kuya finding add` CLI/API | `src/jobs/findings.ts`, `src/jobs/gates.ts` |
| P5-T14 | Deterministic router: path ownership from `ownedPaths` globs first, then tags (path prefix heuristics `src/frontend/`, `src/api/` per template `routing.tags`); unroutable findings and disputes escalate to Kuya (Confession Room question of kind `question`) | `src/jobs/findings.ts` |
| P5-T15 | Turn prompts assembled by the house from: brief, rubric, role persona, open findings addressed to the role (severity order), latest gate results — **nothing else** (no chat history except inbox messages delivered in that turn, which arrive as a dedicated section) | `src/jobs/prompts.ts` |
| P5-T16 | Enforcement (`src/jobs/enforcement.ts`): after every turn, `git status/diff` the worktree — edits outside `ownedPaths` are saved as a patch under `<worktree>/.kuya/rejected/<turn>-<n>.patch`, reverted (`git checkout --` the files), and the role is told why next turn (a system finding + prompt section); test files are hash-tracked (`sha256` of every `*.test.*`/`test/**` path in the template's `tests.globs`): implementers' commits touching them are reverted the same way; `test` count and skipped-test count may not decrease without explicit Kuya approval (a pause + confession question); gates run only by the house (agents are told, and any gate command in their turn is a violation finding); one commit per turn authored as the role (`git -c user.name=<role> -c user.email=<role>@house.local commit`); all jobs run in one integration worktree `kuya/job-<id>` (branch of the same name) | `src/jobs/enforcement.ts` |
| P5-T17 | `kuya` command (PATH script for housemates, per-housemate scoped token via env): `scripts/kuya-cli.ts` compiled on the fly; subcommands `roster`, `message`, `finding add`, `update`, `ask`, `handoff`, `status`; each reads `KUYA_TOKEN` + `KUYA_BASE_URL` env (injected per worktree at turn start, scoped to that housemate's key; mutating subcommands rejected for a foreign housemate key); `update` is the P6 turn contract (see P6-T2); `ask` opens a confession question; `handoff` posts a handoff message + folder walk-over visual | `scripts/kuya-cli.ts` |
| P5-T18 | Per-worktree instructions: `src/jobs/instructions.ts` writes `.kuya/INSTRUCTIONS.md` into the job worktree (how to use `kuya`, the rules, current roster) — a separate file the harness reads; never touches the user's `AGENTS.md` or agent files | `src/jobs/instructions.ts` |
| P5-T19 | Job panel UI `public/jobpanel.ts` + `#job-panel`: roster (role + model badges + live state), round timeline (steps × rounds), gate results chips, findings by severity, budget/cap meters, buttons Pause / Resume / Stop, per-housemate read-only transcript tail (last 30 lines from `usage`/turn records — read-only, never the agent's private stream beyond verified data), final "Ready for Kuya" screen: diff stat, gate results, reviewer verdicts, buttons **Approve** (merge into a target branch I choose — default suggestion `kuya/ready`, never `main`; D9), **Request changes** (note becomes a finding addressed to the named role), **Discard** | `public/jobpanel.ts`, `public/index.html`, `src/server.ts` |
| P5-T20 | Scene: working housemates sit at office desks (existing), Kuya banner per round ("Round 3: testing"), folder walk-over when a finding is routed (P2 folder prop reused), facepalm emote on a failed gate (the role's emote), thumbs-up on approval | `public/main.ts`, `public/flow.ts` |
| P5-T21 | Acceptance: fixture repo (`%TEMP%/bahay-fixture-<ts>/`, seeded by `scripts/make-fixture.ts` shared with P3): a seeded bug, a missing feature and failing tests; a scripted squad (fake housemate client for CI, real housemates for the demo) loops until gates pass and reviewers approve within the caps; a deliberately broken squad config (an agent that edits tests — enforced by the hash lock — or a looping agent — enforced by stagnation/caps) is stopped by enforcement or caps; killing the server mid-job and restarting reconciles cleanly (jobs/rounds/turns persisted; supervisor adopts live sessions) | `scripts/make-fixture.ts`, `test/phase5-*.test.ts` |
| P5-T22 | Standing rules 1–10 checklist in the report | report |
| P5-T23 | STOP with a recording of a full job + the broken-squad stop | screenshots |

## Data formats

**Job template (`config/jobs/first-squad.json` example):**

```jsonc
{
  "id": "first-squad",
  "repo": "D:/code_ni_kurt/pixel-office",
  "team": [
    { "name": "bhea", "agent": "frontend-ui-engineer", "model": "chatgpt-free/gpt-5.6-terra",
      "role": "frontend", "ownedPaths": ["public/**", "assets/**"],
      "mayEditTests": false, "mayRunShell": false, "persona": "…" },
    { "name": "ben", "agent": "backend-systems-engineer", "model": "omniroute/antigravity/claude-sonnet-5",
      "role": "backend", "ownedPaths": ["src/**", "scripts/**"],
      "mayEditTests": false, "mayRunShell": false, "persona": "…" },
    { "name": "tora", "agent": "qa-engineer", "model": "chatgpt-free/gpt-5.5",
      "role": "tester", "ownedPaths": ["test/**"], "mayEditTests": true,
      "mayRunShell": false, "persona": "…" },
    { "name": "reva", "agent": "code-reviewer", "model": "omniroute/kr/claude-sonnet-4.5",
      "role": "tester", "ownedPaths": [], "mayEditTests": false,
      "mayRunShell": false, "persona": "read-only reviewer…" },
    { "name": "pok", "agent": "proofreader", "model": "agent default",
      "role": "proofreader", "ownedPaths": [], "mayEditTests": false,
      "mayRunShell": false, "persona": "copy/docs/UI text only; cannot edit code" }
  ],
  "briefMd": "<goal markdown>",
  "rubricMd": "<checklist markdown>",
  "gates": [
    { "name": "typecheck", "cmd": "bunx", "args": ["tsc", "--noEmit"], "timeoutMs": 120000 },
    { "name": "lint", "cmd": "bun", "args": ["run", "validate-furniture"], "timeoutMs": 60000 },
    { "name": "structure", "cmd": "bun", "args": ["run", "structure-lock"], "timeoutMs": 60000 },
    { "name": "tests", "cmd": "bun", "args": ["test"], "timeoutMs": 300000 },
    { "name": "build", "cmd": "bun", "args": ["run", "generate-map", "--check"], "timeoutMs": 60000 }
  ],
  "roundSteps": ["build", "gateA", "test", "proofread", "gateB", "verdicts"],
  "approvalsRequired": 2,
  "caps": { "maxRounds": 8, "wallTimeMs": 3600000, "turnsPerRole": 24,
            "tokenBudget": 1500000, "costBudget": null, "maxConcurrentHousemates": 4 },
  "routing": { "tags": { "public/": "frontend", "assets/": "frontend",
                         "src/": "backend", "scripts/": "backend", "test/": "tester" } }
}
```

(Gate commands are placeholders pending decision D8; final list confirmed at P5 STOP.)

**Engine loop pseudocode:**

```
loop rounds:
  if paused or capsExceeded: escalate(confession); break
  step build:    for role in writeScopedRoles: turn(role, prompt=assemble(role))  // parallel, disjoint paths
  step gateA:    gates(typecheck, lint); failures → findings(routed)
  step test:     turn(tester1), turn(tester2)  // may add tests
  step proofread: turn(proofreader)            // findings only, no edits
  step gateB:    gates(tests, build); failures → findings(routed)
  step verdicts: collect reviewer verdicts; if exitCondition: status=awaiting_kuya; break
  enforce post-turn diffs, commit each turn, update budget meters
```

**Turn prompt skeleton (text file sent as the prompt):**

```
# Round 4 — your role: frontend (owned: public/**, assets/**)
## Brief
<briefMd>
## Rubric (reviewers will check)
<rubricMd>
## Open findings for you
- [major] src/... (round 2, raisedBy house/gateA): <evidence>
## Latest gate results
- typecheck: FAIL — <tail lines>
## Rules
- edit only your owned paths; test files are locked; never run gates; end with `kuya update "<summary>"`.
## Inbox
<messages addressed to you, unresolved first then latest N>
```

## Endpoints (P5 additions; auth per Rule 7)

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| POST | /api/jobs | Bearer | `{templateId, briefMd?, overrides?}` | 201 JobRec / 400 invalid template / 429 |
| POST | /api/jobs/:id/control | Bearer | `{action: "pause"\|"resume"\|"stop"}` | `{ok}` |
| GET | /api/jobs/:id | Bearer | — | full record |
| GET | /api/jobs/:id/panel | Bearer | — | panel payload |
| POST | /api/jobs/:id/verdict | Bearer | `{action: "approve"\|"request-changes"\|"discard", targetBranch?, note?}` | `{ok}` — approve merges ONLY into `targetBranch` (never `main`) |
| POST | /api/kuya/findings | Bearer | Finding add payload | 201 Finding |
| POST | /api/kuya/update | Bearer | turn-contract payload (P6) | `{ok}` |

The `kuya` CLI hits these with a per-housemate token; the CLI validates the housemate key in the
payload matches the token's scope.

## State machines

**Job:** `queued → running ⇄ paused → awaiting_kuya → (done | discarded)`, plus `failed` (caps
exhausted / engine error). Transitions audited; every transition emits a Kuya banner.

**Round:** `building → gating → testing → proofing → verdicts → done|failed`.

**Finding:** `open → fixed | disputed → (resolved by Kuya) | wontfix (Kuya only)`.

**Turn:** `queued → running → (committed | reverted(out-of-scope) | missing-update → re-prompted
once → system finding)`.

## UI components and interactions

Job panel as specified in P5-T19; opened from the console or a housemate hover card when a job is
running; transcript tails are read-only text (no agent-private stream). Ready-for-Kuya screen
blocks further rounds; Approve/Request-changes/Discard are the only exits.

## Scene and animation behavior

P5-T20 (desks, banners, folder walk-over, facepalm, thumbs-up). Pause state shows characters
waiting with a `question` emote; brownout-style visuals come in P7.

## Configuration files and fields

- `config/jobs/first-squad.json` (full example above; loader validates team constraints, path
  disjointness, gate definitions, caps).
- `data/bahay.db` (master-plan §8 DDL).
- `.kuya/INSTRUCTIONS.md` generated per worktree.

## Security considerations

- Gates run only by the house process with its own env (no agent tokens); gate commands are
  allowlisted by template (no free-form commands from agents).
- Per-housemate tokens: short-lived (job-scoped), passed by env into the turn's worktree only;
  cannot mutate other housemates' findings/messages; audit-logged.
- Approve/merge requires an explicit target branch (never `main`/`master` default), executed by
  the server (not an agent) and audited.
- Prompt content and finding evidence are stored with the P6 redaction filter applied (secrets
  never enter `data/bahay.db`).
- Worktree path/branch names are validated (`kuya/job-<id>` only) to prevent path traversal via
  names.

## Test plan

Unit:
- `test/phase5-template.test.ts` — template validation (team constraints, disjoint paths, gate
  shape, caps ranges); invalid file ⇒ clear error list.
- `test/phase5-findings.test.ts` — gate output parser routes by path; router picks ownerRole;
  unroutable → kuya; signature dedupe (same signature 3× ⇒ stagnation).
- `test/phase5-enforcement.test.ts` — out-of-scope edit → patch saved to `.kuya/rejected/` +
  reverted + told-why finding; test-hash lock reverts implementer test edits; skipped-test count
  decrease requires approval; per-turn commit author = role.
- `test/phase5-prompts.test.ts` — prompt assembly = brief + rubric + persona + role findings +
  gate results + inbox only (assert exact sections, no extra content).
- `test/phase5-engine.test.ts` — round machine ordering; exit rule (N consecutive approvals);
  caps and stagnation pauses; pause/resume/stop; reconcile after simulated restart (reopen DB).

Integration:
- `test/phase5-e2e-fixture.test.ts` (scripted fake housemates): seeded fixture repo (bug +
  missing feature + failing tests) → job runs to `awaiting_kuya` within caps; gates green;
  findings lifecycle visible in DB.
- `test/phase5-broken-squad.test.ts` — (a) a fake housemate that edits tests: enforcement reverts
  and job proceeds; (b) an agent that loops forever: stagnation/cap stops the job and escalates.
- `test/phase5-restart.test.ts` — kill server mid-job (simulated by reopening the DB and
  re-running engine adopt), assert clean reconcile.

Real:
- `test/phase5-e2e-real.test.ts` (`// REAL`, env-gated): one small job on the fixture repo with
  real opencode housemates (uses P4 supervisor), ≤ small token budget.

Visual:
- Screenshots of job panel stages + scene banners into `docs/screenshots/phase-5/`.

## Verification steps with evidence to capture

1. Fixture job recording: rounds, gates, findings, approval, Ready-for-Kuya, Approve merge into
   the chosen branch.
2. Broken-squad recording: enforcement stop and cap stop.
3. Kill/restart transcript: jobs/rounds intact after restart.
4. DB dumps (`sqlite3` style queries) showing jobs/rounds/turns/findings rows for the run.
5. Audit log tail for the job.
6. `bun test` full pass.

## Acceptance criteria

- Engine contains no LLM calls (grep-verifiable: no opencode client import in `engine.ts`).
- All squad jobs run in `kuya/job-<id>` worktree; no auto-delete; no auto-merge.
- Enforcement blocks out-of-scope edits and test tampering with evidence in `.kuya/rejected/`.
- Caps and stagnation stop runaway jobs; server restart reconciles.
- `kuya` CLI works from a worktree with a scoped token; roster/message/finding/update/ask/
  handoff/status all exercised in tests.
- Standing rules 1–10 signed; decisions D7–D9/D12 confirmed in the report.

## Risks with fallbacks

- R4 (cost blow-up) → caps + stagnation + confession escalation (pause, human decides).
- R5 (out-of-scope edits) → enforcement with patch retention (no silent loss).
- R6 (noisy findings/disputes) → severity router + disputes to Kuya; N-consecutive-approval exit.
- R9 (flaky real E2E) → scripted fake housemates for CI; the real run is opt-in.
- Missing proofreader agent (D7 unapproved) → `code-reviewer` covers proofreading temporarily;
  template notes the substitution.
- Gate flakiness (e.g. `bun test` machine-dependent real-opencode test) → gates exclude `// REAL`
  tests via a documented marker filter; the P1-GAP-1 validator fixture tests land here if
  approved (they are fast and deterministic).

## Effort estimate

L (~7–9 working sessions; largest phase).

## STOP gate

User reviews: job recording, broken-squad stop, restart reconcile, DB/audit evidence, decisions
D7 (squad mapping + proofreader file), D8 (gate commands), D9 (merge target), D12 (budget).
Phase 6 starts after this review.
