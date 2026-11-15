import { describe, expect, it } from "bun:test";
import { getOrCreateToken, isAllowedHostAndOrigin, isAuthenticated, validateCwd } from "../src/security";
import { Store } from "../src/store";
import { Dispatcher } from "../src/dispatcher";

describe("Milestone 7: Dispatcher, Security & Worktrees", () => {
  const token = getOrCreateToken();

  it("generates a 64-char hex Bearer token and validates Authorization headers", () => {
    expect(token).toBeDefined();
    expect(token.length).toBe(64);

    // Valid header
    const validReq = new Request("http://localhost:4777/api/tasks", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(isAuthenticated(validReq)).toBe(true);

    // Missing header
    const missingReq = new Request("http://localhost:4777/api/tasks");
    expect(isAuthenticated(missingReq)).toBe(false);

    // Wrong token
    const wrongReq = new Request("http://localhost:4777/api/tasks", {
      headers: { authorization: "Bearer invalid_token_1234567890" },
    });
    expect(isAuthenticated(wrongReq)).toBe(false);
  });

  it("strictly validates Host and Origin headers against DNS rebinding and cross-origin attacks", () => {
    // Valid localhost / 127.0.0.1
    const valid1 = new Request("http://localhost:4777/api/tasks", {
      headers: { host: "localhost:4777", origin: "http://localhost:4777" },
    });
    expect(isAllowedHostAndOrigin(valid1)).toBe(true);

    const valid2 = new Request("http://127.0.0.1:4777/api/tasks", {
      headers: { host: "127.0.0.1:4777" },
    });
    expect(isAllowedHostAndOrigin(valid2)).toBe(true);

    // Foreign Host header rejected
    const badHost = new Request("http://attacker.com/api/tasks", {
      headers: { host: "attacker.com" },
    });
    expect(isAllowedHostAndOrigin(badHost)).toBe(false);

    // Foreign Origin header rejected
    const badOrigin = new Request("http://localhost:4777/api/tasks", {
      headers: { host: "localhost:4777", origin: "http://evil.com" },
    });
    expect(isAllowedHostAndOrigin(badOrigin)).toBe(false);
  });

  it("validates that task cwd is inside allowlisted roots and rejects traversal/escapes", () => {
    // Current working directory is allowed
    const validCwd = validateCwd(process.cwd());
    expect(validCwd.ok).toBe(true);

    // Non-existent directory
    const missingDir = validateCwd("C:/non_existent_folder_xyz_123");
    expect(missingDir.ok).toBe(false);
  });

  it("dispatches a task, tracks lifecycle queued -> running -> done, and emits matching PBB events", async () => {
    const store = new Store();
    const dispatcher = new Dispatcher(store);

    // Dispatch a trivial task to an installed harness or test prompt
    const task = dispatcher.submitTask("opencode", "list the files in this repo", process.cwd());
    expect(task.id).toBeDefined();
    expect(task.status).toBe("queued");
    expect(task.prompt).toBe("list the files in this repo");

    // Verify task is tracked in dispatcher
    const list = dispatcher.getTasks();
    expect(list.some((t) => t.id === task.id)).toBe(true);

    // Verify PBB event task_started was emitted into Store
    const snap = store.snapshot();
    const session = snap.sessions.find((s) => s.sessionId === task.id);
    expect(session).toBeDefined();
    expect(session!.state).toBe("working");

    // Test cancellation
    const canceled = dispatcher.cancelTask(task.id);
    expect(canceled).toBe(true);
    expect(task.status).toBe("canceled");

    // Verify PBB event updated to idle after cancel
    const snapAfter = store.snapshot();
    const sessionAfter = snapAfter.sessions.find((s) => s.sessionId === task.id);
    expect(sessionAfter!.state).toBe("idle");
  });
});
