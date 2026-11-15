# Bahay ni Kuya — Decisions and Assumptions

Recorded during milestone execution. Kept up to date without interrupting the user.

## Milestone 0: Verify & Environment

- **Environment**: All 5 harnesses (`opencode`, `codex`, `pi`, `omp`, `hermes`) are installed natively on Windows 11 (x64) with Bun 1.3.14 and Node v26.3.0.
- **Hermes**: Verified native Windows execution via `C:\Users\Cayz\AppData\Local\hermes\bin\hermes.cmd` and Python 3.14.7. WSL contingency is unnecessary and inactive.
- **Codex hooks**: Configured in `~/.codex/hooks.json`. Orca manages entries alongside Bahay ni Kuya. To guard against Orca regenerating or overwriting `hooks.json`, a startup check in `src/server.ts` verifies the presence of `"bahay-codex"` and re-merges our hook blocks without touching Orca's entries.
- **OpenCode DB vs Plugin**: `src/opencode-db.ts` is an effective read-only fallback, but suffers from a 3-second polling interval and does NOT capture permission request states (`blocked`). An OpenCode plugin adapter is provided in `adapters/opencode/bahay-opencode.js` with install/uninstall support in `scripts/install-adapters.ts`. When installed, real-time events override the DB poller; when uninstalled or missing, the DB poller seamlessly provides session and tool tracking.
- **Runners & MCP Clients**:
  - `opencode`: headless `opencode run "<prompt>" --format json`, MCP client via `opencode mcp`
  - `codex`: headless `codex exec "<prompt>" --json`, MCP client via `codex mcp`
  - `pi`: headless `pi -p "<prompt>" --mode json`, extension/bridge-based MCP
  - `omp`: headless `omp -p "<prompt>" --mode json`, extension/bridge-based MCP
  - `hermes`: headless `hermes chat -q "<prompt>"` / `hermes -z "<prompt>"`, MCP client via `hermes mcp`
- **Security Defaults**:
  - All dispatch endpoints bind to `127.0.0.1`.
  - Bearer token generated on first run and stored at `%USERPROFILE%\.bahay-ni-kuya\token`.
  - Strict Host and Origin validation (localhost / 127.0.0.1 only).
  - Git worktrees (`kuya/{harness}-{id}`) used by default for headless runs.

## Milestone 1: Quick Fixes & Instance Polish

- **Process Deduplication**: Implemented in `src/store.ts`. All matched harness processes are inspected; any matched process whose parent PID is also a matched harness process is treated as a child worker and excluded from top-level counting. Only top-level instances create characters or increment `state.procs`. Child CPU delta rolls up into the top-level parent.
- **Persistent Process Scanner**: Replaced the 5-second interval PowerShell process spawn in `src/scan.ts` with a single long-lived background PowerShell process that streams JSON chunks continuously. Subsequent queries read from the live memory cache with 0 process spawn overhead.
- **Canvas Decluttering & Character Identity**:
  - Removed all permanent text labels, name tags, and PIDs from the canvas. The canvas is completely clean during regular operation.
  - Added visual differentiation for multiple instances of the same harness: distinct instance color accents from `VARIANT_ACCENTS` and accessory pips on the character frame.
  - Added interactive hover & click info cards (`#char-card`) displaying harness, project folder (`cwd` basename), state, current tool, subagent count, and PID in small gray text. Clicking a character pins the card; clicking outside or on the close button dismisses it.

## Milestone 2: Map and Renderer

- **Tiled Map Generation**: Built generator script `scripts/generate-map.ts` and registered `bun run generate-map` in `package.json`. Generated map stored at `public/map/house.json` with standard Tiled-compatible format (42x27 16px tiles, orthogonal layers: `floor`, `walls`, `doors`, `furniture`, `collision`, `pois`).
- **Room Architecture**:
  - `Bedroom`: Cool blue-slate planks, 4 bunk beds, nightstands.
  - `Living Room`: Warm wood, sectional sofa, CRT TV console with scanlines, lamp.
  - `Office`: Parquet sage wood, 8 primary desks with CRT monitors + 4 subagent terminal desks (12 total).
  - `Kitchen`: Ceramic checkered floor, stainless fridge, stove, sink, dining table & chairs.
  - `Game Room`: Pink/mauve felt floor, green-baize pool table, two arcade cabinets.
  - `Gym & Garden`: Green rubber turf, exercise treadmill, potted lush foliage.
  - `Confession Room`: Obsidian dark floor, solitary chair, atmospheric radial spotlight beam.
  - `Hallway`: Checkered black and white floor connecting all rooms with door openings.
- **Renderer Engine (`public/renderer.ts`)**:
  - Pure Canvas 2D procedural pixel art (zero paid assets).
  - True depth Y-sorting: furniture items and characters are unified in a YSortable array and rendered sorted by ground-foot Y coordinate.
  - Atmospheric per-room lighting tints and soft radial edge vignette.
  - Retro CCTV overlay with corner brackets `[ ]`, blinking red `● REC` indicator, live timestamp, and dynamic camera channel header (`CAM 3 - OFFICE`, etc.).
  - Smooth camera pan & zoom controller.


## Milestone 3: Navigation and Animation

- **A\* Pathfinding (`public/nav.ts`)**:
  - Implemented 4-directional grid-based A* pathfinding using the collision layer from `public/map/house.json`.
  - Door tiles are explicitly marked as walkable so characters seamlessly traverse doorways between rooms and hallways.
  - Added fallback snap-to-walkable-neighbor if a target coordinate falls onto solid furniture (e.g., clicking on a desk or bed routes to the chair tile immediately adjacent).
- **Sprite Animation System (`public/anim.ts`)**:
  - 4-direction facing orientation (`up`, `down`, `left`, `right`).
  - Distinct action animations: `walk`, `idle`, `sit`, `type`, `sleep`, `wash`, `cook`, `tv`, `pool`, `arcade`, `exercise`, `water`, `read`.
  - Emote bubbles with expressive glyphs: `thumbs_up` (👍), `facepalm` (🤦), `question` (❓), `exclamation` (❗), `sweat` (💧), `heart` (❤️).
  - Species avatars per harness: Beaver (opencode), Octopus (codex), Hamster (pi), Raccoon (omp), Owl (hermes).
- **Interactive Controls & Test Walk**:
  - Added CCTV camera buttons (`ALL`, `OFFICE`, `LIVING`, `BEDROOM`, `KITCHEN`, `GAME`, `CONFESSION`) that smoothly pan and zoom to each room with customized camera labels.
  - Added `#btn-test-walk` button: clicking it spawns/moves a character to Bedroom (4, 5) and routes through the bedroom door (6, 11), down the hallway, through the office door (32, 11), and into the office desk (26, 4) without clipping any dividing walls.

## Milestone 4: House Life

- **POI Schema (`config/pois.json` & `public/pois.json`)**:
  - All POIs adhere to the standard schema `{ id, room, x, y, facing, action, minSec, maxSec, capacity, tags }`.
  - Configured across all 7 non-hallway rooms: 4 bunk beds in Bedroom, 4 sofa spots + TV + bookshelf in Living Room, 8 primary desks + 4 subagent desks in Office, Sink + Stove + Fridge + Dining in Kitchen, Pool table cues + 2 Arcade cabinets in Game Room, Treadmill + Foliage garden corner in Gym, and Spotlight Chair in Confession Room.
- **Autonomous House Life Manager (`public/life.ts`)**:
  - Enforces strict seat reservations and POI capacity constraints (e.g. TV console has capacity 2, desks have capacity 1).
  - Enforces anti-repetition rule (`picked.id !== previousPoiId`) so characters never immediately repeat the same activity.
  - Applies weighted room rotation inversely proportional to recent visits to prevent idle housemates from clustering or piling up in the living room; housemates actively visit the kitchen, game room, gym, and living room.
  - Sleep/Wake state transitions: harnesses that are not running remain asleep in bunk beds with floating `Zzz`. As soon as a process starts running, the housemate wakes up with a `thumbs_up` emote, leaves the bedroom, and begins house life.

## Milestone 5: Task Flow

- **Extended Wire Protocol**:
  - Added new event types: `task_started`, `task_completed`, `blocked`, `subagent_started`, `subagent_ended` alongside existing `session_start`, `session_end`, `state`, `tool`, `error`.
  - Added session states: `idle`, `working`, `blocked`, `error`.
  - Added session properties: `errorCount` and `nominated` (true when `errorCount >= 3`).
- **Adapter Event Mappings**:
  - `codex`: `UserPromptSubmit` → `task_started`, `PermissionRequest` → `blocked`, `Stop`/`Interrupt` → `task_completed`, `SubagentStart`/`SubagentStop` → `subagent_started`/`subagent_ended`.
  - `pi` & `omp`: `before_agent_start` → `task_started`, `tool_approval_requested` → `blocked`, `agent_end` → `task_completed`, `task:subagent:lifecycle` → subagents.
  - `opencode`: `session.execution.started` → `task_started`, `permission.asked` → `blocked`, `session.execution.succeeded`/`session.idle` → `task_completed`.
  - `hermes`: outbound webhook maps to task lifecycle; when working on research, Hermes navigates to the library reading nook (`living_bookshelf`).
- **Kuya Layer & Visual Flow**:
  - Kuya announcement banner (`#kuya-banner`) announces task summons (`KUYA: {harness}, pumunta po kayo sa office. May task po kayo.`), permission requests calling housemates to the Confession Room, task completion, and nomination alerts.
  - Subagents: spawn directly at parent character, smaller scale (22px), take extra subagent desks in the office, and poof away when finished.
  - Blocked housemates walk to the Confession Room, sit under the spotlight with a `!` bubble, and wait until resolved.
  - Repeated errors (>= 3) display a glowing red/gold `NOMINATED` badge over the character.
  - Verified with extended `bun run fake` ("day in the house" journey).
