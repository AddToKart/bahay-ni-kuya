# Bahay ni Kuya — Master Plan

Status: v1, written 2026-11-16 on branch `master-plan`. Source spec: the KUYA directive
(2026-11-16). Audit of record: `docs/STATE.md` (Phase 0). Assumptions: `docs/ASSUMPTIONS.md`.
Open questions: `docs/OPEN-QUESTIONS.md`. Per-phase detail: `docs/plan/phase-<n>-<name>.md`.

Bahay ni Kuya is a local web app (Bun server, PixiJS scene, Windows) where AI coding agents are
housemates in a Pinoy-Big-Brother-style parody house and the user is KUYA. It is a team
workspace: summoned opencode housemates work in a squad loop until objective gates pass and
reviewers approve; the PBB flow is real (summon = walk in through the door, evict = leave with a
suitcase, questions/permissions = the Confession Room, talking = calling to the Confession Room,
subagents = house guests).

**Scope: OPENCODE ONLY for control and verification.** Every schema keeps a `harness` field
(`"opencode" | "codex" | "pi" | "omp" | "hermes"`) so other harnesses can be added later as
adapters, but no phase plans control or verification for codex, pi, omp or hermes — see the
"Later harnesses" note in §14.

---

## 1. Standing rules (encoded in every phase's acceptance criteria)

These are quoted-or-derived from the KUYA directive; each phase doc repeats them verbatim as its
"Standing rules" section and its acceptance criteria check them.

1. **Branch per phase.** One branch per phase with the name given in §5, created from the latest
   approved state (previous phase's STOP-gate branch). One commit per milestone step. **Never
   push** to any remote.
2. **House structure lock.** The building structure — rooms, walls, doors, hallway, exterior,
   camera framing — is approved and MUST NOT change. `bun run structure-lock` must keep passing
   (it hashes `docs/structure-baseline.json`; never edit the baseline to make it pass). If a
   phase needs a structural change, propose it in the phase report instead; nothing in Phases
   1–8 currently requires one.
3. **Art.** Oddboro-derived assets (Apache-2.0) are already in use; keep `NOTICE`, root `README`
   credits and `docs/oddboro-license-audit.md` correct; every new/modified sprite gets an
   `assets/MANIFEST.md` row. No procedural or placeholder-generated art. If a sprite or animation
   needed by a phase is missing, STOP and list it (do not invent art). No PBB logos, audio,
   footage or trademarked material; parody names (Confession Room, Kuya, Head of House) are fine.
4. **Verify, never guess.** Any claim about opencode's API, events, flags or config must be
   backed by captured real output saved under `docs/` (command transcript, version, payload
   sample). Claims marked UNVERIFIED carry a verification task in the phase that depends on them.
   All opencode-dependent behavior degrades gracefully (never blocks the house) when a claim
   fails verification.
5. **Validation discipline.** No "judged compliant" escape hatches, no loosening a check to make
   it pass, no allowlists that silence a failing rule. If a rule seems wrong, leave it failing
   and list it under NEEDS HUMAN DECISION in the phase report.
6. **Visual proof.** Whenever a phase changes what is drawn: render real before/after screenshots
   into `docs/screenshots/<phase>/`, open the AFTER images, and update `docs/visual-check.md`
   listing every visible problem still present (floating, overlapping, misaligned, off-scale
   props; broken animations). A phase is not done while that list contains fixable items.
7. **Security for every control endpoint** (summon, evict, call, answer, chat, dispatch, job
   control, layout save): bind 127.0.0.1 only; Bearer token stored at
   `%USERPROFILE%\.bahay-ni-kuya\token` (generated on first run, never in query strings); Host
   and Origin checks; `cwd`/`projectRoots` must resolve inside allowlisted roots; rate limits;
   audit log of every action; no auto-approve or yolo flags unless enabled per preset or job.
   Credentials (API keys, logins) are never read, stored, logged or written to config; opencode
   uses its own existing login (`~/.local/share/opencode/auth.json` is NEVER opened by this app).
   Every phase that adds an endpoint adds tests for rejected requests (401/403/413/429/400).
8. **Safety.** Agents run in git worktrees `kuya/<name>-<id>`, never in the main working tree.
   The house NEVER deletes a worktree or branch automatically and NEVER merges automatically
   (merges happen only via the explicit Approve button, into a branch the user chooses, never
   `main` by default). Dirty-repo and "only copy" warnings are shown before jobs start.
9. **Stack.** Bun, TypeScript, `bun:sqlite` for persistence, no Next.js, no required build step.
   PixiJS and a small UI layer only where the current code already needs them. Windows and
   PowerShell first-class: process management must kill process trees (no orphans) and reconcile
   state on server restart.
10. **Phase report.** Every phase ends with a report (appended to the phase doc or written to
    `docs/plan/phase-<n>-<name>-report.md`): what works, what is stubbed, what to test by hand,
    files changed, tests run, anything unsupported or UNVERIFIED, NEEDS HUMAN DECISION items.
    All existing tests, `structure-lock` and `validate-furniture` must pass at every STOP gate.
11. **No custom subagents.** Subagents are opencode's own mechanism, never the house's:
    - The house NEVER creates, spawns, simulates or fakes subagents. A subagent exists only when
      an opencode housemate itself invokes opencode's built-in mechanism (the task tool and
      agents in subagent mode defined in the user's opencode config). It appears to the house as
      a CHILD SESSION (`parentID`). The house only OBSERVES child sessions and renders them as
      GUESTS (read-only: arrival, work, usage rollup, leaving).
    - The house must not create child sessions itself (never call session create with a
      `parentID` or any equivalent) and must not start any extra opencode process, session or
      LLM call for helper purposes. The only sessions the house ever creates are the PRIMARY
      sessions of housemates that the user explicitly summons (or that a job template the user
      started lists).
    - Squad roles (frontend, backend, testers, proofreader) are separate primary housemates,
      never subagents. Cross-housemate communication goes through the house message layer,
      never through spawned agents.
    - The house engine contains no LLM calls and no hidden helper agents (recaps, scoring,
      routing and summaries are deterministic code).
    - The house does not create, edit or delete opencode agent definitions. The only agent file
      ever proposed is a review-only `proofreader.md`, written as a PROPOSED file for approval,
      never installed automatically.
    - "Denied guest types" must not be implemented by replacing a subagent with a house-made
      one. It is planned as either (a) opencode's own permission or task configuration
      (verified in the spike; a config change is PROPOSED in docs for the user to apply
      themselves), or (b) aborting the child session through the verified abort call with a
      banner and a Confession Room notice. See decision D13.
    - The Phase 7 "wildcard housemate" is only an ordinary primary housemate that the user
      summons manually with a narrow brief and that the user (or its job) later evicts. It is
      never a child session and never auto-summoned by the house or by another housemate.
    - Enforcement: (a) guard script `scripts/guard-no-custom-subagents.ts` registered as
      `bun run guard` and run by the test suite, failing if any source file outside the
      housemate-summon path creates sessions, passes a `parentID` on create, or spawns agent
      processes; (b) unit tests proving guests are created only from observed child-session
      events and never from house actions; (c) a spike item (P3-T11b) confirming native
      task-tool child sessions carry `parentID`, agent name and title, and recording how a
      native subagent differs from a direct session create with a `parentID`; (d) a runtime
      assertion plus audit log entry if the house ever sees a child session it did not observe
      being created by an opencode housemate (flagged as an anomaly in the Confession Room).

## 2. Current state in one paragraph

The house exists and is stable: PixiJS scene over a locked 42×27 Tiled map (8 rooms + hallway,
7 interior doors, no exterior door), A* nav, house-life POI scheduler, task-flow event protocol
with blocked→confession-room routing, hover cards, Kuya Taglish banner layer, headless task
dispatcher with worktrees, MCP wrapper, and five fail-silent harness adapters (opencode currently
served by a 3-second SQLite DB watcher, not a live event stream). The furniture pass is done and
validators pass. Missing entirely: real opencode session control, summon/evict/confession
choreography, confession queue and diary panel, guests, squad jobs, persistence, conversation
layer, season meta. Details and findings IDs (F-ADP-01 … F-STATE-01) are in `docs/STATE.md` §10–12.

## 3. Phase list with dependency graph

| Phase | Branch | Name | Size | Depends on |
| --- | --- | --- | --- | --- |
| 0 | master-plan (this branch) | Audit | S | — (done as `docs/STATE.md`) |
| 1 | furniture-fix-2 | Visual stabilization | S→done at audit time; residual S | 0 |
| 2 | pbb-flow-visual | PBB flow visuals with fake events | M | 1 |
| 3 | spike-opencode | opencode feasibility spike | M | 0 (independent of 2's visuals; needs 1's stable repo only) |
| 4 | opencode-housemates | Real opencode housemates | L | 2 + 3 (both) |
| 5 | squad-jobs | Squad jobs engine | L | 4 |
| 6 | conversation | Conversation layer | M | 5 |
| 7 | season-1 | Season 1 meta | M | 5 (6 recommended, not blocking) |
| 8 | polish | Polish and backlog | S–M, item-by-item approval | 7 |

Dependency graph and reasons:

```
        P0 audit ──► P1 furniture-fix-2 ──► P2 pbb-flow-visual ──┐
              └────► P3 spike-opencode ────► P4 opencode-housemates (needs BOTH)
                                                │
                                                ▼
                                    P5 squad-jobs ──► P6 conversation ──► P7 season-1
                                                └────────► P7 season-1 ──► P8 polish
```

- **P1 → P2**: the entrance/confession choreography moves real props and POIs (guest desks,
  walk path, door overlay); furniture and validators must be stable first or every P2 screenshot
  re-opens P1 defects.
- **P2 → P4**: the summon/evict/confession/guest visuals and protocol extensions are designed
  against fake events; P4 replaces the fake event source with real opencode control without
  touching the visuals. Building both at once would make every visual defect look like an API
  defect and vice versa.
- **P3 → P4**: opencode's server API, event names, permission/question answer routes, usage
  fields and process-management behavior are UNVERIFIED until the spike records real evidence
  (`spikes/opencode-control/FINDINGS.md`). P4 adapts to those findings; no-go ⇒ P4 and its
  dependents are re-scoped.
- **P4 → P5**: squad jobs spawn/steer housemates through exactly the supervisor paths P4 builds;
  findings/gates need real per-turn sessions and usage data.
- **P5 → P6**: conversation messages are routed per turn/round; the turn contract and inbox
  delivery depend on the squad loop's round/turn records existing first.
- **P5 → P7**: scoring/nomination/groceries consume jobs, rounds, findings and budget data
  written by P5 (P6 data only enriches it).
- **P7 → P8**: polish items require the full feature set to exist before tuning/packaging.

## 4. Phase sizing and what each phase ships

| Phase | Ships | Size rationale |
| --- | --- | --- |
| 0 | docs/STATE.md audit | S — read-only inventory |
| 1 | validator v2 (drawn bounds), layout editor, map fixes | S — already executed at audit time; residual work = reopen any listed art debts |
| 2 | protocol v2 events, arriving/evicting/in_confession states, entrance overlay, confession queue + ON AIR + diary panel, summon/evict/call console, guest visuals, fake flow script | M — visuals + protocol + fake engine, no real integration |
| 3 | spikes/opencode-control evidence pack + go/no-go | M — pure research, careful safety boundaries |
| 4 | supervisor, casting/presets, real summon/evict/confession/call, guests policy engine, audit log, housemate caps | L — process management on Windows + protocol + UI + tests |
| 5 | job engine, SQLite schema, gates, findings router, enforcement, `kuya` CLI, job panel | L — biggest surface; deterministic engine + DB + UI |
| 6 | messages schema, turn contract, inbox, eavesdrop feed, redaction, replay | M — builds directly on P5 tables |
| 7 | scoring, nomination night, groceries (fridge), brownout, Kuya cam, rules poster/strikes, wildcard | M — mostly derived from existing data |
| 8 | approved polish items | S–M |

## 5. Combined risk register (per-phase risks live in each phase doc)

| ID | Risk | Phases | Mitigation / fallback |
| --- | --- | --- | --- |
| R1 | opencode server API differs from assumptions (no session-create HTTP route, different event names, no permission/question route) | 3,4 | Phase 3 spike before any P4 code; every P4 module has a degraded mode (e.g. watch-only, manual confession fallback) and P4 report lists UNVERIFIED→resolved status |
| R2 | opencode background server dies, orphans or fights the user's own TUI sessions (port clash, shared DB) | 3,4 | supervisor uses dedicated ports (`--port`), `--pure` for managed sessions is decided in P3, PID+state-file reconcile, PowerShell tree-kill utility with tests, never touches user TUI sessions |
| R3 | Windows process-tree kill leaves orphans | 4,5 | `taskkill /T /F` + PID-tree walk utility, verified in the spike (FINDINGS item 11), tested with a spawned child process in tests |
| R4 | Prompt/tokens cost blow-up on loops | 5,7 | caps (maxRounds, wall time, turns per role, token budget), stagnation rule pauses and escalates to the Confession Room |
| R5 | Out-of-scope edits by agents corrupt the worktree | 5 | post-turn diff + revert of non-ownedPaths with patch under `.kuya/rejected/`, test-file hash lock, one commit per turn |
| R6 | Squads stall on noisy findings or disputes | 5,6 | severity router, disputes escalate to Kuya, N-consecutive-approval exit rule |
| R7 | Structure lock breaks because phases must draw new things (door overlay, guest desks, ON AIR light) | 2,4,5,7 | rule: overlay/banner/HUD layers are not map structure; any true structure need ⇒ STOP and propose (Rule 2) |
| R8 | Secret leakage via logs/messages (user config contains a plaintext key today) | 5,6,7 | redaction filter before store/display, no reading of opencode config values by the house, secret-scan tests, audit log content policy |
| R9 | Tests becoming flaky/machine-dependent (real opencode in tests) | 4,5 | simulated-event harness for unit/integration; exactly one opt-in real E2E per phase against the throwaway repo, marked and isolated |
| R10 | Worktree sprawl in the user's repos (P1 leftover `kuya/*` branches already exist) | 4,5 | naming convention `kuya/<name>-<id>`, keep-forever policy, eviction report lists every worktree/branch left, plus a `kuya worktrees list` view |
| R11 | PixiJS/UI complexity regresses 60 fps with 20 characters + overlays | 2,6,8 | existing 0.083 ms/tick headroom, visibilitychange pause already in place, P8 perf pass re-benchmark |
| R12 | Protocol v2 breaks v1 consumers (adapters/console) | 2 | additive-only: new event types + new optional fields; old fields keep meaning; v1 tests keep passing |
| R13 | User-config drift (Orca rewrites codex hooks etc.) | all | out of scope going forward; opencode-only control needs no hooks/config changes (server API path) — verified in P3 |
| R14 | Missing art (bag, suitcase, folder, lanyard, ON AIR sign, crown, rules poster) blocks P2/P7 | 2,7 | D2 approved authoring; sprite sheet MUST be approved by KUYA before use; STOP and list per Rule 3 if quality is rejected |
| R15 | House accidentally creating subagents or helper sessions (Rule 11 violation) | 2,3,4,5,7 | guard script (`bun run guard`) in the test suite; guests only from observed child-session events; spike proves native subagent vs parentID-create; runtime anomaly assertion + audit + confession banner |

## 6. Config files and data stores (full list)

Existing today (touched only per phase as listed):

| File/Store | Owner phase | Purpose |
| --- | --- | --- |
| `config/kuya-lines.json` (+ public mirror) | exists (P2 extends) | Taglish banner lines, categories + templates |
| `config/pois.json` (+ `public/pois.json` mirror) | exists | house-life POIs `{id,room,x,y,facing,action,minSec,maxSec,capacity,tags}` |
| `config/runners.json` | exists | runner commands per harness + `allowlistedRoots` (wired into security in P4) |
| `config/housemates.json` | P4 | summon presets: `{id,name,harness,agent,model,provider,reasoning,persona,permissions,projectRoots,sprite,maxConcurrentTasks}` |
| `config/guests.json` | P4 | guest OBSERVATION policy (read-only): caps, visibility, time limit; deny handling per Rule 11 + D13 (opencode config or verified abort) |
| `config/house.json` | P4 | general house settings: housemate cap, ports, token policy, budget defaults |
| `config/jobs/*.json` | P5 | job templates (team, brief, rubric, gates, rounds, exit, caps) |
| `config/scoring.json` | P7 | scoring weights, penalties, nomination rules |
| `config/chatter.json` | P8 (optional) | ambient chatter lines per POI |
| `config/house-life.json` | P8 (optional) | walking tempo, dwell, room-change frequency |
| `%USERPROFILE%\.bahay-ni-kuya\token` | exists | Bearer token (0o600) |
| `%USERPROFILE%\.bahay-ni-kuya\audit.jsonl` | P4+ | append-only audit log of every control action |
| `%USERPROFILE%\.bahay-ni-kuya\opencode-state.json` | P4 | supervisor reconcile state (managed servers/sessions) |
| `data/bahay.db` (bun:sqlite) | P5+ | jobs, rounds, turns, findings, messages, artifacts, audit_log, sessions mirror |
| `docs/structure-baseline.json` | exists | structure lock baseline (never edited to pass) |
| `docs/layout-backups/` | exists | timestamped map backups before each layout save |
| `docs/screenshots/<phase>/` | each phase | visual proof |
| `spikes/opencode-control/` | P3 | throwaway sample repo + scripts + FINDINGS.md |
| `.kuya/rejected/` (in job worktree) | P5 | rejected out-of-scope patches |
| `public/map/house.json` | exists | Tiled map (furniture layers editable via editor only) |

## 7. Combined wire protocol table

v1 today (see STATE §8) stays valid. P2 adds events/states additively (v2); P4 and P5 add
fields and endpoints; nothing is removed and no v1 field changes meaning. `kind` values,
states and endpoints marked (P4/P5) arrive with that phase.

### 7.1 Adapter/house → server events (POST /event) — additive table

| `type` | Since | Payload fields | Meaning |
| --- | --- | --- | --- |
| session_start | v1 | + state,title,directory | create session |
| session_end | v1 | — | delete session tree |
| state | v1 | state | working/idle/blocked/error |
| tool | v1 | tool | tool bubble, keep working |
| error | v1 | error,reason | facepalm, errorCount++ |
| task_started | v1 | title | office call |
| task_completed | v1 | — | return to house life |
| blocked | v1 | reason | confession room (v1 routing) |
| subagent_started / subagent_ended | v1 | parentSessionId | guest lifecycle (v1 visuals) |
| **housemate_summoned** | v2 (P2) | housemateKey, name, harness, presetId? | walk-in begins |
| **housemate_arrived** | v2 (P2) | housemateKey | walk-in complete, house life starts |
| **housemate_evict_started** | v2 (P2) | housemateKey, reason | banner + suitcase walk-out begins |
| **housemate_evicted** | v2 (P2) | housemateKey | gone |
| **question_asked** | v2 (P2) | id, harness, session, kind(permission\|question\|choice\|text), text, options? | Confession Room ask; options for choice |
| **question_answered** | v2 (P2) | id, answer? (or option index), text? | resolve ask |
| **kuya_call** | v2 (P2) | housemateKey, reason? | call to Confession Room (chat mode) |
| **kuya_call_ended** | v2 (P2) | housemateKey | walk back |
| **chat_message** | v2 (P2) | role, text | diary-panel chat line |
| **guest_arrived** | v2 (P2) | guestKey, hostKey | guest enters (lanyard) |
| **guest_left** | v2 (P2) | guestKey | guest exits |

New `state` values (v2, additive): `arriving`, `evicting`, `queued_for_confession`,
`in_confession`, `called`. Old consumers ignore unknown states (frontend defaults unknown → idle
visuals; contract note added in P2).

### 7.2 HTTP endpoints (full, current + planned)

| Method | Path | Auth | Since | Request | Response |
| --- | --- | --- | --- | --- | --- |
| GET | /healthz | none | v1 | — | `{ok,port}` |
| GET | /state | none | v1 | — | snapshot |
| GET | /debug | none | v1 | — | snapshot + logs |
| GET | /ws | none | v1 | WS | snapshot stream (+ v2 events stream) |
| POST | /event | none (ingest) | v1 | event | 204/400 |
| POST | /event/hermes | none (ingest) | v1 | webhook | 204 |
| GET | /api/auth/token | Host/Origin | v1 | — | `{token}` |
| GET | /api/roots | Host/Origin | v1 | — | `{roots}` |
| POST | /api/layout/save | Bearer | v1 | `{props}` | `{ok,backup,props}` |
| POST | /api/tasks | Bearer | v1 | `{harness,prompt,cwd,…}` | 201 TaskRecord |
| GET | /api/tasks | Bearer | v1 | — | TaskRecord[] |
| GET | /api/tasks/:id | Bearer | v1 | — | TaskRecord |
| POST | /api/tasks/:id/cancel | Bearer | v1 | — | `{ok,status}` |
| POST | /api/housemates | Bearer | P4 | `{presetId?, name, harness:"opencode", agent, model, provider?, reasoning?, projectRoot, personaNote?, permissions?}` | 201 HousemateRec |
| GET | /api/housemates | Bearer | P4 | — | HousemateRec[] (live status joined) |
| DELETE | /api/housemates/:key | Bearer | P4 | `{keepWorktree:true}` | `{ok}` (evict) |
| POST | /api/housemates/:key/call | Bearer | P4 | `{message}` | 202 |
| POST | /api/housemates/:key/answer | Bearer | P4 | `{questionId, answer? , option?, text?}` | `{ok}` |
| GET | /api/opencode/agents | Bearer | P4 | — | live agent list from opencode |
| GET | /api/opencode/models | Bearer | P4 | — | live provider/model list |
| GET | /api/housemates/:key/usage | Bearer | P4 | — | verified usage (or `{available:false}`) |
| POST | /api/jobs | Bearer | P5 | job template id + params | 201 JobRec |
| POST | /api/jobs/:id/control | Bearer | P5 | `{action: pause\|resume\|stop}` | `{ok}` |
| GET | /api/jobs/:id | Bearer | P5 | — | full job record (rounds, gates, findings) |
| GET | /api/jobs/:id/panel | Bearer | P5 | — | panel payload (roster, timeline, meters) |
| POST | /api/jobs/:id/verdict | Bearer | P5 | `{action: approve\|request-changes\|discard, targetBranch?, note?}` | `{ok}` |
| POST | /api/kuya/findings | Bearer | P5 | finding add (also used by `kuya` CLI) | 201 Finding |
| POST | /api/kuya/messages | Bearer | P6 | `{from,to,type,text,…}` | 201 Message |
| GET | /api/messages | Bearer | P6 | filters | Message[] |
| GET | /api/eavesdrop/export | Bearer | P6 | filters | markdown |

Rate limits (P4+): mutating `/api/*` endpoints get a token-bucket limiter (default 10/min per
endpoint class, configurable in `config/house.json`), 429 with `Retry-After`.

## 8. Database schema overview (bun:sqlite, `data/bahay.db`, introduced P5, extended P6/P7)

```sql
-- P5 core
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,              -- job_<ts>_<n>
  template TEXT NOT NULL,           -- config/jobs/<file>
  repo_path TEXT NOT NULL,          -- allowlisted root check at submit
  worktree TEXT NOT NULL,           -- absolute path of kuya/job-<id>
  branch TEXT NOT NULL,             -- kuya/job-<id>
  brief_md TEXT NOT NULL,
  rubric_md TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','paused','awaiting_kuya','done','discarded','failed')),
  rounds_done INTEGER NOT NULL DEFAULT 0,
  budget_tokens INTEGER, budget_cost REAL, wall_deadline_ms INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
  n INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('building','gating','testing','proofing','verdicts','done','failed'))
);
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY, round_id TEXT NOT NULL REFERENCES rounds(id),
  housemate TEXT NOT NULL, role TEXT NOT NULL, started_at INTEGER, ended_at INTEGER,
  prompt_hash TEXT, exit_kind TEXT NOT NULL,        -- ran|aborted|interrupted|missing-update
  usage_json TEXT,                                   -- verified opencode usage or {"available":false}
  diff_stat TEXT
);
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, round INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('blocker','major','minor','nit')),
  area TEXT, path TEXT, evidence TEXT, repro TEXT,
  owner_role TEXT, raised_by TEXT NOT NULL,          -- role name | 'house'
  status TEXT NOT NULL CHECK (status IN ('open','fixed','disputed','wontfix')),
  signature TEXT, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, kind TEXT NOT NULL,  -- gate-log|patch|diff|screenshot
  path TEXT NOT NULL, created_at INTEGER
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL,
  action TEXT NOT NULL, target TEXT, detail_json TEXT
);
-- P6
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, job_id TEXT, round INTEGER, turn_id TEXT,
  "from" TEXT NOT NULL, "to" TEXT NOT NULL,          -- housemate key | role:<role> | all | kuya
  type TEXT NOT NULL CHECK (type IN ('update','question','answer','finding','handoff','gate','system','kuya')),
  text TEXT NOT NULL CHECK (length(text) <= 400),
  details_json TEXT, reply_to TEXT, ts INTEGER NOT NULL, delivered_in_turn TEXT
);
-- P7
CREATE TABLE IF NOT EXISTS scores (
  housemate TEXT PRIMARY KEY, points REAL NOT NULL, events_json TEXT NOT NULL
);
```

Indexes: `turns(round_id)`, `findings(job_id,status,severity)`, `messages(job_id,ts)`,
`audit_log(ts)`. WAL mode; single writer (server). All timestamps epoch ms.

## 9. Directory layout after the plan (new files only)

```
src/
  opencode-supervisor.ts        (P4) managed server/session lifecycle, reconcile
  opencode-client.ts            (P4) typed HTTP client for opencode server (from P3 findings)
  housemates.ts                 (P4) housemate registry, presets, caps
  questions.ts                  (P4) confession queue state machine
  audit.ts                      (P4) audit log append + read
  ratelimit.ts                  (P4) token-bucket limiter
  procutil.ts                   (P4) Windows process-tree helpers
  jobs/
    engine.ts                   (P5) rules-based loop, no LLM
    gates.ts                    (P5) gate runner + parser
    findings.ts                 (P5) router + dedupe signatures
    enforcement.ts              (P5) diff-scope revert, test-hash lock
    prompts.ts                  (P5) turn prompt assembly
  db.ts                         (P5) bun:sqlite open/migrate
  messages.ts                   (P6) inbox, limits, redaction
  season.ts                     (P7) scoring, nomination, groceries, brownout, recap
public/
  flow.ts                       (P2) arriving/evicting/confession/guest choreography
  confession.ts                 (P2) ON AIR, queue, diary panel controller
  guests.ts                     (P2) guest visuals (lanyard, tether, folder)
  eavesdrop.ts                  (P6) docked feed, filters, replay
  jobpanel.ts                   (P5) job panel UI controller
  season.ts                     (P7) nomination/groceries/brownout UI bits
scripts/
  fake-events.ts                (P2 extended) full fake flow
  fake-squad.ts                 (P5) simulated squad events for tests/demo
  kuya-cli.ts                   (P5) `kuya` command (roster|message|finding|update|ask|handoff|status)
  guard-no-custom-subagents.ts  (P2, wired from P2 onward) `bun run guard` — Rule 11 enforcement
docs/housemates/proofreader-PROPOSED.md  (P5) proposed agent file for review, never installed
spikes/opencode-control/        (P3) sample repo + probe scripts + FINDINGS.md
docs/plan/phase-<n>-<name>.md   each phase
docs/screenshots/<phase>/       each visual phase
docs/opencode-evidence/*.md|txt (P3/P4) captured real outputs
```

## 10. Branch strategy

- Branch per phase off the latest approved branch tip; never push; one commit per milestone
  step (commit message `phase(n): <step>`); the docs commit for this planning pass is the only
  commit on `master-plan`.
- Merge order: each phase branch is reviewed at its STOP gate; the next phase branches from the
  approved tip. No automatic merges into `master` or `main` at any point (matches Global Rule 8).
- The throwaway spike repo and fixture repos live outside the repo (`%TEMP%\bahay-*`) so they
  never pollute branches.

## 11. Testing strategy

- **Unit** (bun test, `test/`): store state machine, protocol validation, question queue,
  supervisor reconcile (simulated), gate parser, findings router, enforcement (diff/revert),
  prompts assembly, messages inbox/limits/redaction, scoring math. All deterministic, no network.
- **Integration**: HTTP endpoints with `fetch` against a spawned server on a test port
  (`BAHAY_NI_KUYA_PORT`), including rejected-request tests (401/403/413/429/400) for every
  control endpoint; job engine end-to-end on a fixture repo with scripted fake housemates.
- **Real E2E (opt-in, isolated)**: exactly one per phase where real opencode runs are needed
  (P4, P5): throwaway git repo in `%TEMP%`, guarded by an env flag, cleaned by PID-tree kill,
  marked `// REAL` in the test name so it can be skipped in CI-like runs.
- **Visual**: per-phase before/after screenshots + `docs/visual-check.md` walkthrough (Rule 6).
- **Guard (Rule 11)**: `bun run guard` (`scripts/guard-no-custom-subagents.ts`) runs inside
  `bun test` from Phase 2 onward: static scan + runtime assertions proving the house never
  creates child sessions, passes a `parentID` on session create, or spawns agent/helper
  processes outside the housemate-summon path (details in P2-T20, P3-T11b, P4-T24).
- **Perf**: existing 20-character benchmark (P8 re-run target 60 fps / <5 ms tick).
- Existing 37 tests must keep passing at every STOP gate; any test made obsolete by a design
  change is updated in the same phase, never deleted silently.

## 12. TRACEABILITY TABLE (spec item → task IDs)

Every spec bullet maps to ≥1 task ID. "Sx-y" = spec §x item y. Full task text lives in the phase
docs. Items already delivered are marked (at audit) — their tasks are verification/reopen tasks
rather than build tasks, per STATE §10–13.

### Phase 0 (audit — delivered now)

| Spec item | Task IDs |
| --- | --- |
| Read all listed dirs + git history | P0-T1 (done, this file) |
| docs/STATE.md with all sections incl. exact wire protocol | P0-T2 (done) |
| master-plan reorganizes spec vs real state, DONE/PARTIAL/TODO | P0-T3 (done: this file §2, §3, §12) |
| STOP | P0-T4 (done) |

### Phase 1 (visual stabilization — mostly delivered at audit; remaining = verify + reopen debts)

| Spec item | Task IDs |
| --- | --- |
| Rewrite validate-furniture to drawn rectangles | P1-T1 (delivered; P1-TV re-verifies) |
| Fail rules: floor-prop overlaps + 3 flagged pair exemptions | P1-T2 |
| Wall-type props in face band, no wall/door/arch crossing | P1-T3 |
| Floor props inside room, base on own floor tile | P1-T4 |
| Tabletop fully on table/desk/counter | P1-T5 |
| Tall props no visual overlap | P1-T6 |
| 1-tile clearance desks/sofas/beds/counters/machines | P1-T7 |
| Chairs centered/facing/row-uniform | P1-T8 |
| Props off-grid fail | P1-T9 |
| Unreachable POIs fail | P1-T10 |
| G overlay draws drawn rectangles | P1-T11 |
| Layout editor (E, select, arrows, drag, R, Delete, undo/redo, live red, save furniture-only, backup, refuse structural, regen collision+nav) | P1-T12..T15 |
| Endpoint rules from Global Rule 7 | P1-T16 (delivered bearer+loopback; residual gaps → P4-T30/31) |
| Smallest-change fixes, POI IDs kept | P1-T17 |
| Known visible problems (lamp/plant, shelf/plant, bin, bedroom plant/stools, kitchen clock×2 + bin/cup, dining chairs, confession spotlight, pool scale, gym alignment) | P1-T18 |
| Visual proof (Rule 6) | P1-T19 |
| Out of scope: structure/doors/camera/server/protocol/behavior/art | P1-T20 |

### Phase 2 (PBB flow visuals, fake events)

| Spec item | Task IDs |
| --- | --- |
| Protocol additions: housemate_summoned/arrived/evict_started/evicted | P2-T1 |
| question_asked {id,harness,session,kind,text,options} | P2-T2 |
| question_answered | P2-T3 |
| kuya_call / kuya_call_ended | P2-T4 |
| chat_message {role,text} | P2-T5 |
| guest_arrived / guest_left | P2-T6 |
| New states arriving/evicting/queued_for_confession/in_confession/called | P2-T7 |
| Entrance: existing door or marked spawn/exit overlay (no structure change) + report proposal | P2-T8 |
| SUMMON: bag, welcome banner, living room, house life | P2-T9 |
| EVICT: banner, emote, suitcase, walk out, disappear | P2-T10 |
| CONFESSION: walk to room, ON AIR light, diary panel; queue outside, one at a time; relieved exit | P2-T11 |
| CALL: stop activity, walk to confession, diary chat mode, walk back | P2-T12 |
| GUESTS: lanyard entry, dotted tether, guest desk near host, folder handoff, walk out | P2-T13 |
| Diary-room panel HTML overlay (header harness/agent/model/folder, question, options, free text, queue, chat, close) | P2-T14 |
| Console: Summon, Evict (confirm), Call (also hover card) | P2-T15 |
| Taglish lines in config/kuya-lines.json | P2-T16 |
| bun run fake plays full flow (summon×2, question, queued question, answer, call, guest in/out, evict) | P2-T17 |
| STOP with recording/screenshots | P2-T18 |
| Standing rules 1–11 acceptance | P2-T19 |
| Rule 11 enforcement: guard script, fake-subagent ban, parentID-create ban | P2-T20 |

### Phase 3 (opencode feasibility spike)

| Spec item | Task IDs |
| --- | --- |
| Throwaway sample repo in temp dir | P3-T1 |
| FINDINGS.md with WORKS/WORKS WITH CAVEAT/NOT POSSIBLE | P3-T2 |
| (1) version + background server on chosen port | P3-T3 |
| (2) one server, several sessions (3, different dirs/worktrees), concurrency count | P3-T4 |
| (3) agent+model per session/prompt; 3 combos proven, real agents from config | P3-T5 |
| (4) prompt → wait → result + diff of changed files | P3-T6 |
| (5) live event stream: session created/busy/idle, tool calls, permission asked, question asked, errors, child sessions | P3-T7 |
| (6) answer permission + question via API; abort running turn | P3-T8 |
| (7) tokens/cost exposure (per message/session; in/out/reasoning/cache) + real sample | P3-T9 |
| (8) agents list (mode, default model), providers/models, reasoning/variants; compare with config | P3-T10 |
| (9) subagent lifecycle: child create (parentID, agent, title), busy/finish/error/abort, completion signal, where child permissions surface | P3-T11 |
| Rule 11 evidence: native child sessions carry parentID+agent+title; native-subagent vs direct parentID-create; what --pure disables; deny/guest-type mechanisms in opencode config | P3-T11b |
| (10) agent/model override semantics | P3-T12 |
| (11) existing login reuse; Windows orphan behavior + exact cleanup command | P3-T13 |
| (12) CPU/memory with 3 active sessions | P3-T14 |
| go/no-go + open questions | P3-T15 |
| Standing rules (esp. no app changes, no credentials) | P3-T16 |

### Phase 4 (real opencode housemates)

| Spec item | Task IDs |
| --- | --- |
| Supervisor src/opencode-supervisor.ts (start/watch, no terminal dep, health, restart, logs, clean shutdown, reconcile, no orphans) | P4-T1..T6 |
| Casting/summon dialog (harness, agent dropdown live+primary-only, model dropdown live+"agent default", reasoning/variant when available, project folder allowlisted, persona note, save preset) | P4-T10..T13 |
| config/housemates.json schema {id,name,harness,agent,model,provider,reasoning,persona,permissions,projectRoots,sprite,maxConcurrentTasks} | P4-T14 |
| Hover cards: agent/model badges, live usage+cost per housemate and per guest rolled up, "n/a" when unavailable | P4-T15 |
| Real SUMMON: worktree kuya/<name>-<id> | P4-T16 |
| Real EVICT: graceful abort → wait → process-tree end; confirm dialog with diff stat; worktree+branch kept and location reported | P4-T17 |
| Real CONFESSION: question_asked mapping, verified reply calls, queue, never auto-answer, dead sessions removed with banner | P4-T18 |
| Real CALL/TALK: send message, "after current turn"/"interrupt now" (confirm), replies stream to chat panel | P4-T19 |
| GUESTS: parentID children via P2 visuals, min visible time, config/guests.json (allow/deny, per-host 3, total cap, depth 2, queue spots, time limit→confession), guest questions in same queue | P4-T20 |
| Rule 11: guests are observed-only child sessions; no house-created subagents; anomalous child session flagged (runtime assertion + audit + confession banner) | P4-T20a |
| Denied guest types via opencode config or verified abort (never house-made subagents); config proposed in docs, applied by Kuya | P4-T20b |
| Housemate cap (config; 6 per D6) + concurrency cap 3 turns (D6) | P4-T21 |
| Audit log every action | P4-T22 |
| Tests: simulated events + ≥1 real E2E on throwaway repo | P4-T23 |
| Rule 11 tests: guests only from observed child-session events; house never passes parentID on create | P4-T24 |
| Housemates only from explicit summon or user-started job template; presets may pre-fill but never auto-summon | P4-T25 |
| Security rule 7 for new endpoints (incl. rate limits, rejected tests, allowlistedRoots wiring fix) | P4-T30..T32 |
| Standing rules 1–11 acceptance | P4-T33 |
| STOP demo (2 housemates different agent/model, permission answered, a native subagent observed as guest, one evicted) | P4-T34 |

### Phase 5 (squad jobs)

| Spec item | Task IDs |
| --- | --- |
| No boss agent; deterministic loop, no LLM | P5-T1 |
| Job template config/jobs/*.json validated at load: team {name,agent,model,role,ownedPaths,mayEditTests,mayRunShell,persona} | P5-T2 |
| brief (markdown goal) + rubric (checklist) | P5-T3 |
| repo path allowlisted | P5-T4 |
| gates (house-run commands: typecheck, lint, tests, build, optional e2e/screenshot, timeouts) | P5-T5 |
| rounds ordered steps (build→gateA→test→proofread→gateB→verdicts) | P5-T6 |
| exit rule (gates pass AND zero blocker/major open AND reviewers approve N consecutive, default 2) | P5-T7 |
| caps (maxRounds 8, wall time, turns/role, token/cost budget, max concurrent, stagnation rule) | P5-T8 |
| First squad frontend/backend/tester-1/tester-2/proofreader mapped to existing agents | P5-T9 |
| proofreader agent proposal (PROPOSED file in docs/housemates/, approval; never overwrite; review-only) | P5-T10 |
| Rule 11 in jobs: roles are primary housemates; messages route cross-housemate talk; fixture budgets (500k/100k per D12) | P5-T9, P5-T22 |
| bun:sqlite tables jobs/rounds/turns/findings/messages/artifacts/audit_log | P5-T11 |
| Finding schema {id,severity,area,path,evidence,repro,ownerRole,status,raisedBy,round} | P5-T12 |
| Findings from gates (parsed, routed by path) + `kuya finding add` | P5-T13 |
| Deterministic router (path ownership, tags); unroutable/disputes → Kuya confession | P5-T14 |
| Turn prompts from brief+rubric+persona+findings+gate results only | P5-T15 |
| Enforcement: post-turn diff, out-of-scope → .kuya/rejected patch + revert + told why; test hash lock; test/skip count never decreases without approval; gates house-only; one commit per turn as role; single integration worktree kuya/job-<id> | P5-T16 |
| `kuya` CLI (roster,message,finding add,update,ask,handoff,status) with per-housemate token | P5-T17 |
| Per-worktree instructions file (never overwrite AGENTS.md) | P5-T18 |
| Job panel UI (roster badges, timeline, gates, findings, meters, Pause/Resume/Stop, transcript tail, Ready-for-Kuya screen with Approve/Request changes/Discard) | P5-T19 |
| Scene: office desks, round banners, folder walk-over, facepalm on failed gate, thumbs-up on approval | P5-T20 |
| Acceptance: fixture repo seeded bug+missing feature+failing tests loops to pass; broken squad stopped by enforcement/caps; server kill/restart reconciles | P5-T21 |
| Standing rules 1–11 acceptance | P5-T22 |
| STOP with recording | P5-T23 |

### Phase 6 (conversation layer)

| Spec item | Task IDs |
| --- | --- |
| messages schema {id,jobId,round,turnId,from,to,type,text≤400,details,replyTo,ts,deliveredInTurn} persisted | P6-T1 |
| Turn contract: `kuya update "<summary>" [--to][--needs][--blocked]`; missing → system message + re-prompt once | P6-T2 |
| Updates mention interfaces/contracts changed, reference artifacts not pasted content | P6-T3 |
| Inbox: role-addressed messages in next turn (unresolved first, then latest N), never interrupt running turn | P6-T4 |
| Stand-up at start/end of every round (living-room meeting animation) | P6-T5 |
| Limits: ≤3 messages/turn, 400 chars, thread depth 4 → escalate to Kuya, per-round chatter budget, no tool-output dumps, secret redaction before store/display + tests with sample secrets | P6-T6 |
| Eavesdrop mode (T hotkey, docked feed): avatar, color, type tag, text, round, time; filters housemate/job/type; search; pause+auto-scroll; thread view per pair; click-through to finding/diff/raw transcript (read-only); Kuya input box (housemate/role/all) with Announce (next turn) and Interrupt (abort+re-prompt, confirm); export markdown; replay with timeline scrubber | P6-T7 |
| Scene: speech bubbles truncated, dotted line to recipient, folder walk-over handoffs, CAM: CHAT pan to talking pair | P6-T8 |
| Tests: inbox order, limits, thread escalation, missing-update, redaction, restart persistence, interrupt semantics; fixture job with backend API contract consumed by frontend next turn | P6-T9 |
| Rule 11: message layer is the only cross-housemate channel; no agent spawns for delivery | P6-T4 |
| Standing rules 1–11 acceptance | P6-T10 |
| STOP | P6-T11 |

### Phase 7 (season 1)

| Spec item | Task IDs |
| --- | --- |
| Scoring config/scoring.json (transparent, hard to game): points gates first-try, accepted+fixed findings, tests added by testers, clean turns; penalties failed gates, out-of-scope edits, wasted/stagnant turns, lost disputes | P7-T1 |
| Per-job and cumulative leaderboard | P7-T2 |
| Nomination night: after job or weekly, show stats, lowest scorers nominated, I choose keep/swap model-agent/evict+replace (new housemate enters) | P7-T3 |
| Housemate of the week crown (reward not boss: queue priority, optional strongest model slot next job) | P7-T4 |
| Groceries: budget as fridge, pause + visible wait on empty, restock raises budget, verified token data, "n/a" when unavailable | P7-T5 |
| Brownout: on retry/rate-limit reports, lights out, wait, resume | P7-T6 |
| Kuya cam: auto-cut to failing gate/dispute/escalation/completion, manual override; daily recap panel deterministic from DB | P7-T7 |
| House rules and strikes: rules poster, Kuya warning on violation, three strikes → nominated | P7-T8 |
| Wildcard housemate: one-job specialist enters, works, leaves (guest-like with mission) | P7-T9 |
| Rule 11: wildcard is a manually summoned primary housemate; never a child session, never auto-summoned | P7-T9 |
| Optional cheap items: secret mission, whisper corner, moods/friendship lines, lights out/wake-up scheduling, finale ceremony | P7-T10 |
| Standing rules 1–11 acceptance | P7-T11 |
| STOP | P7-T12 |

### Phase 8 (polish and backlog — each item needs approval first)

| Spec item | Task IDs |
| --- | --- |
| Garden chill area (benches, fire pit) | P8-T1 |
| Ambient chatter bubbles from config/chatter.json (no LLM) | P8-T2 |
| Walking tempo constants config/house-life.json | P8-T3 |
| Day/night lighting from local clock | P8-T4 |
| Animated details and shadows | P8-T5 |
| Performance pass (60 fps @20 chars, pause hidden) | P8-T6 |
| README with screenshots/GIF | P8-T7 |
| License file, NOTICE, assets manifest review | P8-T8 |
| Final security review (all endpoints, token handling, redaction, audit log) | P8-T9 |
| P1 visual leftovers accepted into backlog (D11): editor-fixable items + re-proposed art/structure items | P8-T10b |
| Standing rules 1–11 acceptance | P8-T10 |
| STOP | P8-T11 |

## 13. NEEDS HUMAN DECISION (consolidated list; details + recommendation per phase doc)

All of D1–D12 were answered by KUYA on 2026-11-16; the chosen options below are binding
constants for the plan. D13 is new and still open.

| # | Decision (as answered) | Where |
| --- | --- | --- |
| D1 **RESOLVED** | Real exterior front door APPROVED, tiny change only: exactly one door opening in the south exterior wall; the agent must show the structure diff is only those tiles before `docs/structure-baseline.json` is regenerated; arrival through a bare wall is not accepted. If the diff shows anything else, STOP and re-propose. | P2 §Entrance |
| D2 **RESOLVED** | Author the 5 sprites (bag, suitcase, folder, lanyard, ON AIR) + crown + rules poster, original and in the existing Oddboro style. The sprite sheet must be shown to KUYA and APPROVED before any of it is used in the scene (art quality is the known pain point). | P2 §Art, P7 §Art |
| D3 **RESOLVED** | Confession queue inside the room along the east wall — keeps the hallway clear. | P2 §Confession |
| D4 **RESOLVED** | Spike spend approved: harmless prompts, ≤6 turns, 3 sessions — using the CHEAPEST connected model for the bulk probes. | P3 §Safety |
| D5 **RESOLVED (with condition)** | `--pure` accepted for the spike; the spike must report what the flag disables and whether the user's agents rely on anything it turns off, before P4 pins it for managed servers. | P3/P4 |
| D6 **RESOLVED** | Housemate cap = **6** (the example squad is 5); guests capped separately (unchanged); **no more than 3 turns running at once** (concurrency cap). | P4 §Caps, P5 §Caps |
| D7 **RESOLVED (with condition)** | Squad mapping approved with the user's own agent files as the roles. The proofreader is drafted by the agent as a **PROPOSED file with no edit/write permissions**, written to `docs/housemates/proofreader-PROPOSED.md` for review — never installed. Tester-2 must use a model from a **different provider** than tester-1. | P5 §Squad |
| D8 **RESOLVED** | Default gates approved: `bunx tsc --noEmit`, `bun run structure-lock`, `bun run validate-furniture`, `bun test`. | P5 §Gates |
| D9 **RESOLVED** | Approve merge target is `kuya/ready`; **never `main`/`master`.** | P5 §Panel |
| D10 **RESOLVED** | Nominations happen **per job**. | P7 §Nomination |
| D11 **RESOLVED** | The five P1 visual leftovers are accepted for now and moved into the P8 polish backlog; some (dining chairs, bin/cup) are fixable with the E layout editor. | P8 backlog |
| D12 **RESOLVED (with condition)** | Default per-job budget 1.5M in / 300k out, BUT the first fixture job runs lower: **500k in / 100k out** so the first run cannot surprise. | P5 §Caps |
| D13 **OPEN** | Denied guest types: once the spike (P3-T11b) shows what opencode natively supports (permission/task config vs none), KUYA chooses between (a) an opencode config change proposed in docs and applied by KUYA himself, or (b) house-side abort of the child session via the verified abort call (banner + Confession Room notice). Rule 11 forbids a house-made replacement subagent in both cases. | P4 §Guests |

## 14. "Later" note — other harnesses

codex, pi, omp, hermes adapters keep working in display-only mode (they already POST v1 events).
No phase plans: control (session create/abort), answering permissions/questions, usage rollups or
squad membership for them. When opencode proves the control model, the `harness` field and the
`adapters/` pattern are the extension points; a "later" doc should be written before any
codex/pi/omp/hermes control work. Nothing in this plan should block them structurally: schemas
are keyed by harness, endpoints accept `harness` but validate `"opencode"` only for control
routes until explicitly widened. Rule 11 applies identically to any future harness: subagents
are always the harness's own mechanism, observed as child sessions — never created or faked by
the house.

## 15. Where phases conflict or overlap — resolutions

- **Confession room ownership (P2 vs P4)**: P2 builds the visuals/queue/panel against fake
  events and defines the `question_asked/answered` payload as the single contract; P4 implements
  real asks through those payloads and must not introduce a second confession mechanism. The
  queue state machine (`queued_for_confession → in_confession → released`) is specified once, in
  P2, and consumed by P4.
- **Dispatcher vs supervisor (P1/P2-era dispatcher vs P4)**: the v1 dispatcher stays as-is
  through P4 (console single tasks keep working) but P4 makes worktree/branch **kept** for
  housemate sessions and adds the process-tree killer. In P5, squad jobs bypass the v1
  dispatcher entirely (house engine owns rounds); the v1 dispatcher remains for ad-hoc console
  tasks. Rule 8 (never auto-delete) supersedes the current auto-delete; the change lands in P4
  with the housemate path first, and the v1 path is aligned in the same phase (one behavior
  everywhere).
- **Fake events (P2) vs real events (P4)**: same payload shapes; the fake script is kept as a
  demo/test tool and marked as such; it never runs automatically.
- **Audit log (P4) vs DB audit_log table (P5)**: `%USERPROFILE%\.bahay-ni-kuya\audit.jsonl` is
  the always-on file log (P4, survives DB loss); `audit_log` DB table (P5) mirrors actions tied
  to jobs. Both are append-only; the file is the source of truth for non-job actions.
- **Budget/groceries (P5 caps vs P7 fridge)**: P5 enforces budgets mechanically; P7 only
  visualizes them (fridge) and handles restock interaction — no second accounting.
- **Subagent ownership (any phase vs Rule 11)**: the old wording that read as house-side
  spawning of guests is superseded everywhere: guests are observed-only child sessions created
  by opencode housemates themselves (task tool + subagent-mode agents in the user's config);
  the house never creates child sessions, never passes a parentID on create, never spawns
  helper processes/LLM calls; type denial is opencode config or a verified abort (D13).
