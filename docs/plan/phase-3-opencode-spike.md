# Phase 3 — opencode feasibility spike (branch `spike-opencode`)

## Goal and why it matters

Everything in Phases 4–7 depends on controlling opencode programmatically: starting a background
server, creating sessions, choosing agent+model, sending prompts, subscribing to events,
answering permission/question asks, aborting turns, reading usage/cost, managing subagents, and
cleaning up processes on Windows. None of that is verified yet — only the CLI surface (`opencode
--help`, `serve --help`, `run --help`) and the local SQLite DB are known (STATE §11). This phase
is a bounded, throwaway spike that turns UNVERIFIED claims into captured evidence under
`spikes/opencode-control/FINDINGS.md`, and ends with an explicit go/no-go.

## Prerequisites and dependencies

- Phase 0 audit (facts in STATE §11: opencode 1.18.35, Bun 1.3.14, existing auth at
  `~/.local/share/opencode/auth.json` — never read by us).
- Runs **in parallel** with Phase 2. Phase 4 must not start until both P2 and P3 STOP.
- No app code is touched; all spike code lives under `spikes/opencode-control/`.

## Standing rules (verbatim from master-plan §1)

Rules 1–10 apply. Specific to P3: Rule 4 is the entire point (captured evidence under docs/ —
here, under `spikes/opencode-control/` per the spec, with copies of any user-facing conclusions
referenced from `docs/opencode-evidence/`); Rule 7 (no credentials read/stored/logged —
`auth.json` and provider API keys are off-limits; if a captured payload must contain a key it is
redacted before commit); Rule 9 (Windows-first process management evidence); Rule 10 (report at
the end).

## Safety boundaries

- All experiments run against a **throwaway sample git repo in a temp directory**
  (`%TEMP%/bahay-spike-<ts>/`), created by `spikes/opencode-control/make-fixture.ps1`:
  `git init`, seed `README.md`, `src/app.ts`, `src/app.test.ts` (one passing, one failing test),
  initial commit. Never the real repo, never a user repo.
- Real API spend is bounded: harmless prompts only (`"List the files in this repo and stop."`,
  `"Add a comment 'spike' to the top of src/app.ts."`), max 6 turns total across the spike
  (decision D4 asks approval for this budget).
- No auto-approve flags (`--auto`) unless a probe explicitly needs to answer permissions through
  the API — in that case the permission is answered via the verified API call, not by flags.
- Managed servers run on dedicated ports (40041+) with `--hostname 127.0.0.1`; every script
  records the PID tree it spawned and kills it via the recorded cleanup command (FINDINGS item
  11) before exiting; a `finally` block runs `cleanup.ps1` even on Ctrl+C.
- Nothing is ever written into `~/.config/opencode/` or `~/.local/share/opencode/` by the spike.

## Ordered task list

| ID | Task | Files |
| --- | --- | --- |
| P3-T1 | Create the throwaway sample git repo in a temp directory: `spikes/opencode-control/make-fixture.ps1` builds `%TEMP%/bahay-spike-<ts>/` with `git init`, `README.md`, `src/app.ts`, `src/app.test.ts` (1 passing + 1 failing test), initial commit; prints the path | `spikes/opencode-control/make-fixture.ps1` |
| P3-T2 | Open `spikes/opencode-control/FINDINGS.md` with the 12 numbered items, each to be marked `WORKS`, `WORKS WITH CAVEAT` or `NOT POSSIBLE`, with: exact command, version, captured stdout/stderr excerpt, files created, and a repro script name. End matter: go/no-go + open questions | `spikes/opencode-control/FINDINGS.md` |
| P3-T3 | Item 1 — installed version + background server: record `opencode --version`; run `opencode serve --port 40041 --hostname 127.0.0.1` as a background process from PowerShell (`Start-Process` or Bun `spawn`), capture the startup log line that names the real bound port/address; verify with an HTTP request (exact route/shape to be discovered — candidates: `/healthz`, `GET /`); record whether basic auth is required by default (`OPENCODE_SERVER_USERNAME/PASSWORD` defaults from `run --help`) | `spikes/opencode-control/probe1-server.ps1` |
| P3-T4 | Item 2 — several sessions on ONE server: from the captured API surface (start with `opencode export`/`session` CLI + server HTTP discovery), create 3 sessions with different directories (main fixture dir, a second copy, a git worktree inside it); record request/response; then load 3 concurrent prompts and count how many actually run in parallel (watch `session.status`/busy events); record limits | `probe2-sessions.ps1|ts` |
| P3-T5 | Item 3 — agent AND model per session/prompt: read `~/.config/opencode/agents/*.md` names (real agents: backend-systems-engineer, frontend-ui-engineer, qa-engineer, code-reviewer, debugger, security-engineer, …) and `opencode.json` providers/models; send the SAME prompt to 3 sessions with 3 different (agent, model) combos from that real set; capture which model actually answered (from message/assistant parts or usage payload); record whether model must be set per-session, per-request or both | `probe3-agent-model.ts` |
| P3-T6 | Item 4 — prompt → wait → result + diff: send a prompt that edits one file, poll/subscribe until idle, fetch the assistant result text, and compute `git diff` in the fixture repo; record how the API reports turn completion (event? polling?) and where changed-file info comes from | `probe4-turn.ts` |
| P3-T7 | Item 5 — live event stream: find the streaming surface (SSE/WebSocket/HTTP poll; CLI `--format json` stream as fallback) and capture raw samples for: session created, busy, idle, tool calls, permission asked, question asked, errors, child (subagent) sessions. Save each as a numbered file under `spikes/opencode-control/evidence/events/*.json` (redacted) and index them in FINDINGS | `probe5-events.ts` |
| P3-T8 | Item 6 — answer + abort: trigger one harmless permission ask (e.g. an agent asked to run a shell command when configured to ask), answer it through the API; trigger one `text` question and answer it; abort a running turn mid-flight; record request shapes, whether answers need ids, and abort behavior (turn state after abort, whether the process survives) | `probe6-permissions.ts` |
| P3-T9 | Item 7 — tokens/cost: locate usage data (per message, per session; input/output/reasoning/cache tokens; cost fields). Capture one real sample with the numbers visible; check `opencode stats` CLI output shape too. Record where reasoning tokens and cache reads/writes appear | `probe7-usage.ts` |
| P3-T10 | Item 8 — agents/providers/variants via API: list agents with names, mode (primary/subagent/all), default model; list connected providers and their models; check reasoning/variant options (`--variant` flag exists — find its API equivalent). Diff against `~/.config/opencode/agents/` + `opencode.json` contents and record mismatches | `probe8-catalog.ts` |
| P3-T11 | Item 9 — subagent lifecycle: spawn a turn that delegates to a subagent (real agents have task/delegation tools); capture child session created (parentID, agent, title), busy, finished, error, abort; how completion signals the parent; where the child's permission/question surfaces (own session? parent? both?) | `probe9-subagents.ts` |
| P3-T12 | Item 10 — override semantics: does an explicit model/variant on the request override the agent's configured model? Configure one agent with a fixed model (temp copy of an agent file inside the FIXTURE repo's `.opencode/agent/` if supported, else document the config-only path), then request with a different model and record which wins (message metadata proves it) | `probe10-override.ts` |
| P3-T13 | Item 11 — login reuse + orphans: verify the background server uses the existing opencode login with no extra key (no `auth.json` access by us; server starts and serves a model call). Kill the parent PowerShell script abruptly (`taskkill /F /PID <parent>`), wait, list any surviving opencode processes; record the EXACT cleanup command that works on Windows (`taskkill /T /F /PID` vs `Stop-Process -Id` vs killing by port owner) and whether `serve --port` + `--print-logs` gives a reliable owner PID | `probe11-orphans.ps1`, `cleanup.ps1` |
| P3-T14 | Item 12 — CPU/memory with 3 active sessions: `Get-Process` sampling of the opencode tree every 2 s during the concurrency probe; record steady-state RSS + CPU% per session and total | `probe12-resources.ps1` |
| P3-T15 | Go/no-go + open questions in FINDINGS.md; list every UNVERIFIED item that remains and what would de-risk it | FINDINGS.md |
| P3-T16 | Standing-rule audit: confirm no app files touched (`git status` clean except `spikes/` + docs), no credentials in any captured file (grep for `apiKey`, `authorization`, `token` values in evidence before commit), temp dirs cleaned | FINDINGS.md checklist |

## Data formats

- FINDINGS.md item template:
  ```
  ### N. <title>
  - Verdict: WORKS | WORKS WITH CAVEAT | NOT POSSIBLE
  - Command: <exact>
  - Evidence: <file under evidence/ or transcript excerpt>
  - Caveats: <...>
  - Repro: probe<N>-<name>.<ext>
  ```
- Evidence files: raw captured payloads, one JSON per numbered event type, filenames
  `evidence/events/<nn>-<event-name>.json`. Redaction rule: replace any token-ish string
  (>20 chars, `sk-`, `Bearer `, `authorization`) with `REDACTED` before saving; a checker script
  `check-evidence.mjs` greps the evidence dir for leaks and fails loudly.
- Fixtures: `make-fixture.ps1` writes the same seed repo shape P5 will use (so P4/P5 reuse it).

## Endpoints

No endpoints are built. The spike *discovers* opencode's own endpoints; every discovered route
goes into FINDINGS as `{method, path, auth, request, response}` rows so P4's
`src/opencode-client.ts` can be written from the table, not from guesses.

## State machines

Observed, not built: session lifecycle (created → busy → idle → …), subagent lifecycle,
permission/question pending states. FINDINGS records the observed transitions with event
samples; P4's supervisor state machine will be written from that table.

## UI components and interactions

None (no app changes).

## Scene and animation behavior

None.

## Configuration files and fields

None in the app. Spike-local config: `spikes/opencode-control/config.json`
`{port: 40041, fixtureDir: "%TEMP%/bahay-spike-<ts>", agents: [...3 chosen...],
models: [...3 chosen...], maxTurns: 6}` — agents/models must come from the user's real config
(read, not invented; STATE §11 lists them).

## Security considerations

- Credentials: the spike never reads `~/.local/share/opencode/auth.json`, never reads
  `~/.config/opencode/opencode.json` values beyond model/agent names (no apiKey strings are
  copied anywhere; the check-evidence grep enforces it), never logs env vars.
- Network: managed servers bind 127.0.0.1 on dedicated ports; no `--cors` additions; no mDNS.
- Process hygiene: every probe owns its children and runs the recorded cleanup in `finally`;
  the final report lists any process that could not be killed and the command that worked.
- Repo hygiene: spike code is confined to `spikes/opencode-control/`; `git status` must show no
  changes elsewhere when the phase ends.

## Test plan

- The spike has no automated test suite (it IS the evidence). But `check-evidence.mjs` acts as a
  gate: fails if FINDINGS.md has an unmarked item, if an item lacks command+evidence lines, or
  if any evidence file contains credential-shaped strings.
- `bun test` in the app repo must still pass untouched (guards the "do not touch the app" rule).

## Verification steps with evidence to capture

1. Every FINDINGS item carries: verdict, exact command, evidence file path, repro script name.
2. `opencode --version` output captured in FINDINGS header (1.18.35 expected).
3. Event samples for every type listed in item 5 saved under `evidence/events/`.
4. One real usage/cost sample (item 7) with numbers visible.
5. One orphan-kill transcript (item 11) showing before/after process lists and the working
   cleanup command.
6. CPU/memory table (item 12) with 3 sessions.

## Acceptance criteria

- All 12 items have verdicts; none says "TBD".
- A go/no-go line exists with at least the open questions listed.
- `git status` on the app repo shows changes only under `spikes/opencode-control/` and (this
  phase's report) `docs/`.
- No leftover opencode processes after cleanup (verified by `Get-Process opencode`).
- Standing rules 1–10 checklist signed (esp. 4, 7, 9, 10).

## Risks with fallbacks

- **R1**: opencode 1.18.35's server API may not expose session-create or answer routes.
  Fallback ladder: (a) discover via `opencode attach` + TUI network capture; (b) `run --attach`
  one-shot sessions against a managed server; (c) `run --format json` as a batch process per
  turn (works today, loses live event streaming); (d) no-go for live control, keep DB-watch
  display-only. Each fallback is a documented P4 design variant — decide at P3 STOP, not later.
- **R2**: a managed server might collide with the user's own opencode instance (shared DB,
  shared auth). Mitigation: dedicated port, observe DB behavior; if contention appears (DB
  locks), record it and propose one-server-for-all-housemates as the P4 design.
- **R3**: orphaned processes on kill. Mitigation: record the working cleanup command; P4's
  supervisor builds on exactly that command and adds PID-tree walking.
- **Spend risk**: harmless prompts only; if a provider errors repeatedly, stop after 2 retries
  and record NOT POSSIBLE rather than burning budget.

## Effort estimate

M (~2–3 working sessions of experiments + evidence writing).

## STOP gate

User reviews: FINDINGS.md (verdicts + go/no-go), the evidence sample set, the open questions,
and decisions D4 (spend approved), D5 (`--pure` for managed sessions) which the findings should
inform. Phase 4 starts only on an explicit go with P2 complete.
