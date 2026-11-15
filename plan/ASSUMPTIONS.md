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
