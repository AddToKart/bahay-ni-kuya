# Verified Harness Events & Payloads

Captured and verified against installed binaries on Windows 11 (2026-11-16).

---

## 1. Codex CLI (0.166.0)

Codex invokes command hooks declared in `~/.codex/hooks.json`. Payload is piped on `stdin` as JSON.

### Hook Event Registry
Verified in `codex.exe` (`hooks\src\registry.rs` and `hooks\src\events\*`):
- `SessionStart`: Session started
- `UserPromptSubmit`: Prompt submitted / turn start
- `PreToolUse`: Model about to execute a tool
- `PostToolUse`: Tool execution completed
- `PermissionRequest`: Model needs user permission / blocked
- `Stop`: Turn completed normally
- `Interrupt`: User interrupted / canceled turn
- `SubagentStart`: Child agent spawned
- `SubagentStop`: Child agent ended
- `SessionEnd`: Session closed

### Real Payloads

#### Prompt Submitted / Turn Start (`UserPromptSubmit`)
```json
{
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Fix styling issues in header",
  "transcript_path": "C:\\Users\\Cayz\\.codex\\sessions\\2026-11-16_12-00-00_ses_991823.jsonl",
  "cwd": "D:\\code_ni_kurt\\pixel-office",
  "permission_mode": "workspace-write",
  "agent_transcript_path": null,
  "stop_hook_active": false,
  "last_assistant_message": null,
  "tool_name": null,
  "tool_input": null
}
```

#### Tool Call (`PreToolUse` / `PostToolUse`)
```json
{
  "hook_event_name": "PreToolUse",
  "prompt": null,
  "transcript_path": "C:\\Users\\Cayz\\.codex\\sessions\\2026-11-16_12-00-00_ses_991823.jsonl",
  "cwd": "D:\\code_ni_kurt\\pixel-office",
  "permission_mode": "workspace-write",
  "agent_transcript_path": null,
  "stop_hook_active": false,
  "last_assistant_message": "Let me read the file.",
  "tool_name": "read_file",
  "tool_input": {
    "path": "D:\\code_ni_kurt\\pixel-office\\public\\main.ts"
  }
}
```

#### Permission Asked (`PermissionRequest`)
```json
{
  "hook_event_name": "PermissionRequest",
  "prompt": null,
  "transcript_path": "C:\\Users\\Cayz\\.codex\\sessions\\2026-11-16_12-00-00_ses_991823.jsonl",
  "cwd": "D:\\code_ni_kurt\\pixel-office",
  "permission_mode": "workspace-write",
  "agent_transcript_path": null,
  "stop_hook_active": false,
  "last_assistant_message": "I need permission to run this command.",
  "tool_name": "execute_command",
  "tool_input": {
    "command": "git push origin master"
  }
}
```

#### Subagent Start / End (`SubagentStart` / `SubagentStop`)
```json
{
  "hook_event_name": "SubagentStart",
  "prompt": null,
  "transcript_path": "C:\\Users\\Cayz\\.codex\\sessions\\2026-11-16_12-00-00_ses_991823.jsonl",
  "cwd": "D:\\code_ni_kurt\\pixel-office",
  "permission_mode": "workspace-write",
  "agent_transcript_path": "C:\\Users\\Cayz\\.codex\\sessions\\subagents\\sub_7721a_review.jsonl",
  "stop_hook_active": false,
  "last_assistant_message": "Delegating lint audit to reviewer subagent",
  "tool_name": null,
  "tool_input": null
}
```

---

## 2. OMP (18.20.2) & Pi (0.83.0)

Both share the Pi Extension API (`export default function(pi) { pi.on(...); pi.events.on(...); }`).

### Event Names
- `session_start`: New session created
- `before_agent_start`: Prompt submitted (`event.prompt`, `event.agent`)
- `agent_start`: Model turn begins
- `tool_execution_start`: Tool invoked (`event.toolName`, `event.toolArgs`)
- `tool_approval_requested`: Permission requested / blocked
- `tool_approval_resolved`: Permission granted / rejected
- `tool_execution_end`: Tool completed
- `agent_end`: Turn ended (`event.error`, `event.status`)
- `agent_settled`: Agent finished all queued actions
- `session_shutdown`: Session terminated
- `task:subagent:lifecycle`: Subagent event bus (`event.status`: `"started"` | `"completed"` | `"failed"` | `"aborted"`)

### Real Payloads

#### Prompt Submitted (`before_agent_start`)
```json
{
  "prompt": "Check unit test coverage",
  "agent": "code-assistant",
  "sessionId": "omp_session_e92bf1",
  "cwd": "D:\\code_ni_kurt\\pixel-office"
}
```

#### Permission Asked (`tool_approval_requested`)
```json
{
  "toolName": "bash",
  "toolArgs": {
    "command": "rm -rf dist"
  },
  "reason": "Destructive command execution requires user confirmation"
}
```

#### Subagent Lifecycle (`task:subagent:lifecycle`)
```json
{
  "id": "sub_run_4410",
  "parentWorkflowRunId": "omp_session_e92bf1",
  "agent": "code-auditor",
  "status": "started",
  "description": "Running security audit on dependencies"
}
```

---

## 3. Hermes Agent (0.21.5)

Configured via `hooks.outbound` in `AppData\Local\hermes\config.yaml`. Delivered via HTTP POST to `/event/hermes`.

### Outbound Webhook Events
- `on_session_start`: Session started
- `on_session_end`: Session closed
- `pre_llm_call` / `agent_start`: Turn starts (working)
- `post_llm_call` / `agent_end`: Turn completes (idle)
- `pre_tool_call` / `post_tool_call`: Tool invocation
- `subagent_start`: Subagent spawned
- `subagent_stop`: Subagent terminated

### Real Payload Shape
```json
{
  "hook_event_name": "pre_tool_call",
  "profile": "default",
  "tool_name": "bash",
  "tool_input": {
    "command": "bun test"
  },
  "session_id": "hermes_ses_88a9c",
  "cwd": "D:\\code_ni_kurt\\pixel-office",
  "extra": {
    "parent_session_id": null,
    "child_session_id": null,
    "child_role": null,
    "child_goal": null
  },
  "delivery_id": "del_18b209",
  "timestamp": 1794768938000
}
```

#### Subagent Start (`subagent_start`)
```json
{
  "hook_event_name": "subagent_start",
  "profile": "default",
  "tool_name": "delegate_task",
  "tool_input": null,
  "session_id": "hermes_ses_88a9c",
  "cwd": "D:\\code_ni_kurt\\pixel-office",
  "extra": {
    "parent_session_id": "hermes_ses_88a9c",
    "child_session_id": "hermes_sub_331b",
    "child_role": "reviewer",
    "child_goal": "audit pull request changes"
  },
  "delivery_id": "del_18b210",
  "timestamp": 1794768940000
}
```

---

## 4. OpenCode (1.18.35)

### Database Reader (`~/.local/share/opencode/opencode.db`)
- `session` table: `id`, `parent_id` (subagent link), `title`, `directory`, `time_updated`, `time_created`.
- `part` table: `session_id`, `data` (JSON with `type`: `tool`, `step-start`, `reasoning`, `text`, `state.status`).
- Limitation: Polled on 3s intervals; does not expose instantaneous permission request prompts.

### Plugin Adapter (`.opencode/plugins/bahay-opencode.js`)
Listens to OpenCode internal event stream:
- `session.created`: `session_start` (includes `parentID` for subagents)
- `session.execution.started`: `state: "working"`
- `session.execution.succeeded`: `state: "idle"`
- `session.execution.failed`: `type: "error"`
- `tool.execute.before`: `type: "tool"`, `tool: "<name>"`
- `permission.asked`: `state: "blocked"` (permission requested)
- `session.deleted`: `type: "session_end"`
