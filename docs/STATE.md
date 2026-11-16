# STATE.md — audit of Bahay ni Kuya as it stands on 2026-11-16

Written by the planning pass on branch `master-plan` (created from `master` @ `39df6e2`). This is
Phase 0 of the master plan: a read-only audit, no feature work. Every claim below was verified by
reading the named file or running the named command on this machine. Anything I could not verify is
marked UNVERIFIED with how to verify it.

Where claims concern opencode's own behavior, they are marked **VERIFIED** (with evidence) or
**UNVERIFIED**. Rules for that are in docs/master-plan.md §Standing rules.

---

## 1. Scope of this audit (what was read)

- Docs: `README.md`, `PRODUCT.md`, `DESIGN.md`, `CONTRACT.md`, `plan/bahay-ni-kuya-plan.md` (382 l),
  `plan/ASSUMPTIONS.md` (174 l), `docs/adapters.md`, `docs/events-verified.md`,
  `docs/dispatch-security.md`, `docs/furniture-audit.md`, `docs/visual-analysis.md`,
  `docs/visual-check.md`, `docs/oddboro-license-audit.md`, `docs/runners-verified.md`,
  `docs/screenshots/README.md`, `docs/structure-baseline.json`, `assets/MANIFEST.md`, `NOTICE`.
- Server: `src/server.ts` (452 l), `src/store.ts` (323 l), `src/types.ts` (65 l), `src/security.ts`
  (100 l), `src/dispatcher.ts` (341 l), `src/layout.ts` (181 l), `src/structure.ts` (75 l),
  `src/scan.ts` (199 l), `src/opencode-db.ts` (178 l), `src/mcp.ts` (290 l), `src/log.ts` (22 l).
- Frontend: `public/main.ts` (1111 l), `public/renderer.ts` (882 l), `public/map.ts` (111 l),
  `public/nav.ts` (147 l), `public/life.ts` (232 l), `public/anim.ts` (208 l), `public/sprites.ts`
  (289 l), `public/console.ts` (239 l), `public/kuya.ts` (142 l), `public/layout-editor.ts`
  (335 l), `public/furniture-validate.ts` (240 l), `public/index.html` (116 l), `public/style.css`
  (598 l), `public/map/house.json` (103 props, 40 POIs), `public/pois.json`, `public/kuya-lines.json`.
- Adapters: `adapters/opencode/bahay-opencode.js`, `adapters/codex/bahay-codex.ps1|cmd`,
  `adapters/omp/bahay-omp.ts`, `adapters/pi/bahay-pi.ts`, `adapters/hermes/hooks-fragment.yaml`,
  `.opencode/plugins/bahay-opencode.js`, `scripts/install-adapters.ts` (626 l).
- Scripts: `scripts/validate-furniture.ts` (379 l), `scripts/structure-lock.ts`,
  `scripts/generate-map.ts` (736 l), `scripts/fake-events.ts` (163 l), `scripts/compile-sprites.ts`,
  `scripts/render-scene.ts`.
- Config: `package.json`, `config/runners.json`, `config/kuya-lines.json`, `config/pois.json`,
  `tsconfig.json`, `.gitignore`.
- Tests: all 10 files in `test/`.
- User machine config read: `~/.config/opencode/opencode.json`, `~/.config/opencode/agents/*.md`
  (frontmatter lines only), `~/.local/share/opencode/` directory listing.

## 2. Commands run for this audit (read-only)

| Command | Result |
| --- | --- |
| `git branch`, `git log --oneline -30`, `git branch -vv` | see §9 |
| `bun --version` | `1.3.14` |
| `opencode --version` | `1.18.35` |
| `git --version` | `2.54.0.windows.1` |
| `bun run structure-lock` | `structure-lock OK (990d961c8f3ea7f0)`, exit 0 |
| `bun run validate-furniture` | `validate-furniture OK (drawn bounds)`, exit 0 |
| `bun test` | `37 pass / 0 fail` across 10 files, 1098 expect() calls |

Side effect noted: `bun test` runs `test/milestone7.test.ts`, whose dispatcher test creates a git
worktree + branch (`kuya/opencode-task_<id>`) and then `cleanupWorktree()` force-removes both.
That run left branch `kuya/opencode-task_1794772219931_1`, a prunable git worktree registration
(`git worktree list` shows "prunable: gitdir file points to non-existent location") and an empty
ignored folder `.kuya-worktrees/task_1794772219931_1/`. Not cleaned up here (read-only audit).
It is recorded as **finding F-SEC-05** below.

## 3. Scene, art and rendering

- PixiJS 8 app (vendored `public/vendor/pixi.min.js`, npm `pixi.js ^8.23.0` only as a type dep).
  Canvas `#scene` 960×580 logical (`public/sprites.ts` `SCENE_W/H`), CSS scales it.
- The house is a Tiled JSON map: `public/map/house.json`, 42×27 tiles at 16 px, layers
  `floor, walls, doors, furniture, collision, pois (objectgroup), props (objectgroup)`,
  `rooms` block with rects + tints + `cam` labels. Loaded by `public/map.ts` (`loadHouseMap`,
  module-level `loadedMap` cache; POI objects parsed into `{id,name,room,x,y,facing,action,tags}`).
- `public/renderer.ts` (`MapRenderer`): floor/wall/prop containers, Y-sorted via `footY`,
  CCTV HUD (channel label, REC dot, timestamp), room tints, emissive light pools, `camera`
  pan/zoom presets keyed by room, `screenToWorld`, `propAt`, `setSelection`, `refreshProps`,
  `toggleDebugOverlay` / `refreshDebugOverlay` (the "G overlay": red nav solid tiles, yellow
  drawn prop rects, cyan doors, green POI dots + id labels, red violation tiles + rule/prop
  labels, cyan selected-prop rect).
- Atlas: `public/atlas/atlas.png` + `atlas.json` + `meta.json`, 172 sprites (2,142 frames
  per `assets/MANIFEST.md`). Meta per sprite: `width,height,layer,origin,footprint,walkable,
  zbias,fps,tags,emissive,spots,lights,variants,frames`. Atlas frame keys look like
  `arcade-cabinet/default`, `arcade-cabinet/default~e` (energy variant), `staff@opencode/walk-down-0`.
- Characters: chibi `staff@<variant>` rigs keyed by harness or instance variant
  (`public/anim.ts` `INSTANCE_VARIANTS`), actions `idle,walk,sit,type,sleep,pool,arcade,
  exercise,read,cook,wash,tv` mapped onto atlas frame families (`sit-up/down`, `play-up`,
  `exercise-run`, `read-down`, `eat-down`), facings up/down/side(+flip), emotes
  `thumbs_up,facepalm,question,exclamation,sweat,heart` via `emotes/*` frames.
- Licensing state: Oddboro-derived sprites (Apache-2.0) + original house `.px` sprites (CC0 per
  `assets/MANIFEST.md`), `NOTICE` at root, audit doc `docs/oddboro-license-audit.md` (audio and
  Oddboro trademarks excluded). `assets/third-party/oddboro/` exists (verified empty of extra
  files in listing; license text files are referenced by NOTICE — see OQ-A03).
- No PBB logos/audio/footage in the repo (asset inventory `assets/house/*.px` + atlas; TTS uses
  Web Speech API only).

## 4. Map, nav, house life

- Rooms and geometry (from `docs/structure-baseline.json` + `generate-map.ts`):
  bedroom (1,1,11×10), living (13,1,11×10), office (25,1,16×10), hallway (1,12,40×3),
  confession (1,16,8×10), kitchen (10,16,13×10), gameroom (24,16,11×10), gym (35,16,6×10).
  Full perimeter walls at x=0/41, y=0/26; dividers y=11 and y=15 with door tiles.
- Interior doors (layer `doors`, tile id 21, all walkable, each with POI `door_<name>` in
  hallway): bedroom (6,11), living (18,11), office (32,11), confession (5,15), kitchen (16,15),
  gameroom (28,15), gym (37,15). No exterior door: the whole perimeter ring
  (`row0 x:0..41`, `row16 x:0,9,23,34,41`, x=0/41 full columns, y=26 full row) is solid wall.
- Props: 103 objects in the `props` objectgroup plus a mirrored top-level `props` array;
  40 POIs (`config/pois.json` mirror, same `{id,room,x,y,facing,action,minSec,maxSec,capacity,
  tags}` schema). Collision regenerated from prop footprints at save time (`src/layout.ts`).
- Nav: `public/nav.ts` `NavGrid.findPath` — 4-directional A* over the collision layer; goal
  snap-to-walkable-neighbor; door tiles walkable. Verified by `test/milestone3.test.ts`
  (bedroom→office path through doors (6,11) and (32,11), no wall clipping).
- House life: `public/life.ts` `HouseLifeManager` — POI capacity/reservation (`reservePOI`,
  `releasePOI`, `getOccupants`), anti-repeat (`pickIdlePOI` excludes current+previous), weighted
  room rotation (weight `max(1, 10 - visits*2)` over living/kitchen/gameroom/gym),
  `pickBedPOI` (sleeping), `pickDeskPOI` (working; primary vs `subagent` tag desks),
  `removeHousemate`. Durations `minSec..maxSec` from POI config. Wired in `public/main.ts`
  `reconcile()`.
- Blocked housemates are routed to `confession_chair` POI; working housemates to office desks
  (hermes working → `living_bookshelf` special case); idle housemates roam; not-running harnesses
  sleep in bedroom with Zzz. Kuya banners fire on transitions (task_call, blocked_confession,
  error_facepalm, nominated, task_completed, wake_up) from `config/kuya-lines.json`.
- Movement: `public/main.ts` `step()` walks `Char.path` at `WALK_SPEED = 50 px/s` with `ARRIVE = 2`
  px, repaths via `calculateAStarPath` when room/target changes.

## 5. Task flow, hover, dispatcher, MCP

- Wire protocol today is exactly what `CONTRACT.md` documents (§8 below reproduces it). The
  event semantics live in `src/store.ts` `ingest()` (validated types; `workingUntil` windows;
  error count ⇒ `nominated` at ≥3; `deleteTree` on session_end/subagent_ended; adapter events
  purge that harness's `scan:` pseudo-sessions).
- Hover/click cards: `public/main.ts` `updateCard` + `public/index.html` `#char-card` — harness,
  state badge, project folder basename, tool, subagent count, PID; click pins, Esc/× dismisses.
  (`docs/` decision log calls this "M1".)
- Kuya layer: `public/kuya.ts` `KuyaLayer` — FIFO announcement queue (4.5 s hold),
  `{harness}` template substitution, day counter from a start date, optional TTS toggle
  (`#btn-tts`), lines loaded from `/kuya-lines.json` (served from `public/`, mirrored in
  `config/kuya-lines.json`).
- Dispatcher `src/dispatcher.ts`:
  - `submitTask(harness, prompt, cwd, callerHarness?, depth, parentTaskId)` — guards
    self-delegation and `depth >= 2`; emits `task_started` immediately (state "working"); runs
    via `queueMicrotask`.
  - `setupWorktree` — if cwd is a git repo: `git worktree add -b kuya/<harness>-<id>
    .kuya-worktrees/<id> HEAD`; on any failure falls back to running **directly in the user's cwd**
    (no warning surfaced in the record).
  - Runner selection from `config/runners.json` (`command` + `args` with `{prompt}` placeholder,
    `env`); spawned with `shell: process.platform === "win32"` and env
    `KUYA_CALLER_HARNESS / KUYA_DELEGATION_DEPTH / KUYA_PARENT_TASK_ID`.
  - stdout/stderr kept in a 100-line `tail`; on close, `cleanupWorktree` runs
    `git diff --stat`, then **`git worktree remove --force` and `git branch -D`** — the current
    dispatcher deletes the worktree and branch automatically (violates master-plan Global Rule 8).
  - `cancelTask` uses `child.kill()` — on Windows this kills only the direct child; the harness's
    own children can be orphaned (violates Global Rule 9's "kill process trees").
  - Tasks are **in-memory only** (`Map`); server restart loses everything (no persistence/reconcile).
- MCP `src/mcp.ts`: stdio MCP server (`@modelcontextprotocol/sdk` + `zod`), tools
  `kuya_list_housemates`, `kuya_assign_task`, `kuya_task_status`, `kuya_cancel_task`.
  Loop/depth guards duplicated at tool level. Note: `kuya_list_housemates` parses `/state` as
  `{installed, sessions}` objects while the real `/state` is
  `{type,ts,harnesses:[{name,installed,running,procs}],sessions:[…]}` — the tool renders
  wrong/empty output today (finding F-MCP-01). MCP config install/strip helpers for codex
  (TOML), opencode (JSON), hermes (YAML) live in `scripts/install-adapters.ts` and are tested
  idempotent in `test/milestone8.test.ts`.
- Console UI: `public/console.ts` — prompt textarea, harness select (installed only), project
  folder select (`/api/roots` + seen directories), dispatch button, task list with cancel,
  2.5 s polling.

## 6. Adapters (today's ingestion paths)

- opencode: **no live event feed**. `src/opencode-db.ts` polls `~/.local/share/opencode/opencode.db`
  read-only every 3 s (activity window 6 s, episode grace 15 s, MAX_SESSIONS 24, tool lookback
  120 s) and synthesizes `session_start` + `state` + `tool` events for opencode sessions with
  `parent_id` links. It cannot see permission prompts or questions (DB has no such table read
  today). The TUI plugin route was probed and rejected on 1.18.35: plugin setup context exposes
  no event bus (`plan/bahay-ni-kuya-plan.md` build notes). A plugin file still exists at
  `adapters/opencode/bahay-opencode.js` (listens for `ctx.data.listen`) and the installer writes
  it to `~/.config/opencode/plugins/bahay-opencode.js` and repo-local
  `.opencode/plugins/bahay-opencode.js` — dead code per the probe, but the two copies **differ**
  (`diff -q` shows they are not identical; finding F-ADP-02).
- codex: hooks (10 keys) merged into `~/.codex/hooks.json` by the installer; PowerShell
  `bahay-codex.ps1/.cmd` reads hook JSON on stdin and POSTs to `/event` with transcript-derived
  session ids; server auto-remerges if Orca rewrites the file (`checkCodexHooks` in
  `src/server.ts`).
- omp / pi: fail-silent extension `export default function(pi){ pi.on(...) }` installed to
  `~/.omp/agent/extensions/` / `~/.pi/agent/extensions/`; maps `before_agent_start`,
  `tool_execution_start`, `agent_end`, subagent bus `task:subagent:lifecycle`, etc.
- hermes: `hooks.outbound` webhooks POST directly to `POST /event/hermes`; server
  `mapHermesPayload` maps them (child ids from `extra.child_session_id`, etc.).
- Harnesses out of scope for the master plan (kept as `harness` field only): codex, pi, omp,
  hermes (Phase 0 note per vision).

## 7. Validators, tests, structure lock

- `bun run structure-lock` (`scripts/structure-lock.ts` + pure helpers `src/structure.ts`):
  hashes `{width,height,tilewidth,tileheight,orientation,rooms,floor,walls,doors}` from
  `scripts/generate-map.ts` against `docs/structure-baseline.json` (`990d961c8f3ea7f0`);
  `--init` writes the baseline; mismatch exits 1. PASS today.
- `bun run validate-furniture` (`scripts/validate-furniture.ts`, mirrored in browser by
  `public/furniture-validate.ts`): drawn-rect rules — grid snap, unknown sprite, wall props
  (`WALL_PROPS`) on the room's face band and off doors, floor props inside room bounds and off
  wall/door tiles, drawn-rect overlaps (allowing rug-under, tabletop-on-carrier, chair-on-desk
  pair rules), tabletop must sit fully on a `CARRIER`, chairs centered on desk seat tile with a
  uniform row offset and matching POI facing, 1-tile front clearance for `CLEARANCE` sprites,
  POI standing/approach reachability. Exit 1 prints `[rule] prop (room) @ (tile): detail`. PASS
  today (0 violations).
- `test/` — 10 files, 37 tests, all passing:
  `furniture.test.ts` (validator + baseline shape), `milestone1` (scan dedupe),
  `milestone2` (map format, rooms, 12 office desks, confession seat), `milestone3` (nav,
  emotes/species), `milestone4` (POI schema, sleep/wake, 5-min house-life distribution),
  `milestone5` (task-flow events incl. blocked/error/nominated/subagents),
  `milestone6` (kuya lines, day counter, queue, camera configs),
  `milestone7` (token, Host/Origin, cwd allowlist, dispatcher lifecycle — spawns real opencode),
  `milestone8` (MCP tools + config merge/strip), `milestone9` (manifest/license/README,
  20-character perf benchmark: 0.083 ms/tick).
- Layout editor (dev, key E): `public/layout-editor.ts` — select by click (`propAt`), arrow
  nudge, drag with grid snap, `R` cycles variant else flips, Delete, undo/redo (60-deep),
  live violations HUD, Ctrl+S saves via `POST /api/layout/save`; server-side
  `src/layout.ts saveLayout` validates props, rebuilds collision, refuses a save whose structure
  hash ≠ baseline, backs up to `docs/layout-backups/house-<ts>.json`, atomic rename.

## 8. Exact current wire protocol (VERIFIED from code)

### 8.1 Adapter → server: `POST /event` (no auth by design; loopback bind only)

Body ≤ 64 KiB (`maxRequestBodySize`), JSON:

```jsonc
{
  "harness": "opencode",        // opencode | codex | pi | omp | hermes  (validated)
  "sessionId": "ses_abc",       // required, clipped 160
  "parentSessionId": null,      // child session id → subagent; null/omitted for root
  "type": "session_start",      // session_start | session_end | state | tool | error |
                                // task_started | task_completed | blocked | subagent_started | subagent_ended
  "state": "working",           // working | idle | blocked | error (honoured on session_start/state/task_*)
  "title": "fix lint errors",   // optional, clipped 80
  "tool": "edit",               // optional, clipped 60 (type=tool keeps working 4 s)
  "directory": "D:/repo",       // optional, clipped 200
  "reason": "permission",       // optional (blocked/error)
  "error": "Exit code 1",       // optional (error)
  "ts": 1731739200000           // optional; server clock is authoritative
}
```

Responses: `204` on success; `400` `{ok:false,error}` for bad JSON / bad shape / bad type /
unknown harness. Any accepted event marks the harness `running` and deletes that harness's
`scan:` pseudo-sessions.

### 8.2 `POST /event/hermes` — hermes webhook shape (no auth), always `204`

```jsonc
{ "hook_event_name": "pre_tool_call", "profile": "default", "tool_name": "bash",
  "tool_input": {"command": "bun test"}, "session_id": "hermes_ses_88a9c",
  "cwd": "D:/repo", "extra": {"parent_session_id": null, "child_session_id": null,
  "child_role": null, "child_goal": null, "child_status": null},
  "delivery_id": "del_18b209", "timestamp": 1794768938000 }
```

Server mapping (`mapHermesPayload`): `on_session_start`→session_start idle; `on_session_end`→end;
`pre_llm_call|agent_start`→working; `post_llm_call|agent_end`→idle; `pre/post_tool_call`→tool;
`subagent_start`→ parent working + child `session_start` working (title from
`extra.description|task`); `subagent_stop`→ child `session_end`; everything else ignored.

### 8.3 Server state machine (per `(harness, sessionId)`, `src/store.ts`)

| Event in | Effect |
| --- | --- |
| `session_start` | create/refresh; state = `event.state` ?? (parentId ? working : idle); `workingUntil = now+IDLE_MS` if working |
| `task_started` | state=working, window `IDLE_MS = 4_000` |
| `tool` | sets `tool`, state=working, window 4 s |
| `state` | sets state; working window 4 s, otherwise window cleared |
| `blocked` | state=blocked, window 60 s (then decays to idle) |
| `error` | state=error, window 4 s, `errorCount++`, `nominated` at ≥3 |
| `task_completed` | state=idle, clears tool |
| `session_end` / `subagent_ended` | `deleteTree` (session + all descendants) |
| sweep (500 ms tick) | hard TTL 24 h; adapter sessions stale after 90 s when harness not running |
| process scan every 5 s | `scan:<pid>` pseudo-sessions per top-level harness process; CPU delta >400 ms ⇒ working; dropped when adapter sessions exist or process gone |

Derived room routing (frontend): blocked→confession, working→office (hermes→living bookshelf),
idle→house life, no sessions + not running→bedroom sleeper, running + no sessions→"ambient"
living-room character.

### 8.4 Server → browser: `GET /ws` (snapshot on connect, on change coalesced 60 ms, heartbeat 10 s), `GET /state` (same shape)

```jsonc
{ "type": "snapshot", "ts": 1731739200000,
  "harnesses": [ { "name": "opencode", "installed": true, "running": false, "procs": 0 } ],
  "sessions": [ { "harness": "opencode", "sessionId": "ses_abc", "parentId": null,
    "state": "working", "title": "…", "tool": "edit", "directory": "D:/repo", "pid": 1234,
    "since": 1731739100000, "lastEventTs": 1731739199000, "source": "adapter",
    "errorCount": 0, "nominated": false } ] }
```

### 8.5 HTTP API (Bearer token; token file `%USERPROFILE%\.bahay-ni-kuya\token`, 0o600, generated on first run)

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/healthz` | none | — | `{"ok":true,"port":4777}` |
| GET | `/state` | none | — | snapshot JSON |
| GET | `/debug` | none | — | snapshot + last 80 log lines |
| GET | `/ws` | none | WS upgrade | snapshot stream |
| POST | `/event` | none | event JSON | 204 / 400 |
| POST | `/event/hermes` | none | webhook JSON | always 204 |
| GET | `/api/auth/token` | Host/Origin check only | — | `{"token":"<64 hex>"}` (same-origin bootstrap) |
| GET | `/api/roots` | Host/Origin check only | — | `{"roots":[...]}` |
| POST | `/api/layout/save` | Bearer + Host/Origin | `{"props":[LayoutProp…]}` ≤1 MB | `{ok:true,backup,props}` / 400/401/413 |
| POST | `/api/tasks` | Bearer + Host/Origin | `{harness,prompt,cwd,callerHarness?,depth?,parentTaskId?}` | 201 TaskRecord / 400 |
| GET | `/api/tasks` | Bearer + Host/Origin | — | TaskRecord[] |
| GET | `/api/tasks/:id` | Bearer + Host/Origin | — | TaskRecord / 404 |
| POST | `/api/tasks/:id/cancel` | Bearer + Host/Origin | — | `{ok,status}` |
| GET | `/` + static | none | — | files from `public/`; `/X.js` transpiles `public/X.ts` on demand |

`LayoutProp = {id,sprite,x,y,variant?,frame?,layer?,flip?}` (server re-validates each entry,
rejects >400 props / unknown sprites / duplicate ids / out-of-bounds / bad layer).

`TaskRecord = {id,harness,prompt,cwd,worktreeDir?,branch?,status:
queued|running|done|failed|canceled, exitCode,tail[],diffStat?,createdAt,startedAt?,
completedAt?,callerHarness?,depth?,parentTaskId?}`.

### 8.6 MCP (stdio)

Tools: `kuya_list_housemates` (reads `/state` + `/api/tasks`), `kuya_assign_task(harness, task,
cwd?, caller_harness?)`, `kuya_task_status(id)`, `kuya_cancel_task(id)`. Delegation guards:
self-harness rejection and `depth >= 2` rejection, enforced at tool level and again inside
`submitTask`; child processes get `KUYA_CALLER_HARNESS`, `KUYA_DELEGATION_DEPTH(+1)`,
`KUYA_PARENT_TASK_ID`.

### 8.7 Security posture today (verified from `src/security.ts` / `src/server.ts`)

- Loopback bind enforced (`BAHAY_NI_KUYA_HOST` default `127.0.0.1`); token = 32 random bytes hex
  at `%USERPROFILE%\.bahay-ni-kuya\token` (0o600); token never read from query strings.
- Host/Origin check: `host` must match `/^(localhost|127\.0\.0\.1)(:\d+)?$/i`; `Origin`, when
  present, must be loopback. Applied to all `/api/*` routes. `/api/auth/token` and `/api/roots`
  are **not** Bearer-gated (bootstrap by design).
- cwd allowlist (`validateCwd`): rejects missing dirs and paths outside
  `[cwd, parent(cwd), ~/code, ~]` (case-insensitive prefix on realpath). **`config/runners.json
  allowlistedRoots` (`D:/code_ni_kurt`, `D:/code_ni_kurt/pixel-office`) is never read by
  `getAllowlistedRoots()`** — the config field is dead (finding F-SEC-03). Also note `homedir()`
  is itself allowlisted, which makes the "allowlisted roots" check nearly vacuous on this
  machine (any path under the user profile passes).
- No rate limiting on any endpoint today; no audit log of control actions; no request-body
  schema validation beyond the checks named above.

## 9. Git history and branches

- Branches: `master` (= origin/master @ `0f389ed` — origin is **22 commits behind**; never
  pushed), `furniture-fix` @ `dd791df`, `furniture-fix-2` @ `39df6e2` (same tip as `master`),
  `kuya/opencode-task_1794772219931_1` @ `a189360` (left over from the last `bun test` run),
  `master-plan` @ `39df6e2` (this planning branch).
- Recent commits (newest first):
  `39df6e2 docs(screenshots): before/after proof and visual check`,
  `de2c5b7 fix(furniture): resolve drawn-bounds failures in the map`,
  `b48bfa7 feat(editor): shared structure helpers`,
  `6dbf92d feat(editor): save endpoint and shared structure helpers`,
  `c6535f2 feat(editor): guarded save plumbing and editor wiring`,
  `39b0272 feat(editor): dev layout editor with guarded save`,
  `fd5d129 fix(validator): drawn-bounds validation replaces footprint checks`,
  `dd791df fix(furniture): structure-lock, validator, G overlay, and 20 prop fixes`,
  `8f13708 fix(layout): declutter house plan, eliminate tree clippings, fix furniture overlaps and lighting`,
  `da777d7 feat(art): execute Oddboro visual benchmark art pass, pixijs migration, and dense house map`,
  then m9→m0 feature commits back to `40f389e feat: Agent House — local harness visualizer`.
- One git worktree registration is prunable (`.kuya-worktrees/task_1794772219931_1`, branch
  `kuya/opencode-task_1794772219931_1`) — leftover from the last test run, see §2.

## 10. What is broken or incomplete (findings)

Priority findings the master plan must resolve (IDs referenced by phase tasks):

| ID | Finding | Evidence |
| --- | --- | --- |
| F-ADP-01 | opencode has no live event stream: DB polling (3 s) misses permission/question moments entirely; no way to answer anything | `src/opencode-db.ts`; `docs/adapters.md` "does NOT capture permission request states" |
| F-ADP-02 | Dead opencode plugin file still shipped and installed, and repo copy ≠ installed copy | `adapters/opencode/bahay-opencode.js` vs `.opencode/plugins/bahay-opencode.js` (diff differs); installer lines 405–406 |
| F-SEC-01 | Dispatcher auto-deletes worktree and branch after every task (`cleanupWorktree` → `git worktree remove --force` + `git branch -D`) | `src/dispatcher.ts` cleanup path |
| F-SEC-02 | `cancelTask` kills only the direct child (`proc.kill()`), orphaning harness child processes on Windows; no process-tree kill | `src/dispatcher.ts` cancel |
| F-SEC-03 | `config/runners.json allowlistedRoots` is ignored by `getAllowlistedRoots()`; effective roots include `$HOME` | `src/security.ts` vs `config/runners.json` |
| F-SEC-04 | No rate limits, no audit log, no 403-test coverage on `/api/layout/save` (only 401 tested indirectly); `/api/auth/token` returns the token to any same-origin page | `src/server.ts`; `test/milestone7.test.ts` |
| F-SEC-05 | Test run leaves branch + prunable worktree behind (auto-delete failed mid-run); repo hygiene depends on ignored paths | `git worktree list` output in §2 |
| F-SEC-06 | Worktree fallback runs the harness **directly in the user's repo** when `git worktree add` fails, with no warning recorded in the TaskRecord | `src/dispatcher.ts setupWorktree` catch |
| F-DISP-01 | Tasks are memory-only; no persistence, no reconcile after restart | `src/dispatcher.ts` (Map only) |
| F-DISP-02 | Worktree branch is created from `HEAD` of the *task's* cwd, not from a chosen base; no dirty-tree check before dispatch | `setupWorktree` |
| F-DISP-03 | Runner invocation uses `shell:true` on Windows with prompt interpolated into args — prompt text containing quotes can break/inject into the shell line | `runTask` spawn options |
| F-MCP-01 | `kuya_list_housemates` misparses `/state` (`installed`/`sessions` as objects) → wrong output | `src/mcp.ts` |
| F-VIS-01 | Validator passes while visual defects remain that only a screenshot shows (validator covers drawn rects, not art-level issues like the confession spotlight cone) | `docs/visual-check.md` NEEDS HUMAN DECISION items 1–5 |
| F-VIS-02 | No exterior door/opening: entrance/exit flow (Phase 2) has no structural door to use; marked spawn/exit overlay will be needed unless a door is approved | wall scans in §4; `docs/structure-baseline.json` |
| F-DATA-01 | No persistence layer exists at all (bun:sqlite planned in Phase 5; today everything is in-memory) | repo has no DB code except read-only opencode watcher |
| F-HOUSE-01 | House life has no walk-in/walk-out choreography (characters spawn at door (6,11) or at parent, no bag/suitcase props, no arriving/evicting states) | `public/main.ts` spawn logic |
| F-HOUSE-02 | No confession-room queue: multiple blocked housemates all route to the single `confession_chair` POI (capacity 1 ⇒ later ones get no POI and stand at default coords) | `reconcile()` blocked branch |
| F-HOUSE-03 | No diary-room UI, no question/answer payloads, no call-to-confession flow | no such code in `src/` or `public/` |
| F-DOC-01 | `docs/runners-verified.md` opencode `--auto` flag exists but master-plan rules forbid auto-approve by default (must remain opt-in per preset/job) | docs vs Global Rule 7 |
| F-TEST-01 | `test/milestone7.test.ts` dispatches a real `opencode` process during `bun test` (slow, machine-dependent, leaves worktree debris on failure paths) | test file; §2 side effect |
| F-STATE-01 | `boot.log` at repo root is a stale server log committed-adjacent artifact (ignored, but confusing); server restart reconcile is nonexistent | `boot.log` content |

## 11. Current opencode environment facts (VERIFIED, for Phase 3/4 planning)

All read on this machine, 2026-11-16:

- `opencode --version` → `1.18.35`; binary `~/.bun/bin/opencode.exe`; Bun `1.3.14`.
- Top-level CLI commands (from `opencode --help`): `serve` ("starts a headless opencode server"),
  `run`, `attach <url>`, `session`, `models [provider]`, `stats`, `export`, `import`, `agent`,
  `providers` (alias `auth`), `mcp`, `db`, `debug`, `acp`, `web`.
- `opencode serve --help` flags: `--port` (default 0), `--hostname` (default `127.0.0.1`),
  `--print-logs`, `--log-level DEBUG|INFO|WARN|ERROR`, `--pure`, `--mdns`, `--mdns-domain`,
  `--cors`.
- `opencode run --help` flags include: `--format default|json`, `--model provider/model`
  (`-m`), `--agent`, `--variant` ("model variant (provider-specific reasoning effort, e.g., high,
  max, minimal)"), `--session`, `--continue`, `--fork`, `--dir`, `--port`, `--title`,
  `--file`, `--attach <url>`, `-u/--username` (default `opencode` or
  `OPENCODE_SERVER_USERNAME`), `-p/--password` (default `OPENCODE_SERVER_PASSWORD`),
  `--auto` ("auto-approve permissions … dangerous!"), `--thinking`.
  ⇒ Server basic-auth credentials exist via env; server port is choosable; `run --format json`
  emits "raw JSON events" on stdout. All further server HTTP API shape (routes, event names,
  permission/question payloads, usage/cost fields) is **UNVERIFIED** until the Phase 3 spike
  captures real traffic; the plan budgets verification tasks for each.
- Local DB: `~/.local/share/opencode/opencode.db` (SQLite, ~12 GB incl. WAL) + `auth.json`
  (3,101 bytes — existing login store; must never be read, copied or logged by this app).
- User config `~/.config/opencode/opencode.json`: providers incl. `omniroute` (models
  `antigravity/claude-sonnet-5`, `antigravity/claude-opus-4-6-thinking`,
  `antigravity/gemini-3.5-flash-high`, `antigravity/gemini-3.6-flash-high`,
  `kr/claude-sonnet-4.5`, `free-premium-stack`), `chatgpt-free` (models `gpt-5.6-terra/sol/luna`,
  `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, each with `reasoning:true` and `variants
  low|medium|high|xhigh`), `omniroute-local`, more below line 120. One provider
  (`omniroute-local`) has a **plaintext `apiKey` string in the config file** — the house must
  never read/write/echo config values; noted as a hard rule (see ASSUMPTIONS A-14).
- Agents present in `~/.config/opencode/agents/` (11 files): `backend-systems-engineer.md`
  (`mode: all`), `cayla.md`, `code-reviewer.md` (read-only reviewer, `mode: all`),
  `database-systems-engineer.md`, `debugger.md`, `devops-platform-engineer.md`,
  `frontend-ui-engineer.md` (`mode: all`), `mobile-engineer.md`, `qa-engineer.md` (`mode: all`),
  `security-engineer.md`, `solutions-architect.md`. `mode` values seen in frontmatter: `all`;
  primary/subagent split UNVERIFIED until Phase 3 lists agents via the API.
- A dedicated "proofreader" (copy/docs-only, cannot edit code) agent does **not** exist ⇒
  Phase 5 proposes a new agent file for approval (NEEDS HUMAN DECISION).

## 12. Vision scorecard (DONE / PARTIAL / TODO)

Legend: **DONE** = working today; **PARTIAL** = exists but incomplete vs the vision item;
**TODO** = nothing exists.

| Vision item | Status | Evidence / gap |
| --- | --- | --- |
| Local web app, Bun server, Windows | DONE | `src/server.ts`, port 4777, loopback |
| Canvas/PixiJS house scene | DONE | `public/renderer.ts` + atlas |
| Agents as housemates with states | DONE (5 harnesses, incl. sleeping) | store + reconcile |
| Map, rooms, hallway, camera | DONE | house.json + camera presets |
| Nav (A*), doors, Y-sort | DONE | `public/nav.ts`, tests |
| House life (chores, sleep, anti-pileup) | DONE | `public/life.ts`, tests |
| Task flow: task_started/completed/blocked/error | DONE | store + tests |
| Subagents visible, tethered | DONE | parent link + dashed line |
| Hover/click info card | DONE | `#char-card` |
| Kuya banner, Taglish lines, day counter, TTS | DONE | `public/kuya.ts`, config |
| Headless dispatcher + worktree isolation | PARTIAL | works, but deletes worktree/branch (F-SEC-01), orphans on cancel (F-SEC-02), falls back to user's repo (F-SEC-06), no dirty-tree warning |
| Dispatcher security (token, host/origin, roots) | PARTIAL | missing rate limit + audit log + allowlist config wiring (F-SEC-03/04) |
| MCP wrapper | PARTIAL | works; housemate listing misparses state (F-MCP-01) |
| Harness adapters beyond opencode | DONE (out of scope going forward; kept for compat) | §6 |
| structure-lock validator | DONE | passing |
| validate-furniture drawn-bounds validator | DONE | passing, but see F-VIS-01 residual art issues |
| Dev layout editor with guarded save | DONE | editor + `/api/layout/save` |
| PBB summon/evict choreography (walk in/out, bag/suitcase) | TODO | F-HOUSE-01, F-VIS-02 |
| Confession Room as real Q&A surface (diary panel, ON AIR, queue) | TODO | F-HOUSE-02/03 |
| Kuya "call to confession" talk flow | TODO | F-HOUSE-03 |
| Guests (subagents) with lanyard/host desk/folder handoff | PARTIAL | tether + desks exist; no guest visuals/flow; Rule 11 pins guests as observed-only child sessions (P2-T13, P4-T20) |
| opencode background server control (summon = create session) | TODO | Phase 3 spike first |
| Agent/model picker with live agent+model lists | TODO | UNVERIFIED API surface |
| Live token usage / cost per housemate | TODO | `opencode stats` exists; server API UNVERIFIED |
| Permission/question answering through API | TODO | UNVERIFIED API surface |
| Real evict (abort → process-tree kill, keep worktree) | TODO | inverse of F-SEC-01/02 |
| Squad jobs engine (rules-based loop, gates, findings) | TODO | Phase 5 |
| bun:sqlite persistence (jobs/rounds/findings/messages/audit) | TODO | F-DATA-01 |
| `kuya` CLI for housemates | TODO | Phase 5 |
| Conversation layer (messages, inbox, eavesdrop) | TODO | Phase 6 |
| Season scoring, nomination night, groceries, brownout, Kuya cam, rules poster, wildcard | TODO | Phase 7 |
| Polish backlog (garden, chatter, day/night, perf, docs, security review) | PARTIAL (perf bench + manifest/docs exist) | Phase 8 |
| `.kuya/rejected/` out-of-scope edit enforcement | TODO | Phase 5 |
| Restart reconcile from state file | TODO | Phase 4 (supervisor) |
| Screenshots/visual proof pipeline | PARTIAL | `docs/screenshots/` exists with before/after; per-phase dirs to come |

## 13. Open visual debts carried from furniture-fix-2 (from `docs/visual-check.md`)

1. Dining chairs face the camera; a rear/side-facing kitchen-chair sprite variant would be
   needed (art).
2. Gym mirror column is offset one tile from the equipment column (structure-adjacent).
3. No water cooler in the gym (new content).
4. Pool table sprite reads small for the game room (art scale).
5. Confession spotlight cone starts two rows below its wall fixture (lighting).
These are listed, not fixed, per the no-art/no-structure scope of the furniture pass. The master
plan carries them into Phase 8 candidates / NEEDS HUMAN DECISION.
