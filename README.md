# Bahay ni Kuya 🏠

A local pixel visualizer and headless dispatcher for AI coding harnesses (`opencode`, `codex`, `pi`, `omp`, `hermes`) reimagined as housemates in a Pinoy-Big-Brother-style parody house.

When an AI harness is given a coding task, Kuya announces it over the PA ticker. That housemate drops its chore, walks across the house to the Office, and works at a computer terminal in an isolated git worktree. When blocked on permissions, it sits in the spotlight in the Confession Room. When finished, it returns to house life.

---

## Architecture & Layout

```
+-----------------------------------------------------------------------------------------+
|                                      BAHAY NI KUYA                                      |
+--------------------------+------------------------------+-------------------------------+
|       BEDROOM (Bunk beds)|       HALLWAY (Checkered)    |      OFFICE (Desks & Mon.)    |
|   Zzz sleeping housemates|    Walkable A* navigation    |   8 primary + 4 subagent desks|
+--------------------------+------------------------------+-------------------------------+
|      LIVING ROOM (Sofa)  |       HALLWAY                |      KITCHEN (Sink & Stove)   |
|   CRT TV, Bookshelf Nook |   Camera HUD & Ticker        |   Cooking, dishes, dining     |
+--------------------------+------------------------------+-------------------------------+
|      GAME ROOM (Pool)    |   CONFESSION ROOM (Spotlight)|      GARDEN & GYM (Treadmill) |
|   Pool table, 2 Arcades  |   Solitary chair, ! emote    |   Potted foliage, workout     |
+--------------------------+------------------------------+-------------------------------+
```

### Visual Preview & Verification
For visual walkthroughs, camera channel descriptions, and manual verification steps, see [`docs/screenshots/README.md`](docs/screenshots/README.md).

---

## Features

- **3/4 Top-Down Pixel View**: 16px procedural tiles rendered at crisp 3x integer scale via Canvas 2D.
- **7 Thematic Rooms**: Bedroom (bunks), Living Room (TV & sofa), Office (12 workstations), Kitchen (sink, stove, fridge, dining), Game Room (pool, arcades), Gym & Garden, Confession Room (spotlight beam), and a connecting checkered hallway.
- **A\* Pathfinding & 4-Direction Animations**: Smooth movement with door navigation, seating reservations, capacity enforcement, and zero wall-clipping.
- **Autonomous House Life**: Idle housemates cook, wash dishes, watch TV, play pool, read books, work out, and sleep with floating `Zzz` bubbles. Anti-repetition and anti-pileup weighting keep all rooms lively.
- **Kuya Announcement Layer**: Sequential Taglish banner announcements with template variables (`config/kuya-lines.json`), day counter ("Day N in the house"), room camera presets (`ALL`, `OFFICE`, `LIVING`, `BEDROOM`, `KITCHEN`, `GAME`, `CONFESSION`), and optional Web Speech TTS.
- **Headless Dispatcher & Worktree Isolation**: Dispatches tasks to local harnesses (`codex`, `opencode`, `pi`, `omp`, `hermes`) in temporary git worktrees (`kuya/{harness}-{id}`) with real-time stdout/stderr log tailing and `git diff --stat` summaries.
- **Dispatch Security**: Mandatory loopback binding (`127.0.0.1`), 64-char hex Bearer token stored in `%USERPROFILE%\.bahay-ni-kuya\token`, strict Host & Origin validation (rejects foreign hosts/CORS), and allowlisted repository roots.
- **Model Context Protocol (MCP) Server**: Stdio MCP server (`bun run mcp`) exposing `kuya_list_housemates`, `kuya_assign_task`, `kuya_task_status`, and `kuya_cancel_task` with built-in delegation loop prevention (blocks self-delegation and recursion >2 levels).

---

## Quick Start

### 1. Start the Server
```powershell
bun run start
```
Open **http://localhost:4777** in any modern web browser.

### 2. Install Harness Adapters (Optional but Recommended)
Injects lightweight, fail-silent event adapters and MCP configurations into your harnesses (backed up automatically):
```powershell
bun run install-adapters
```
To revert changes completely:
```powershell
bun run install-adapters --uninstall
```

### 3. Run Simulated Day in the House
To see the full Pinoy Big Brother routine (wake up, chores, task dispatch, typing, subagents, confession room, completion, sleep) without running actual harness workloads:
```powershell
bun run fake
```

### 4. Run MCP Server
To delegate tasks from an MCP-capable harness (Codex, OpenCode, Hermes):
```powershell
bun run mcp
```

### 5. Run Verification Test Suite
```powershell
bun test
```

---

## Harness Capabilities & Headless Invocations

| Harness | Version | Headless Command | Worktree Mode | MCP Client | Config Path |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **codex** | `0.166.0` | `codex exec "<prompt>" --json` | `--worktree` | Native | `~/.codex/config.toml` |
| **opencode** | `1.18.35` | `opencode run "<prompt>" --format json` | Managed worktree | Native | `~/.config/opencode/opencode.json` |
| **pi** | `0.83.0` | `pi -p "<prompt>" --mode json` | Managed worktree | Extension / Bridge | `~/.pi/agent/settings.json` |
| **omp** | `18.20.2` | `omp -p "<prompt>" --mode json` | Managed worktree | Extension / Bridge | `~/.omp/agent/config.yml` |
| **hermes** | `0.21.5` | `hermes chat -q "<prompt>"` | `--worktree` | Native | `AppData\Local\hermes\config.yaml` |

See [`docs/runners-verified.md`](docs/runners-verified.md) for full runner tables and MCP registration snippets.

---

## Configuration

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `BAHAY_NI_KUYA_PORT` | `4777` | HTTP & WebSocket server port |
| `BAHAY_NI_KUYA_HOST` | `127.0.0.1` | Bind host (loopback strictly enforced) |
| `BAHAY_NI_KUYA_URL` | `http://127.0.0.1:4777/event` | Default adapter ingestion endpoint |
| `BAHAY_NI_KUYA_BASE_URL` | `http://127.0.0.1:4777` | Base origin for MCP tools |

---

## Non-Goals

- **No Remote Access or External Exposure**: Strictly bound to `127.0.0.1`. Requests from non-localhost origins or hosts are rejected with HTTP 403 Forbidden.
- **No Paid Assets**: All sprites, furniture, rooms, and effects are 100% original procedural pixel art Canvas 2D routines (CC0 / Public Domain). See [`assets/MANIFEST.md`](assets/MANIFEST.md).
- **No Copyrighted / Trademarked Assets**: Pure parody format. Zero official logos, trademarks, or protected audio.
- **No Next.js or Bundler Build Step**: Runs directly via Bun with native TypeScript transpilation on demand.
- **No Overwriting User Configurations**: Never overwrites user files or Orca configs; `~/.codex/hooks.json` is always merged, preserving existing hooks.

---

## Credits & Third-Party Art

- **Oddboro**: Core pixel art tiles and office props adapted from the open-source [Oddboro](https://github.com/New-Altitude/Oddboro) project by **New Altitude, Inc.**, licensed under the [Apache License 2.0](assets/third-party/oddboro/LICENSE). See [`NOTICE`](NOTICE) and [`docs/oddboro-license-audit.md`](docs/oddboro-license-audit.md).
- **House-Specific Art**: Bunk beds, confessional chair and spotlight, pool table, arcade cabinet, kitchen stove, treadmill, weights rack, TV console, and sectional sofa are original works authored for Bahay ni Kuya following Oddboro's art conventions and shared palette.
- **Zero Protected Audio or Trademarks**: Audio tracks and Oddboro brand trademarks are strictly excluded.

---

## License

This project is licensed under the [MIT License](LICENSE).
Third-party pixel art assets from Oddboro are licensed under [Apache License 2.0](assets/third-party/oddboro/LICENSE). Original house assets are dedicated to the public domain under [CC0 1.0 Universal](assets/MANIFEST.md).
