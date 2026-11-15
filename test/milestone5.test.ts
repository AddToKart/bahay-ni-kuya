import { describe, expect, it } from "bun:test";
import { Store } from "../src/store";
import type { IngestEvent, Snapshot } from "../src/types";

describe("Milestone 5: Task Flow & Wire Protocol Extension", () => {
  it("ingests extended task lifecycle events: task_started, tool, blocked, error, nominated, subagents, and task_completed", () => {
    const store = new Store();
    const now = 100000;

    // 1. Task started: housemate called to office, state becomes working
    const startRes = store.ingest(
      {
        harness: "opencode",
        sessionId: "ses_task_1",
        type: "task_started",
        title: "Implement visual features",
        directory: "D:/repo",
      },
      now,
    );
    expect(startRes.ok).toBe(true);

    let snap = store.snapshot(now);
    let session = snap.sessions.find((s) => s.sessionId === "ses_task_1");
    expect(session).toBeDefined();
    expect(session!.state).toBe("working");
    expect(session!.title).toBe("Implement visual features");

    // 2. Tool call: keeps working and sets tool name
    store.ingest(
      {
        harness: "opencode",
        sessionId: "ses_task_1",
        type: "tool",
        tool: "read_file",
      },
      now + 500,
    );
    snap = store.snapshot(now + 500);
    session = snap.sessions.find((s) => s.sessionId === "ses_task_1");
    expect(session!.tool).toBe("read_file");
    expect(session!.state).toBe("working");

    // 3. Subagent started: spawns child session with parentSessionId
    const subRes = store.ingest(
      {
        harness: "opencode",
        sessionId: "sub_task_1_lint",
        parentSessionId: "ses_task_1",
        type: "subagent_started",
        title: "Lint auditor",
      },
      now + 1000,
    );
    expect(subRes.ok).toBe(true);

    snap = store.snapshot(now + 1000);
    const subSession = snap.sessions.find((s) => s.sessionId === "sub_task_1_lint");
    expect(subSession).toBeDefined();
    expect(subSession!.parentId).toBe("ses_task_1");
    expect(subSession!.state).toBe("working");

    // 4. Blocked state: permission required, walks to Confession Room
    store.ingest(
      {
        harness: "opencode",
        sessionId: "ses_task_1",
        type: "blocked",
        reason: "permission_required",
      },
      now + 2000,
    );
    snap = store.snapshot(now + 2000);
    session = snap.sessions.find((s) => s.sessionId === "ses_task_1");
    expect(session!.state).toBe("blocked");

    // 5. Error state and nominated marker: repeated errors trigger nomination
    store.ingest({ harness: "opencode", sessionId: "ses_task_1", type: "error" }, now + 3000);
    store.ingest({ harness: "opencode", sessionId: "ses_task_1", type: "error" }, now + 3100);
    store.ingest({ harness: "opencode", sessionId: "ses_task_1", type: "error" }, now + 3200);

    snap = store.snapshot(now + 3200);
    session = snap.sessions.find((s) => s.sessionId === "ses_task_1");
    expect(session!.state).toBe("error");
    expect(session!.errorCount).toBe(3);
    expect(session!.nominated).toBe(true);

    // 6. Subagent ended: child session deleted
    store.ingest(
      {
        harness: "opencode",
        sessionId: "sub_task_1_lint",
        type: "subagent_ended",
      },
      now + 4000,
    );
    snap = store.snapshot(now + 4000);
    expect(snap.sessions.find((s) => s.sessionId === "sub_task_1_lint")).toBeUndefined();

    // 7. Task completed: resumes idle house life
    store.ingest(
      {
        harness: "opencode",
        sessionId: "ses_task_1",
        type: "task_completed",
      },
      now + 5000,
    );
    snap = store.snapshot(now + 5000);
    session = snap.sessions.find((s) => s.sessionId === "ses_task_1");
    expect(session!.state).toBe("idle");
    expect(session!.tool).toBeUndefined();
  });
});
