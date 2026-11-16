# Bahay ni Kuya — implementation contract

Three slices depend on this file: server (`src/`), frontend (`public/`), adapters (`adapters/`,
`scripts/`). Do not change a contract without updating this file and the other slices.

## Server

- Bun, no runtime deps. Entry: `bun run src/server.ts`.
- Port: `BAHAY_NI_KUYA_PORT` env, default `4777`. Bind host `BAHAY_NI_KUYA_HOST`, default `127.0.0.1`.
- Routes:
  - `POST /event` — ingest one event. Body ≤64 KiB. `204` on success, `400` `{ok:false,error}`.
  - `POST /event/hermes` — Hermes outbound-webhook payloads (`hook_event_name`, `tool_name`,
    `session_id`, `cwd`, `extra`, `profile`, `timestamp`). Server maps to the contract and
    always answers `204` (unknown events ignored — hooks are fire-and-forget). Mapping:
    `on_session_start`→start idle, `on_session_end`→end, `pre_llm_call`/`agent_start`→working,
    `post_llm_call`/`agent_end`→idle, `pre_tool_call`/`post_tool_call`→tool+working,
    `subagent_start`→parent working + child start (`extra.child_session_id`/`subagent_id`,
    parent `extra.parent_session_id`), `subagent_stop`→child end.
  - `GET /healthz` — `{ok:true,port}`.
  - `GET /state` — current snapshot JSON (same shape as WS payload).
  - `GET /debug` — snapshot + last 80 log lines.
  - `GET /ws` — WebSocket upgrade.
  - `GET /` and static files from `public/`. When `X.js` is requested and `public/X.ts`
    exists, transpile TS → JS on demand (Bun.Transpiler), `no-store`.
  - `/favicon.ico` → 204.

## Event (adapter → server)

```jsonc
{
  "harness": "opencode",        // opencode | codex | pi | omp | hermes
  "sessionId": "ses_abc",       // harness-scoped; server namespaces by harness
  "parentSessionId": null,      // child session id → subagent; null/omitted for root
  "type": "session_start",      // session_start | session_end | state | tool | error |
                                // task_started | task_completed | blocked | subagent_started | subagent_ended
                                // v2 (Phase 2): housemate_summoned | housemate_arrived |
                                // housemate_evict_started | housemate_evicted | question_asked |
                                // question_answered | kuya_call | kuya_call_ended | chat_message |
                                // guest_arrived | guest_left
  "state": "working",           // working | idle | blocked | error (honoured on session_start/state/task_*)
  "title": "fix lint errors",   // optional, clipped 80 chars
  "tool": "edit",               // optional, clipped 60 chars (type=tool keeps working)
  "directory": "D:/repo",       // optional, clipped 200 chars
  "reason": "permission",       // optional reason for blocked/error
  "ts": 1731739200000           // optional; server clock is authoritative
}
```

Semantics:
- `session_start` creates the session. `parentSessionId` marks a subagent.
- `task_started` marks task begun, calls housemate to Office, sets state Working.
- `task_completed` marks task finished, sets state Idle, returns housemate to house life.
- `blocked` marks session waiting on user permission/confirmation; character walks to Confession Room.
- `error` marks tool/turn failure; facepalm emote, increments error count (3 errors = nominated).
- `subagent_started` creates a subagent tethered to parentSessionId, takes subagent desk.
- `subagent_ended` closes subagent session; character poofs away.
- `state:working` keeps the session Working for 4 s; `state:idle` ends it immediately.
- `type:"tool"` sets `tool` and keeps Working for 4 s.
- `type:"session_end"` deletes the session and all its descendants.
- Any accepted event marks the harness running immediately (before the next scan).

Adapters are fire-and-forget: 1500 ms timeout, every failure swallowed, `BAHAY_NI_KUYA_URL`
env override (default `http://127.0.0.1:4777/event`). No adapter may throw into its harness.

## v2 events (Phase 2, additive)

All v1 fields keep their meaning. v2 events may omit `sessionId` when they carry
`housemateKey`, `guestKey` or a question `id`; the server resolves the session key from them.
v1 consumers ignore unknown types and render unknown states as idle.

| type | Payload | Meaning |
| --- | --- | --- |
| `housemate_summoned` | `housemateKey`, `name?`, `harness` | arrival walk-in begins (state `arriving`) |
| `housemate_arrived` | `housemateKey` | walk-in complete (state `idle`) |
| `housemate_evict_started` | `housemateKey`, `reason?` | suitcase walk-out begins (state `evicting`) |
| `housemate_evicted` | `housemateKey` | session deleted |
| `question_asked` | `id`, `kind: permission\|question\|choice\|text`, `text`, `options?` | Confession Room ask; queued or in the chair |
| `question_answered` | `id`, `option?` or `text?` | resolves the ask; promotes the next asker |
| `kuya_call` | `housemateKey` | call to Confession Room chat (state `called`) |
| `kuya_call_ended` | `housemateKey` | walk back (state `idle`) |
| `chat_message` | `role: housemate\|kuya`, `text` (≤400) | diary-panel chat line |
| `guest_arrived` | `guestKey`, `hostKey` | guest child session observed (state `working`, `parentId=hostKey`) |
| `guest_left` | `guestKey` | guest session deleted |

New states (additive): `arriving`, `evicting`, `queued_for_confession`, `in_confession`,
`called`. Held states persist until their paired end event (no 4 s decay).

## Snapshot (server → browser)

```jsonc
{
  "type": "snapshot",
  "ts": 1731739200000,
  "harnesses": [ { "name": "opencode", "installed": true, "running": false, "procs": 0 } ],
  "sessions": [ {
    "harness": "opencode", "sessionId": "ses_abc", "parentId": null,
    "state": "working",                 // idle | working | blocked | error (never "sleeping")
                                        // v2: arriving | evicting | queued_for_confession |
                                        //     in_confession | called
    "title": "…", "tool": "edit", "directory": "D:/repo", "pid": 1234,
    "since": 1731739100000, "lastEventTs": 1731739199000,
    "source": "adapter",                // adapter | scan
    "errorCount": 0,                    // incremented on error
    "nominated": false,                 // true when errorCount >= 3
    "housemateKey": "hm_bea",           // v2, optional
    "guest": false                      // v2, true for observed child sessions rendered as guests
  } ],
  "questions": [ {
    "id": "q_1794...01", "harness": "opencode", "sessionId": "ses_abc",
    "housemateKey": "hm_bea", "kind": "permission", "text": "Pwede po?",
    "askedAt": 1731739200000, "status": "in_confession" // queued | in_confession | answered
  } ],
  "chat": [ { "sessionId": "ses_abc", "role": "housemate", "text": "Okay po.", "ts": 1731739200000 } ]
}
```

Sent once on WS connect, then on every change (≤10/s, coalesced 60–100 ms), plus a 10 s
heartbeat. Browser reconnects every 2 s; `disconnected` banner while down.

Sleeping is a **frontend** derivation: a harness with `installed:true`, `running:false` and no
sessions gets one placeholder sleeping character (id `harness:<name>`). Running harnesses with
no adapter events get `source:"scan"` pseudo-sessions (one per PID) from the process scan.

## Scan

PowerShell every 5 s: `Get-CimInstance Win32_Process` → `ProcessId,ParentProcessId,Name,
CommandLine,KernelModeTime,UserModeTime` → JSON. Failure (non-zero exit, <20 processes, parse
error) keeps the previous state; never treat a failed scan as "everything stopped".
Installed check via `where.exe <bin>` at start and every 60 s.
CPU delta >400 ms per 5 s turns a scan pseudo-session Working (activity guess; adapters win
when present, pseudo-sessions are suppressed for any harness with adapter sessions).

## File ownership (subagents)

- Frontend agent: `public/**` only.
- Adapter agent: `adapters/**`, `scripts/**` only.
- Neither edits `src/**`, `package.json`, `CONTRACT.md`.

## Local dev ports for parallel testing

Server reads `BAHAY_NI_KUYA_PORT`. Frontend agent uses `4780`, adapter agent uses `4781`.
Never touch a server on another port; kill only your own PID.
