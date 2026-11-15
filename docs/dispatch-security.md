# Bahay ni Kuya — Dispatch Security & Threat Model

This document outlines the security architecture, threat model, and defense-in-depth mitigations for the headless task dispatcher and Kuya Console in Bahay ni Kuya.

---

## 1. Threat Model

Bahay ni Kuya is a local development visualizer and dispatcher that can invoke headless AI coding harnesses (`opencode`, `codex`, `pi`, `omp`, `hermes`) to execute shell commands and file modifications on the user's machine.

### Primary Threat Vectors:
1. **Malicious Web Sites & DNS Rebinding**:
   A user browsing the internet in Chrome/Edge visits an attacker-controlled website (`attacker.com`). Scripts on that page attempt to fetch `http://localhost:4777/api/tasks` or use DNS rebinding to execute arbitrary commands on the victim's machine.
2. **Local Network / Intranet Exposure**:
   Other devices on the same local area network (LAN / Wi-Fi) attempting to connect to the Bahay ni Kuya server port.
3. **Arbitrary Directory Escaping & Overwrites**:
   A task payload specifying a malicious `cwd` (e.g., `C:/Windows/System32` or sensitive root folders) to corrupt critical host files.
4. **Command Injection / Auto-Approval Exploits**:
   Harnesses running in unattended mode executing destructive commands without boundaries or reviews.

---

## 2. Security Controls & Mitigations

### 2.1 Loopback Host Binding
- The server binds strictly to `127.0.0.1` by default (`BAHAY_NI_KUYA_HOST`).
- It is never bound to `0.0.0.0`, ensuring external network interfaces on the LAN cannot access the server.

### 2.2 Cryptographic Bearer Token
- On initial startup, a cryptographically secure 32-byte (64-character hexadecimal) authentication token is generated using Node/Bun's `crypto.randomBytes(32)`.
- Stored on the local filesystem at:
  - Windows: `%USERPROFILE%\.bahay-ni-kuya\token`
  - POSIX: `~/.bahay-ni-kuya/token`
- File is saved with restricted read/write permissions (`0o600`).
- **Authorization Header**: All task dispatch and query endpoints (`/api/tasks*`) require:
  ```http
  Authorization: Bearer <token>
  ```
- **No Query String Leaks**: The token is never accepted or passed via URL query parameters, preventing leakages in access logs, browser history, or Referer headers.
- **Same-Origin Bootstrap**: The web client obtains the token via `GET /api/auth/token`, which is gated by strict same-origin Host and Origin verification.

### 2.3 Strict Host and Origin Header Validation
Every API endpoint validates incoming headers against unauthorized access:
```typescript
export function isAllowedHostAndOrigin(req: Request): boolean {
  const host = req.headers.get("host") || "";
  const origin = req.headers.get("origin");

  // Host header must match localhost or 127.0.0.1
  const hostPattern = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;
  if (!hostPattern.test(host)) return false;

  // If Origin header is present, origin hostname must be loopback
  if (origin) {
    const url = new URL(origin);
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return false;
  }
  return true;
}
```
Any request from a foreign Origin (such as a website executing cross-origin `fetch`) is immediately rejected with `403 Forbidden`.

### 2.4 Allowlisted Root Directories (`cwd` Sanitization)
- Tasks are restricted to allowlisted filesystem roots (e.g. current project folder, `%USERPROFILE%\code`, allowlisted development roots in `config/runners.json`).
- When a task specifies a `cwd`, the path is resolved via `realpathSync` to resolve symlinks and prevent path traversal (`../..`).
- Any attempt to target paths outside the allowlisted roots is rejected with `400 Bad Request`.

### 2.5 Isolated Git Worktrees
- Tasks submitted for git repositories run in a separate temporary worktree:
  - Branch name: `kuya/{harness}-{id}`
  - Worktree directory: `.kuya-worktrees/{id}`
- Isolates branch modifications from the user's primary working tree.
- Upon task termination, `git diff --stat` is captured for user inspection, and the worktree is cleanly pruned (`git worktree remove --force`).

### 2.6 Safe Runner Defaults
- Harness execution templates in `config/runners.json` do not include dangerous auto-approval or bypass flags (such as `--yolo` or `--dangerously-skip-permissions`).
- Any permission requests triggered by the harness correctly map to `blocked` status, summoning the character to the Confession Room for user review.
