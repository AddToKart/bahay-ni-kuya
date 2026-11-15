# Verified Runners & MCP Capabilities

Verified against installed binaries on Windows 11 (2026-11-16).

---

## Summary Matrix

| Harness | Version | Headless Command | Headless Flags | MCP Client Support | Config Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **codex** | `0.166.0` | `codex exec "<prompt>"` | `--json`, `--cd <dir>`, `--worktree`, `-s workspace-write` | Native (`codex mcp`) | `~/.codex/config.toml` |
| **opencode** | `1.18.35` | `opencode run "<prompt>"` | `--format json`, `--dir <dir>`, `--pure` | Native (`opencode mcp`) | `~/.config/opencode/opencode.json` |
| **pi** | `0.83.0` | `pi -p "<prompt>"` | `--mode json`, `--no-tools`, `--tools <list>` | Extension / Bridge | `~/.pi/agent/settings.json` |
| **omp** | `18.20.2` | `omp -p "<prompt>"` | `--mode json`, `--cwd <dir>`, `--smol <model>` | Extension / Bridge | `~/.omp/agent/config.yml` |
| **hermes** | `0.21.5` | `hermes chat -q "<prompt>"` | `--worktree`, `--in <dir>`, `--safe-mode` | Native (`hermes mcp`) | `AppData\Local\hermes\config.yaml` |

---

## Detailed Specifications

### 1. Codex CLI (`codex`)
- **Executable**: `C:\nvm4w\nodejs\codex.cmd` (wraps `codex.exe`)
- **Headless invocation**:
  ```powershell
  codex exec "<prompt>" --json --cd "<workspace>" -s workspace-write
  ```
- **Git Worktree Support**: Native flag `--worktree` runs the turn inside a new managed git worktree.
- **MCP Client**: Native command `codex mcp list`, `codex mcp add`. MCP servers configured in `~/.codex/config.toml` under `[mcp_servers]`.

### 2. OpenCode (`opencode`)
- **Executable**: `C:\Users\Cayz\.bun\bin\opencode.exe`
- **Headless invocation**:
  ```powershell
  opencode run "<prompt>" --format json --dir "<workspace>"
  ```
- **Flags**:
  - `--format json`: Emits machine-readable event JSON stream to stdout.
  - `--dir <path>`: Working root.
  - `--auto`: Auto-approves permissions (disabled by default in Bahay ni Kuya safe mode).
- **MCP Client**: Native command `opencode mcp add <name>`, `opencode mcp list`. MCP servers registered in `opencode.json` under `"mcp"`.

### 3. Pi (`pi`)
- **Executable**: `C:\nvm4w\nodejs\pi.cmd`
- **Headless invocation**:
  ```powershell
  pi -p "<prompt>" --mode json
  ```
- **Flags**:
  - `-p, --print`: Non-interactive mode (processes prompt and exits).
  - `--mode json`: Structured output mode.
  - `--tools <list>`: Explicit tool allowlist.
- **MCP Client**: Via extension/bridge in `~/.pi/agent/extensions/`.

### 4. OMP (`omp`)
- **Executable**: `C:\Users\Cayz\.bun\bin\omp.exe`
- **Headless invocation**:
  ```powershell
  omp -p "<prompt>" --mode json --cwd "<workspace>"
  ```
- **Flags**:
  - `-p, --print`: Non-interactive mode.
  - `--mode json`: Machine-readable output.
  - `--cwd <path>`: Working directory.
- **MCP Client**: Managed through extensions in `~/.omp/agent/extensions/`.

### 5. Hermes Agent (`hermes`)
- **Executable**: `C:\Users\Cayz\AppData\Local\hermes\bin\hermes.cmd`
- **Headless invocation**:
  ```powershell
  hermes chat -q "<prompt>" --in "<workspace>"
  ```
  or:
  ```powershell
  hermes -z "<prompt>" --in "<workspace>"
  ```
- **Git Worktree Support**: Built-in `--worktree` (`-w`) creates an isolated git worktree branch.
- **MCP Client**: Native command `hermes mcp add/list/remove`. MCP servers configured in `AppData\Local\hermes\config.yaml` under `mcp_servers:`.
