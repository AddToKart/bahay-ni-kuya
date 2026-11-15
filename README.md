# Bahay ni Kuya

A local visualizer for every AI coding harness on this PC: characters sleep in the Bedroom,
hang out in the Living Room, and work at desks in the Office. Subagents appear as smaller
characters tethered to their parent.

Open **http://localhost:4777** (Bun server, no build step).

> Le **BAHAY NI KUYA** — every harness lives under one roof. 🏡

| Harness state | Where | Notes |
| --- | --- | --- |
| Not running | 🛏️ Bedroom (sleeping) | `where.exe` can't find it on PATH |
| Running, idle or waiting | 🛋️ Living Room (chilling) | process alive, no recent activity |
| Thinking / calling tools | 💼 Office (at a desk) | visible tool bubble when known |

Harnesses: **opencode**, **codex**, **pi**, **omp** (oh-my-pi), **hermes**.

## Quick start

```powershell
bun run start            # http://localhost:4777
bun run install-adapters # optional: real events per harness (backed up, reversible)
bun run fake             # scripted demo without touching harnesses
```

Requires Bun (installed) and Windows PowerShell for process scanning. No npm dependencies.

## How it works

Two detection layers, both server-side:

1. **Process scan** every 5 s via `Get-CimInstance Win32_Process`, matched per harness by
   executable/command line. Installed check via `where.exe` at start + every 60 s.
   Gives sleeping/running and per-PID pseudo sessions, plus a CPU-delta "busy" guess.
2. **Adapters** (optional, one per harness) POST real lifecycle/tool events to
   `POST /event`. Adapter evidence always wins over the CPU guess; harnesses with adapter
   sessions stop showing scan pseudo-sessions.

The server owns the state machine; adapters only report. Working decays to idle 4 s after
the last working event; process death clears that harness's sessions immediately; stale
sessions are swept. Browser gets full snapshots over `/ws` (2 s reconnect) and an initial
`/state` fetch.

## Adapters

```powershell
bun run install-adapters            # installs/merges codex, omp, pi, hermes (backups first)
bun run install-adapters --uninstall
```

opencode needs no adapter: the server reads opencode's own SQLite database read-only
(`src/opencode-db.ts`). Per-harness install locations, verified event mappings, and rollback
steps: [`docs/adapters.md`](docs/adapters.md).

Hard rule: every adapter is fail-silent. 1500 ms timeout, try/catch around everything, no
retries, no writes outside the event POST. If the server is down the harness behaves
exactly as before. Installed files can be deleted or uninstalled in one command.

Notes:
- Codex hook entries are **merged** into the existing Orca-managed `~/.codex/hooks.json`;
  Orca's entries are preserved.
- Hermes outbound hooks may prompt for approval on first launch (`hermes --accept-hooks`).
- Harnesses load adapters at startup: restart them after installing.
- The installer copies backups to `%USERPROFILE%\.bahay-ni-kuya\backups\<timestamp>\`.

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `BAHAY_NI_KUYA_PORT` | `4777` | server port |
| `BAHAY_NI_KUYA_HOST` | `127.0.0.1` | bind host |
| `BAHAY_NI_KUYA_URL` | `http://127.0.0.1:4777/event` | adapter target |

If the port is taken the server exits with the owning PID and suggests a free port.

## Development

```
src/        server, store/state machine, process scan
public/     canvas scene (TS transpiled on request — no bundler)
adapters/   one adapter per harness
scripts/    fake-events demo, adapter installer
plan/       approved implementation plan
CONTRACT.md wire protocol + file ownership
DESIGN.md   visual contract
```

```powershell
bun run dev     # --watch server
bun run fake    # demo events
```

Verification checklist lives in `plan/bahay-ni-kuya-plan.md` under each milestone.

## Troubleshooting

- **Nothing moves, all sleeping** — the scan may be failing; check server output. A failed
  PowerShell scan keeps the previous state, never marks everything stopped.
- **A harness never appears** — `where.exe <binary>` must find it; adapters are optional.
- **Port 4777 busy** — stop the reported PID or `BAHAY_NI_KUYA_PORT=4780 bun run start`.
- **Adapter doesn't fire** — restart the harness; check the harness's own logs/plugin
  approval; uninstall and rely on the scan layer.

## Non-goals

No auth or remote access, no persistence/history replay, no paid assets, no Claude Code,
not an Orca plugin.
