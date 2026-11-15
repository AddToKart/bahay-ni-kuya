# Agent House — Implementation Plan

Pixel/emoji visualizer for every AI coding harness on this PC. A local web app at
`http://localhost:4777` renders a Canvas 2D house: harnesses sleep in the **Bedroom**
(not running), chill in the **Living Room** (running, idle/waiting), and work at desks in the
**Office** (thinking / calling tools). Subagents appear as smaller characters tied to their
parent, with the same room logic. Sprites walk smoothly between rooms.

## 0. Machine recon (verified 2026-11-16, read-only probes)

| Harness   | Installed | Version                      | Binary / shim                  | Config location (verified)                                                     |
| --------- | --------- | ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| opencode  | yes       | `1.18.35`                    | `~/.bun/bin/opencode.exe`      | `~/.config/opencode/opencode.json`, plugins dir `~/.config/opencode/plugins/`   |
| codex     | yes       | `codex-cli 0.166.0`          | `C:\nvm4w\nodejs\codex.cmd`    | `~/.codex/config.toml`, hooks at `~/.codex/hooks.json` (exists, Orca-managed)    |
| pi        | yes       | `0.83.0` (lastChangelog)     | `C:\nvm4w\nodejs\pi.cmd`       | `~/.pi/agent/settings.json`, extensions dir `~/.pi/agent/extensions/` (auto-load)|
| omp       | yes       | `omp/18.20.2`                | `~/.bun/bin/omp.exe`           | `~/.omp/agent/config.yml`, extensions dir `~/.omp/agent/extensions/` (auto-load) |
| hermes    | yes       | `v0.21.5+8116` (2026.9.24)   | `AppData\Local\hermes\bin\hermes.exe` | `AppData\Local\hermes\config.yaml` (native Windows, **not WSL**) |
| Bun       | yes       | `1.3.14`                     | `~/.bun/bin/bun.exe`           |                                                                                 |
| Node      | yes       | `v26.3.0`                    | `C:\nvm4w\nodejs\node.exe`     |                                                                                 |

Port `4777` free at plan time. Repo = new empty folder `D:/code_ni_kurt/pixel-office`
(not yet a git repo — we will `git init` in M0).

### Where the research was outdated or wrong (verified on this machine)

- **omp config is `~/.omp/agent/config.yml`**, not `settings.json`. There is no `extensions`
  key in it today, but omp *does* auto-load `.ts` extensions from
  `~/.omp/agent/extensions/` (three Orca-managed ones live there and work). Registration via
  the `extensions` array remains a documented fallback — the plan uses auto-discovery, with
  the array as Plan B. `ctx.agent` subagent detection claim (omp ≥ 18.3.2) applies: we run 18.20.2.
- **Hermes runs natively on Windows** (`AppData\Local\hermes\bin\hermes.exe`), so the WSL
  contingency is moot; config lives at `AppData\Local\hermes\config.yaml`, not `~/.hermes/`.
- **Codex hooks already exist** in `~/.codex/hooks.json` and are Orca-managed
  (`C:/Users/Cayz/.orca/agent-hooks/codex-hook.cmd`), with hook trust state recorded in
  `[hooks.state]` in `config.toml`. We must **add entries**, not replace the file, and we
  must not remove Orca's entries on rollback — remove only ours.
- **opencode events in the wild here** (seen in the Orca plugins on this machine):
  `session.created`, `session.status`, `session.idle`, `session.error`, `session.deleted`,
  `session.execution.*`, `session.text.ended`, `session.next.tool.*` — plus, per docs,
  `message.part.updated`, `permission.asked`, `tool.execute.before/after`. Subagents are
  child sessions with `parentID` on `session.created`. Plugin format proven: a default-exported
  function module in the plugins dir (existing plugins use it).
- **pi and omp share one extension API** (same handler shape; types published under different
  package names — omp publishes its own under the omp package, pi's types come from
  `@earendil-works/pi-coding-agent`, which is exactly what the `pi` shim executes:
  `node_modules/@earendil-works/pi-coding-agent/dist/cli.js`).
- **pi trust**: `~/.pi/agent/trust.json` pins trusted project dirs; extensions live in the
  auto-loaded global dir, so no per-project trust change is needed for the adapter itself.

## 1. Milestones (each demoable)

- **M0 — Server skeleton + process scan.** HTTP + WS server on 4777; PowerShell process
  scanner; all installed harnesses visible. Demo: open page, see all five sleeping.
- **M1 — Fake events + frontend shell.** `scripts/fake-events.ts` walks a harness through
  sleeping → idle → working, spawns fake subagents. Demo: full room/movement/subagent logic
  works without touching real harnesses.
- **M2 — opencode adapter (plugin) with subagents.** Demo: real opencode sessions walk rooms.
- **M3 — Hermes outbound hooks.** Demo: hermes chat sessions + delegate_task subagents live.
- **M4 — Codex hooks** (append-only to existing hooks.json). Demo: codex turn shown working.
- **M5 — omp extension** (auto-loaded from `~/.omp/agent/extensions/`). Demo: omp turn + subagents.
- **M6 — pi extension** (same code shape as omp, different dir + types package). Demo: pi turn.
- **M7 — CPU-delta fallback + polish.** File-activity/CPU fallback for any harness whose
  adapter proves unreliable, dead-session sweeping, sprites, sounds-off, README.

Order rationale: opencode first (richest events, subagents, proven plugin dir), hermes second
(native webhook support → no shim process), codex third (hooks exist already), omp/pi last
(share one adapter design; test one, port to the other).

## 2. Unified event schema

Single `POST /event` endpoint. Body:

```jsonc
{
  "harness": "opencode",           // opencode | codex | pi | omp | hermes
  "sessionId": "s1",               // adapter-scoped unique id; server namespaces by harness
  "parentSessionId": null,         // set for subagent sessions
  "type": "session_start",         // session_start | session_end | state | tool | error
  "state": "working",              // working | idle          (adapters say what they know)
  "title": "fix lint errors",      // optional label
  "tool": "edit",                  // optional current tool name
  "directory": "D:/code_ni_kurt/pixel-office",
  "ts": 1731739200000              // epoch ms
}
```

- The server is the only writer of truth: adapters report raw observations; the server owns
  the state machine (below) so every adapter stays trivial and any buggy adapter can't
  distort global state.
- Child sessions inherit `directory` from their parent if absent.

## 3. Server state machine

Per `(harness, sessionId)`:

```
        events with state=working
 ┌─────────┐  session_start(working)  ┌─────────┐
 │ sleeping│ ───────────────────────▶ │ working │
 └─────────┘                          └────┬────┘
      ▲      session_start(idle)           │  no working-event for IDLE_MS (4_000)
      │  ◀────────────────────┐            ▼
      │ session_end / stale   │       ┌─────────┐
      └───────────────────────┼────── │  idle   │
                              └───────┴─────────┘
```

- **Sleeping** = no live session for this harness **and** process scan says not running.
- A `session_start(working)` while already working just refreshes `lastWorkingTs`.
- `IDLE_MS = 4_000` after the last working-flavored event (covers model latency gaps).
- **Stale-session sweep (every 2 s):** a session with no event for `STALE_MS = 90_000`
  and no matching process evidence → treated as ended. Sessions whose harness process is
  gone from the scan are dropped immediately (prevents replayed historical sessions from
  ghosts after restart).
- "Waiting on permission/tool approval" is surfaced as an `idle`+bubble, not a fourth state.

## 4. Server design

```
pixel-office/
├─ package.json          # bun, no runtime deps except ws types (types only)
├─ tsconfig.json
├─ src/
│  ├─ server.ts          # Bun.serve: static + POST /event + /healthz + WS upgrade
│  ├─ store.ts           # session map, parent links, state machine, sweep
│  ├─ scan.ts            # PowerShell Win32_Process poller (5 s), parsed cache
│  ├─ broadcast.ts       # WS fan-out, backpressure-safe
│  └─ log.ts             # ring buffer log for /debug
├─ public/
│  ├─ index.html
│  ├─ main.ts            # canvas loop, state machines, tweening
│  ├─ rooms.ts           # geometry, slot allocation, door waypoints
│  ├─ sprites.ts         # emoji→offscreen canvas raster cache
│  └─ style.css
├─ scripts/
│  ├─ fake-events.ts
│  └─ install-adapters.ts   # copies adapter files into each harness's dir (idempotent)
├─ adapters/             # one folder per harness, see §5
└─ plan/                 # this plan
```

- `Bun.serve({ port: 4777 })`: serves `public/`, `POST /event` (JSON, body limit 64 KiB),
  `GET /healthz`, and WebSocket upgrade. WebSocket push is a full-state snapshot on connect
  and per-change deltas; the client diffs by `sessionId`. **Fallback if a WS library is
  needed**: Bun has built-in WS support via `websocket` handler in `Bun.serve` — zero deps.
- **Process scan loop** every 5 s (configurable `SCAN_MS`):
  one `Get-CimInstance Win32_Process` call filtered by harness command-line patterns:
  `opencode.exe|codex|pi.cmd|omp.exe|hermes.exe` — actual match list refined in M0 against
  `Get-CimInstance` output on this machine. Captures `ProcessId`, `ParentProcessId`,
  `Name`, `CommandLine`. Builds a tree per harness root process so CPU fallback (M7) can
  measure per-tree deltas.
- **Session store** (`store.ts`): `Map<harness, Map<sessionId, SessionRec>>` where
  `SessionRec = { state, title, tool, parent, directory, lastEventTs, lastWorkingTs, startedTs, source }`.
  Parents referenced by id; children store `parentId`; server enforces that a child's
  `parentId` exists or is within 30 s tolerance to be linked (else treated as root).
- **Broadcast**: full snapshot on WS open; incremental updates after. Backpressure: if a
  client lags > 3 snapshots, drop deltas and send one full snapshot (cheap state, ≤ dozens
  of sessions).

## 5. Adapters (one per harness)

All adapters share the same safety rules:
- Every hook/extension body is wrapped in try/catch; a throw must never propagate into the
  host harness.
- Posts use `AbortSignal.timeout(1500)` and never block the host beyond that.
- If the server is down, adapters fail **silently** (no dialogs, no crash, no retry storms;
  at most one info line to the harness's own log file).
- Adapters read the target URL from env `AGENT_HOUSE_URL` (default `http://127.0.0.1:4777/event`).

### 5.1 opencode plugin — `adapters/opencode/agent-house-opencode.ts`

- **Install:** copy to `C:\Users\Cayz\.config\opencode\plugins\agent-house-opencode.ts`.
  No config change needed (plugins dir is scanned automatically). **Rollback:** delete the file.
- **Design:** default-export plugin. Subscribes to
  `session.created` (capture `parentID` → subagent), `session.status` / `session.idle` /
  `session.error` (state), `message.part.updated` (activity heartbeat → working), 
  `permission.asked` (idle + bubble), `tool.execute.before/after` (tool bubble + working).
  Dedupes by `sessionId`; parent's `directory` inherited. Subagent detection: `parentID` on
  `session.created`. **Risk:** exact event-name set must be confirmed by the M2 logging
  probe; the existing Orca plugins on this machine already subscribe to `session.*` names
  above, so the surface is proven live here.
- **Assumption (to verify in M2):** `tool.execute.before/after` exist in this version and
  fire with a usable `tool` name; if not, fall back to `session.next.tool.*` events that
  the Orca plugins already use.

### 5.2 hermes — `adapters/hermes/hooks-hermes.yaml` (outbound hooks)

- **Install:** edit `AppData\Local\hermes\config.yaml`, append:
  ```yaml
  hooks:
    outbound:
      - url: http://127.0.0.1:4777/event
        events: [on_session_start, on_session_end, post_tool_call, subagent_start, subagent_stop]
        # optional: tool matcher regex to keep noise low
  ```
  (Exact key spelling/shape **[ASSUMPTION]** — confirmed against hermes docs + a logging
  probe in M3; hermes hooks are fail-open, so a bad block degrades to no events, not a crash.)
- **Rollback:** remove the appended block (keep a dated backup `config.yaml.agent-house-backup`).
- Hermes is native Windows → process scan sees `hermes.exe` normally; `delegate_task`
  subagents (up to 3 concurrent) arrive as events with `parent_session_id`/`child_session_id`.

### 5.3 codex — `adapters/codex/agent-house-codex.cmd` + `.ps1`

- **Install:** **append** four entries to the existing `~/.codex/hooks.json` (Orca's entries
  stay untouched; file is already trusted/activated). New script:
  `C:\Users\Cayz\.orca\agent-hooks\agent-house-codex.cmd` (put ours beside Orca's, since
  that dir is already used and trusted for hook scripts).
  ```jsonc
  // appended to hooks: { ... }
  "SessionStart": [ { "hooks": [ { "type": "command", "command": "C:/Users/Cayz/.orca/agent-hooks/agent-house-codex.cmd", "timeout": 10 } ] } ],
  "Stop":          [ { "hooks": [ { "type": "command", "command": ".../agent-house-codex.cmd", "timeout": 10 } ] } ],
  "PreToolUse":    [ { "hooks": [ { "type": "command", "command": ".../agent-house-codex.cmd", "POST body → working", "timeout": 10 } ] } ],
  "PostToolUse":   [ ... same script ... ]
  ```
  The `.cmd` wraps a small PowerShell/Node one-liner that reads the hook JSON from stdin
  (codex passes event payload on stdin), extracts `session_id`, `hook_event_name`, `tool_name`
  and POSTs to the server. **Assumption (verify in M4):** stdin carries the payload;
  `session_id`/`hook_event_name`/`tool_name` field names as documented for codex hooks
  (like Claude-Code-style hook payloads).
- **Rollback:** remove our entries from hooks.json only (leave Orca's); delete the script.
- Fallback if hooks don't fire as expected: `~/.codex/sessions/` dir-existence + mtime
  watcher (dir verified to exist) as an M7 fallback.

### 5.4 omp extension — `adapters/omp/agent-house-omp.ts`

- **Install:** copy to `~/.omp/agent/extensions/agent-house-omp.ts` (auto-discovered;
  Orca's extensions there already prove auto-load works). **Rollback:** delete the file.
- Subscribes to `before_agent_start`, `turn_end`, `agent_end`, `session_shutdown`,
  `tool_execution_start/update/end`. Subagents: `ctx.agent` identifies a subagent session
  (verified ≥ 18.3.2; we're on 18.20.2); use `session_init` entry as fallback.
- **Assumption (verify in M5 probe):** exact event payload fields (`ctx.agent` naming,
  session ids in payloads); the M5 logging adapter confirms before building the real one.

### 5.5 pi extension — `adapters/pi/agent-house-pi.ts`

- Same code shape as the omp adapter (verified: pi/omp share handler shapes; Orca ships the
  *same* extension file to both dirs). Install to `~/.pi/agent/extensions/agent-house-pi.ts`.
- Types import from `@earendil-works/pi-coding-agent` (that's the package the `pi` shim runs;
  types-only import so nothing breaks if it moves). Uses `pi.on("session_start" | "turn_start" |
  "turn_end" | "message_start" | "tool_call", ...)`.
- **Assumption (verify in M6 probe):** exact `ExtensionAPI` import path for types; pi has no
  built-in subagent concept — if a pi extension (e.g. Orca's) spawns child sessions they will
  simply show as separate root sessions (acceptable; flag in README).
- **Rollback:** delete the file.

## 6. Frontend design

- **Rooms:** a fixed scene, `900×540` logical canvas, scaled to fit the window:
  ```
  ┌─────────────────────────────────────────────────────┐
  │  [window]          [window]                         │
  │   ┌─────────┐  ┌──────────────────┐                 │
  │   │ BEDROOM │  │   LIVING ROOM    │   ┌──────────┐  │
  │   │ 6 beds  │  │ sofa/plants/rug  │   │  OFFICE  │  │
  │   └─────────┘  └──────────────────┘   │ 6 desks  │  │
  │        corridor along the bottom, two doors           │
  └─────────────────────────────────────────────────────┘
  ```
  (precise px layout in `rooms.ts`; corridor is the shared walkway; doors are waypoints on
  the corridor `y` line).
- **Slot allocation:** Bedroom 6 beds, Living Room 8 sofa/standing spots, Office 6 desks —
  slots assigned greedily per harness+session id hash so a character keeps "its" spot while
  it stays in a room. Harness identity owns a stable bed; sessions fill remaining slots.
  Subagents take the nearest free slot **to their parent** (same room first, else corridor).
- **Movement:** straight-line tween at ~40 px/s toward the assigned slot, but routed via
  **door waypoints** (each room has one door point on the corridor): move → door of current
  room → corridor → door of target room → slot. Arrive within 2 px → snap. If a target
  changes mid-walk, retarget smoothly (no teleport).
- **State bubble:** when `tool` is known, show a speech bubble (canvas text) with tool name
  for 4 s. Bubble queue per character so rapid tools don't flicker.
- **Sprites:** emoji glyphs rendered to offscreen canvases at 48 px (harnesses) / 32 px
  (subagents) at device-pixel-ratio, cached by `(emoji, size)`. Map:
  `opencode 🦫, codex 🐙, pi 🐹, omp 🦝, hermes 🦉` (**[ASSUMPTION]** emoji look fine on the
  user's machine — trivially swappable in one constant). Free, no tilesets.
- **Labels:** name under sprite (harness + short session title), subagents get "↳ parent".
- **Work animation:** subtle bobbing while `working`; `zzz` bubble in Bedroom; coffee cup
  emoji in Living Room.

## 7. Edge cases

| Case                             | Handling                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Multiple instances same harness  | Independent sessions per `sessionId`; process scan counts PIDs; each gets its own sprite.   |
| Subagent bursts (hermes ×3, etc.)| Slot allocator holds N free office/living slots; if full, overflow to corridor standing spots. |
| Replayed historical sessions     | Sessions arriving without a live process → sweep drops them after STALE_MS; process-gone rule clears instantly. |
| Harness crashes (no session_end) | Stale sweep + process-gone rule (see §3).                                                    |
| Port 4777 busy                   | Server fails loudly at startup with a clear message naming the PID holding 4777; adapters stay silent. Frontend shows "disconnected" banner. |
| Server crash                     | Adapters fail silently; frontend reconnects WS every 2 s.                                    |
| Adapter bug floods events        | Server rate-limits per harness (e.g. 50 events/s → shed with a warning).                     |
| Laptop sleep/resume              | `ts` gap > 60 s → force a full re-render and sweep; scan loop re-syncs on resume.            |

## 8. Milestone checklists & risks

### M0 — Server + scan (demoable)
- [ ] `bun run src/server.ts` serves index at 4777, `/healthz` 200, WS connects.
- [ ] Scanner lists each installed harness; nothing listed for uninstalled ones.
- [ ] Kill one harness → it moves to Bedroom within one scan cycle.
- [ ] Two instances of one harness → two rows in `/debug`.
- [ ] Port-busy error names the PID.
**Risks:** CIM query cost (~200–600 ms per call) — mitigated: single call per cycle, parse
fast, no second call unless config says so; risk accepted at 5 s cadence.

### M1 — Fake events + frontend shell (demoable)
- [ ] `bun run scripts/fake-events.ts` walks a fake harness through all states; sprite moves.
- [ ] Subagent sprites appear near parent; parent-child link line drawn.
- [ ] Sprites tween through corridor doors, never through walls.
- [ ] WS reconnect banner on kill/restart of server.
**Risks:** slot collision during bursts — overflow corridor spots added.

### M2 — opencode adapter (demoable)
- [ ] Logging probe confirms real event names + payload field names (parentID, title).
- [ ] Real opencode session: working→idle→sleeping transitions correct.
- [ ] Launch a subagent task → child sprite appears tied to parent, ends with parent's room.
- [ ] Adapter with server DOWN leaves opencode fully functional (canary: opencode boots and
  answers a trivial prompt with server stopped).
**Risks:** plugin API surface differs in 1.18.35 vs docs → probe first; opencode plugin
crash = the user's top fear → adapter is defensive (try/catch, timeout, silent fail), and
is **installed last after the canary test**, kept in the plugins dir only while the
process-scan fallback covers the rest.

### M3 — Hermes outbound hooks (demoable)
- [ ] Logging probe: real `config.yaml` hook shape + event names; `delegate_task` subagent
      events show `parent_session_id`/`child_session_id`.
- [ ] A hermes chat session walks the rooms; delegate_task spawns 3 children tied to parent.
- [ ] Bad URL in hooks config → hermes unaffected (fail-open).
**Risks:** hook event names/shape are **[ASSUMPTION]** until the probe; fallback = shell
hooks in `config.yaml` (also fail-open) or hermes's ACP/`--pass-session-id` events.

### M4 — Codex hooks (demoable)
- **Verify first:** `codex exec "say hi"` fires our hook with payload on stdin.
- [ ] `PreToolUse` → Office; `Stop` → Living Room; process-gone → Bedroom.
- [ ] Orca's own codex hooks still fire (Orca side unaffected — check Orca status view).
**Risks:** codex hooks not trusted until activated in the TUI (version ≥ 0.129 requirement);
existing `hooks.state` in config.toml suggests trust flow already ran. Fallback: watch
`~/.codex/sessions/` file mtime (dir verified present).

### M5 — omp extension (demoable)
- [ ] Logging probe → real event names/payloads on this omp build.
- [ ] omp turn: Office during turn, Living Room on `agent_end`, Bedroom when process gone.
- [ ] `ctx.agent`-marked subagent shows smaller, linked to parent.
**Risks:** subagent id field naming differs from docs → the probe decides. Fallback:
register via `extensions` array in `config.yml` if auto-load ever fails.

### M6 — pi extension (demoable)
- [ ] Same probe → pi event names; install shared adapter with pi types import.
- [ ] pi turn transitions correct; uninstalled-harness tests still show nothing for absent harnesses.
**Risks:** type import path churn between pi versions — import types only (or none) and
define a local minimal interface so runtime never depends on the package.

### M7 — CPU/file-activity fallback + polish
- [ ] CPU-time delta over the process tree (from scan cache) flips a process-only harness
      to "working" above a threshold; harnesses with a healthy adapter ignore CPU signals.
- [ ] `~/.codex/sessions/` mtime watcher active only if codex hooks proved unreliable.
- [ ] Sprites, labels, bubbles polished; README + screenshots; `install-adapters.ts` gains
      `--uninstall` so rollback is one command.
**Risks:** CPU fallback false-positives (e.g. model streaming is network-bound, CPU-idle) —
labeled as "activity guess" in the UI (bubble text), never claimed as ground truth.

## 9. Decisions I made (so you don't have to)

- **Server is the single state owner** — adapters only report; keeps every adapter trivial
  and safe, and makes the state machine testable without the harnesses.
- **Auto-discovery over registration** for omp/pi (dirs proven to auto-load on this machine);
  the documented `extensions` array registration stays documented as Plan B.
- **Codex adapter lives in `~/.orca/agent-hooks/`** (dir already used for codex hook scripts
  and trusted), rather than a new location.
- **Scan interval 5 s, idle-after-4 s, stale-after-90 s** — snappy but cheap; all tunable via
  constants at the top of `store.ts` / `scan.ts`.
- **Emoji sprites, no image assets** — zero licensing concerns, instantly swappable.
- **git init in M0** so every adapter install can be reviewed as a diff before it lands.
- **`ws` over SSE** (Bun native WS) — simpler than SSE with multiple clients and no extra deps.

---

## Build notes (as executed 2026-11-16)

- **opencode:** the plugin route does not work on 1.18.35 — a probe showed the V2 `setup(ctx)` context exposes no event bus (`keys: options, agent, aisdk, catalog, command, integration, plugin, reference, skill`; no `event`/`session`) in both `opencode run` and the TUI. Orca's own V2 plugin no-ops there too. Replaced with a read-only SQLite watcher (`src/opencode-db.ts`, 3 s poll, 6 s active window, 15 s startup grace) over `~/.local/share/opencode/opencode.db`: sessions, `parent_id` subagents, titles, directories, tool parts. The tested plugin file was removed and the installer cleans any legacy copy.
- **Frontend:** name labels render on cream plates with per-room collision avoidance (shift down/up, clamp to room); subagents get companion slots beside the parent desk (±34/±40 px) with a dashed parent link; office/spawn positions are deduped.
- **codex:** all installed hook keys verified present in `codex.exe` 0.166.0 strings (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `SubagentStart`, `SubagentStop`, `SessionEnd`, `Interrupt`). Merge preserved the 9 Orca entries (19 total, valid JSON); backup at `~/.agent-house/backups/2026-11-15T17-25-39-257Z/`. Hook script exercised end-to-end with synthetic stdin payloads.
- **hermes:** `hooks.outbound` schema, payload shape and event names verified from installed Python sources (`agent/outbound_webhooks.py`, `hermes_cli/plugins.py`); block appended to `AppData/Local/hermes/config.yaml`. Live `hermes` run not exercised (hooks prompt for approval; fail-open).
- **omp/pi:** extensions installed into their auto-loaded extension dirs; API/event names read from the Orca extensions already running on this machine. Live runs not exercised (TUI-only harnesses).
- **Verified live:** process scan lifecycle (spawn → idle, kill → sweep), WS broadcast, idle decay, subagent tree deletion, opencode canary (`opencode run` succeeded with server up; watcher showed the session working), codex hook stdin-path, browser scene (0 console/page errors).
