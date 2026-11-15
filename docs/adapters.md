# Bahay ni Kuya adapters

Four harnesses get a small, fail-silent adapter that POSTs contract events to
`BAHAY_NI_KUYA_URL` (default `http://127.0.0.1:4777/event`). **opencode needs no installation**:
the server reads opencode's own SQLite database read-only (see below).

Rules that hold for all installed adapters:

- POST only, no GETs, no retries, no queues that survive the process.
- 1500 ms timeout on the request (`AbortSignal.timeout`; codex uses `-TimeoutSec 1`).
- Every handler body and every post is wrapped; the adapter never throws into the harness.
- A down Bahay ni Kuya means silent drops — nothing is buffered or replayed later.
- Session ids are stable for the life of the harness session.

Install everything with:

```powershell
bun run scripts/install-adapters.ts            # idempotent
bun run scripts/install-adapters.ts --dry-run  # plan only
bun run scripts/install-adapters.ts --uninstall
```

The installer backs up every file it edits or copies over to
`%USERPROFILE%/.bahay-ni-kuya/backups/<ISO timestamp>/` before touching it, and prints a
per-path summary. It does not start the server.

---

## opencode (1.18.35) — built-in DB watcher, no install

| | |
|---|---|
| Source | `src/opencode-db.ts` (server, read-only) |
| Installed files | none |
| Rollback | nothing to remove |
| Data | `~/.local/share/opencode/opencode.db`: `session`, `message`, `part` |
| Latency | 3 s poll; working while the DB was written in the last 6 s |

Why not a plugin: a probe against this exact build showed the V2 plugin `setup(ctx)` context
contains only `options, agent, aisdk, catalog, command, integration, plugin, reference, skill` —
there is **no `event` bus and no `session` handle** in `opencode run` or the TUI, so event
subscription is impossible from a plugin here. (Orca's own V2 path no-ops in the same context;
its `wt-agent-hooks` plugin logs a load failure on this build.) A plugin was tested and removed.

The server reads the active opencode process's database with a read-only `bun:sqlite`
connection: sessions (id, `parent_id`, title, directory, `time_updated`), recent parts
(`step-*`, `text`, `reasoning`, `tool`) and messages. Mapping:

| opencode DB fact | Bahay ni Kuya event |
|---|---|
| session row updated since the current opencode process started | `session_start` with title/directory, `parent_id` → `parentSessionId` |
| session/part written within 6 s | `state:"working"` |
| otherwise | `state:"idle"` |
| newest `part.data.type="tool"` with `data.tool` and `state.status` running/completed | `type:"tool"`, `tool:"<name>"` |
| opencode process gone (scan) | all opencode sessions swept |

Safety: the connection is read-only, queries are time-bounded and indexed by `session_id`,
every error is swallowed and retried on the next tick, and the DB is never written to.
Subagents are child sessions (`parent_id`) and appear exactly like event-driven subagents.

---

## codex-cli (0.166.0) — VERIFIED

| | |
|---|---|
| Sources | `adapters/codex/bahay-codex.ps1`, `adapters/codex/bahay-codex.cmd` |
| Installed to | `C:/Users/Cayz/.bahay-ni-kuya/adapters/codex/` |
| Configured in | `C:/Users/Cayz/.codex/hooks.json` (JSON merge, Orca entries preserved) |
| Wire | hook JSON on stdin, PowerShell reads `[Console]::In.ReadToEnd()` |

Accepted hook keys were confirmed in `codex.exe` (`hooks\src\registry.rs` and the
`hooks\src\events\*` serializers): `PreToolUse`, `PermissionRequest`, `PostToolUse`,
`PreCompact`, `PostCompact`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`,
`SubagentStop`, `Stop`, `Interrupt`.

The installer adds entries for:
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`,
`SubagentStart`, `SubagentStop`, `SessionEnd`, `Interrupt`.

Omitted on purpose:

- `Notification` — **not** a hook key in this build (the string exists in the binary only as an
  unrelated platform symbol).
- `PreCompact` / `PostCompact` — valid, but no extra state is needed.

Hook payload fields observed in the binary: `transcript_path`, `cwd`, `hook_event_name`,
`permission_mode`, `agent_transcript_path`, `stop_hook_active`, `last_assistant_message`,
`prompt`, `tool_name`, `tool_input`. There is **no `session_id`**, so the adapter derives stable
ids from the transcript file name (`transcript_path` stem); `SubagentStart`/`SubagentStop` use
the `agent_transcript_path` stem as the child id with the parent transcript stem as
`parentSessionId`.

| codex hook | Bahay ni Kuya event |
|---|---|
| `SessionStart` | `session_start`, `state:"idle"`, `directory: cwd` |
| `UserPromptSubmit` | `state:"working"`, `title: prompt` |
| `PreToolUse` / `PostToolUse` / `PermissionRequest` | `type:"tool"`, `tool: tool_name` (permissions not modelled) |
| `Stop` / `Interrupt` | `state:"idle"` |
| `SessionEnd` | `session_end` |
| `SubagentStart` | child `session_start` (working) with `parentSessionId` |
| `SubagentStop` | child `session_end` |

`hooks.json` entries look like:

```json
"PreToolUse": [
  { "hooks": [ { "type": "command", "command": "C:/Users/Cayz/.bahay-ni-kuya/adapters/codex/bahay-codex.cmd", "timeout": 10 } ] }
]
```

Existing Orca entries (same event or other events) are preserved semantically — the file is
re-serialized with `JSON.stringify(config, null, 2)`, so key order, spacing and trailing-newline
formatting may change even though no Orca hook is added, removed or rewritten. A second install
run adds nothing. Uninstall removes only hook objects whose command contains
`bahay-codex`; Orca's own entries in the same event arrays stay untouched. Uninstall also
re-serializes, so formatting changes apply there too.

---

## omp (18.20.2) — VERIFIED

| | |
|---|---|
| Source | `adapters/omp/bahay-omp.ts` |
| Installed to | `C:/Users/Cayz/.omp/agent/extensions/bahay-omp.ts` |
| Registration | `export default function (pi) { pi.on(...) }` (auto-loaded extension, zero imports) |

Registration, event names and the subagent bus were read from the Orca extension already
installed at `C:/Users/Cayz/.omp/agent/extensions/orca-agent-status.ts`:

| pi event | Bahay ni Kuya event |
|---|---|
| `session_start` (`ctx.sessionManager.getSessionId()`) | `session_start`, `state:"idle"`, `directory: process.cwd()` |
| `before_agent_start` (`event.prompt`) | `state:"working"`, `title: prompt` |
| `tool_execution_start` (`event.toolName`) | `type:"tool"` |
| `agent_end` / `agent_settled` | `state:"idle"` |
| `session_switch` / `session_branch` | old session `session_end`, new `session_start` |
| `session_shutdown` | `session_end` |

Subagents: the extension API exposes the event bus as `pi.events`; the adapter listens to
`task:subagent:lifecycle`, `subagent:async-started` and `subagent:async-complete`. Lifecycle
payload fields observed: `id` (or `runId`), `status` (`started`, `completed`, `failed`,
`aborted`), `agent`, `description`, `parentWorkflowRunId`. Child ids are posted as
`<root>/sub/<runId>` with `parentSessionId: <root>`.

Child sessions (`ctx.agentKind === "sub"`) never post themselves; they are represented by the bus
events so the tree cannot double-count.

---

## pi (0.83.0) — VERIFIED

Same extension API and event names as omp (pi ships the type package
`@earendil-works/pi-coding-agent`; the adapter uses zero imports so it cannot break when types
move).

| | |
|---|---|
| Source | `adapters/pi/bahay-pi.ts` |
| Installed to | `C:/Users/Cayz/.pi/agent/extensions/bahay-pi.ts` |
| Wire harness field | `"pi"` |

Mapping is identical to omp. `tool_execution_start`, `agent_end`, `agent_settled`,
`session_switch`, `session_branch`, `session_shutdown` and the `pi.events` subagent bus are all
present in the pi 0.83.0 extension API (`dist/core/extensions/types.d.ts`).

---

## hermes (0.21.5) — VERIFIED (native Windows)

| | |
|---|---|
| Source | `adapters/hermes/hooks-fragment.yaml` |
| Installed to | `C:/Users/Cayz/AppData/Local/hermes/config.yaml` (marker block) |
| Wire | `hooks.outbound` webhooks — direct HTTP POST, no shell hook, no extra script |

Schema verified in `hermes-agent/agent/outbound_webhooks.py`; event names verified in
`hermes-agent/hermes_cli/plugins.py` (`VALID_HOOKS`):

```yaml
hooks:
  outbound:
    - name: bahay-ni-kuya
      url: http://127.0.0.1:4777/event/hermes
      events: [on_session_start, on_session_end, pre_llm_call, post_llm_call,
               pre_tool_call, post_tool_call, subagent_start, subagent_stop]
      timeout: 2
```

Each entry accepts `url` (required), `events` (required list), `name`, `matcher` (only honoured
for `pre_tool_call`/`post_tool_call`), `timeout` (clamped 1–60), and optional
`secret`/`secret_env` (HMAC-SHA256 header). Delivery is fire-and-forget through a bounded queue
(256) with one daemon worker; a dead endpoint can never block a tool call. `HERMES_SAFE_MODE=1`
disables outbound webhooks entirely.

Mapping applied by the server (`src/server.ts` `mapHermesPayload`): `on_session_start` → idle
start, `pre_llm_call` → working, `pre_tool_call`/`post_tool_call` → tool (working), `subagent_start`
→ child working with `parentSessionId`, `subagent_stop` → child end, `on_session_end` → end.
`post_llm_call` maps to `state:"idle"`, so a finished turn flips idle immediately.

Hermes POSTs its own payload shape
`{ hook_event_name, profile, tool_name, tool_input, session_id, cwd, extra, delivery_id, timestamp }`
to `/event/hermes`, where the Bahay ni Kuya server maps it onto the contract. Parent/child ids
arrive inside `extra` (`parent_session_id`, `child_session_id`, `child_role`, `child_goal`,
`child_status`).

**Approval:** outbound webhooks do *not* use the shell-hook consent allowlist, so no
`hermes --accept-hooks` is needed for this block. The marker block is the only thing Bahay ni Kuya
writes; `--uninstall` removes exactly that block.

---

## Demo

```powershell
bun run src/server.ts                                  # terminal 1
bun run scripts/fake-events.ts                         # ~18 s scripted pass
bun run scripts/fake-events.ts --loop                  # repeat forever
BAHAY_NI_KUYA_URL=http://127.0.0.1:4781/event bun run scripts/fake-events.ts
```

The script exits 1 with a clear message if `/healthz` does not answer within 3 seconds. It posts a
full cast: one working opencode root with tools, one idle codex root, and a hermes root with two
working subagents that later go idle and end.

## Manual smoke test

```powershell
curl.exe -s -X POST http://127.0.0.1:4777/event -H "content-type: application/json" `
  -d '{\"harness\":\"codex\",\"sessionId\":\"smoke\",\"type\":\"state\",\"state\":\"working\",\"tool\":\"edit\"}'
curl.exe -s http://127.0.0.1:4777/state
```

## Troubleshooting

- **Nothing appears:** confirm `curl.exe -s http://127.0.0.1:4777/healthz` returns `{"ok":true,...}`;
  harnesses that start before the server are still fine (they drop the first events).
- **Wrong endpoint:** set `BAHAY_NI_KUYA_URL` in the environment the harness itself starts with.
  Hermes needs the `/event/hermes` URL and is configured at install time.
- **Codex hooks not firing:** check `codex --version` is 0.166.x and that
  `~/.codex/hooks.json` still contains the `bahay-codex` command entries (Orca rewrites
  this file occasionally; re-run the installer to merge them again).
- **Hermes conflicts:** if your `config.yaml` already has a non-empty `hooks:` block, the
  installer skips the hermes step and prints why. Merge the `outbound` entry from
  `adapters/hermes/hooks-fragment.yaml` by hand.
