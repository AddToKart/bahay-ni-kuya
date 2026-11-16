import { describe, expect, it } from "bun:test";
import { Store } from "../src/store";
import { Housemates } from "../src/housemates";
import { CollabManager } from "../src/collab";

describe("Lingguhang Hamon — Multi-Housemate Collaboration Flow", () => {
  it("orchestrates a full collaboration workflow: coder work, tester verification, and victory", async () => {
    const store = new Store();
    let promptAsyncCalls: Array<{ sessionId: string; message: string }> = [];

    const fakeClient = {
      createSession: async (input: any) => ({
        id: `mock_session_${input.title}`,
        cost: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
      }),
      streamEvents: () => {},
      abort: async () => true,
      promptAsync: async (sid: string, _dir: string, input: any) => {
        promptAsyncCalls.push({ sessionId: sid, message: input.message });
      },
      messages: async () => [],
    };

    const fakeSupervisor = {
      ensure: async () => fakeClient as any,
      stop: async () => {},
      client: fakeClient as any,
    };

    const housemates = new Housemates(store, fakeSupervisor as any);

    // Summon 2 housemates: Hans (Developer) and Bea (Tester)
    const hm1 = await housemates.summon({
      name: "Hans",
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-4" },
      projectRoot: process.cwd(),
      useWorktree: false,
    });

    const hm2 = await housemates.summon({
      name: "Bea",
      agent: "tester",
      model: { providerID: "openai", modelID: "gpt-4" },
      projectRoot: process.cwd(),
      useWorktree: false,
    });

    const collab = new CollabManager(store, housemates, fakeSupervisor as any);

    // 1. Launch Lingguhang Hamon with their actual OpenCode agents
    const task = await collab.startTask({
      goal: "Build authentication endpoints and unit tests",
      members: [
        { key: hm1.housemate.key },
        { key: hm2.housemate.key },
      ],
      maxAttempts: 3,
    });

    expect(task.status).toBe("running");
    expect(task.members.length).toBe(2);
    expect(task.members[0].agent).toBe("build");
    expect(task.members[1].agent).toBe("tester");
    expect(task.members[1].isVerifier).toBe(true);
    expect(task.attempt).toBe(1);

    // Hans (build agent) is working, Bea (tester agent) is on standby at her desk
    expect(housemates.get(hm1.housemate.key)?.state).toBe("working");
    expect(housemates.get(hm2.housemate.key)?.state).toBe("standby");

    const snap1 = store.snapshot(Date.now());
    expect(snap1.sessions.find((s) => s.housemateKey === hm1.housemate.key)?.state).toBe("working");
    expect(snap1.sessions.find((s) => s.housemateKey === hm2.housemate.key)?.state).toBe("standby");

    // Hans received the first implementation prompt
    expect(promptAsyncCalls.length).toBe(1);
    expect(promptAsyncCalls[0].message).toContain("Build authentication endpoints");
    expect(promptAsyncCalls[0].message).toContain("Hans");

    // 2. Hans finishes his turn with a handoff report
    const hansHandoff = "Created src/auth.ts with /api/login and /api/register endpoints.";
    const handled1 = await collab.handleSessionIdle(hm1.housemate.sessionId, hansHandoff);
    expect(handled1).toBe(true);

    // Hans transitions to standby, Bea transitions to working (testing)
    expect(housemates.get(hm1.housemate.key)?.state).toBe("standby");
    expect(housemates.get(hm2.housemate.key)?.state).toBe("working");
    expect(task.currentStep).toBe("verifying");

    // Bea received the verification prompt with Hans's handoff report
    expect(promptAsyncCalls.length).toBe(2);
    expect(promptAsyncCalls[1].message).toContain("VERIFICATION STEP");
    expect(promptAsyncCalls[1].message).toContain(hansHandoff);

    // 3. Bea finishes verification and reports SUCCESS
    const beaReport = "VERIFICATION_PASSED: Ran bun test test/auth.test.ts, 5 tests passed with 0 errors.";
    const handled2 = await collab.handleSessionIdle(hm2.housemate.sessionId, beaReport);
    expect(handled2).toBe(true);

    // Task is done! Both housemates return to idle
    expect(task.status).toBe("done");
    expect(collab.getActiveTask()).toBeNull();
    expect(housemates.get(hm1.housemate.key)?.state).toBe("idle");
    expect(housemates.get(hm2.housemate.key)?.state).toBe("idle");

    const snapFinal = store.snapshot(Date.now());
    expect(snapFinal.sessions.find((s) => s.housemateKey === hm1.housemate.key)?.state).toBe("idle");
    expect(snapFinal.sessions.find((s) => s.housemateKey === hm2.housemate.key)?.state).toBe("idle");

    await housemates.stop();
  });

  it("handles the self-healing retry loop when a tester finds bugs, and trips the Kuya circuit breaker if max attempts exceeded", async () => {
    const store = new Store();
    let promptAsyncCalls: Array<{ sessionId: string; message: string }> = [];

    const fakeClient = {
      createSession: async (input: any) => ({
        id: `mock_session_${input.title}`,
        cost: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
      }),
      streamEvents: () => {},
      abort: async () => true,
      promptAsync: async (sid: string, _dir: string, input: any) => {
        promptAsyncCalls.push({ sessionId: sid, message: input.message });
      },
      messages: async () => [],
    };

    const fakeSupervisor = {
      ensure: async () => fakeClient as any,
      stop: async () => {},
      client: fakeClient as any,
    };

    const housemates = new Housemates(store, fakeSupervisor as any);

    const hm1 = await housemates.summon({
      name: "Hans",
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-4" },
      projectRoot: process.cwd(),
      useWorktree: false,
    });

    const hm2 = await housemates.summon({
      name: "Bea",
      agent: "tester",
      model: { providerID: "openai", modelID: "gpt-4" },
      projectRoot: process.cwd(),
      useWorktree: false,
    });

    const collab = new CollabManager(store, housemates, fakeSupervisor as any);

    // Max 2 attempts
    const task = await collab.startTask({
      goal: "Implement tricky feature",
      members: [
        { key: hm1.housemate.key },
        { key: hm2.housemate.key },
      ],
      maxAttempts: 2,
    });

    // 1. Hans finishes coder turn
    await collab.handleSessionIdle(hm1.housemate.sessionId, "Implemented draft feature in index.ts");

    // 2. Bea reports a test failure (Attempt 1 fails)
    const bugReport1 = "VERIFICATION_FAILED: TypeError: Cannot read property 'id' at test.ts:12";
    await collab.handleSessionIdle(hm2.housemate.sessionId, bugReport1);

    // Self-healing loop: Hans wakes up to fix bugs, attempt becomes 2
    expect(task.attempt).toBe(2);
    expect(task.currentStep).toBe("building");
    expect(housemates.get(hm1.housemate.key)?.state).toBe("working");
    expect(housemates.get(hm2.housemate.key)?.state).toBe("standby");

    // Hans finishes bugfix turn
    await collab.handleSessionIdle(hm1.housemate.sessionId, "Attempted fix for null check");

    // 3. Bea tests again and reports failure again (Attempt 2 fails -> maxAttempts exceeded!)
    const bugReport2 = "VERIFICATION_FAILED: Still failing on line 12";
    await collab.handleSessionIdle(hm2.housemate.sessionId, bugReport2);

    // Circuit breaker tripped!
    expect(task.status).toBe("blocked");
    expect(task.currentStep).toBe("blocked");
    expect(housemates.get(hm1.housemate.key)?.state).toBe("called"); // Called to Confession Room

    await housemates.stop();
  });

  it("protects collab member state from premature session.status idle and restores state on confession dismiss", async () => {
    const store = new Store();
    const fakeClient = {
      createSession: async (input: any) => ({
        id: `mock_session_${input.title}`,
        cost: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
      }),
      streamEvents: () => {},
      abort: async () => true,
      prompt: async () => {},
      promptAsync: async () => {},
      messages: async () => [],
    };
    const fakeSupervisor = {
      ensure: async () => fakeClient as any,
      stop: async () => {},
      client: fakeClient as any,
    };
    const housemates = new Housemates(store, fakeSupervisor as any);
    const collab = new CollabManager(store, housemates, fakeSupervisor as any);

    housemates.isSessionInCollab = (sid) => collab.isSessionInCollab(sid);
    housemates.getCollabState = (sid) => collab.getMemberCollabState(sid);

    const hm1 = await housemates.summon({
      name: "Hans",
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-4" },
      projectRoot: process.cwd(),
      useWorktree: false,
    });
    const hm2 = await housemates.summon({
      name: "Bea",
      agent: "tester",
      model: { providerID: "openai", modelID: "gpt-4" },
      projectRoot: process.cwd(),
      useWorktree: false,
    });

    const task = await collab.startTask({
      goal: "Test state stability",
      members: [{ key: hm1.housemate.key }, { key: hm2.housemate.key }],
      maxAttempts: 3,
    });

    expect(collab.isSessionInCollab(hm1.housemate.sessionId)).toBe(true);
    expect(collab.isSessionInCollab(hm2.housemate.sessionId)).toBe(true);
    expect(collab.getMemberCollabState(hm1.housemate.sessionId)).toBe("working");
    expect(collab.getMemberCollabState(hm2.housemate.sessionId)).toBe("standby");

    // Bea is on standby in office: simulate OpenCode sending session.status { type: "idle" }
    (housemates as any).onEvent({
      type: "session.status",
      properties: {
        sessionID: hm2.housemate.sessionId,
        status: { type: "idle" },
      },
    });

    // Bea MUST NOT become "idle" - she must stay "standby" at her desk!
    expect(housemates.get(hm2.housemate.key)?.state).toBe("standby");

    // Hans is working: Kuya calls Hans to Confession Room for a quick check-in
    await housemates.call(hm1.housemate.key, "Quick status check-in, Hans!", "interrupt");
    expect(housemates.get(hm1.housemate.key)?.state).toBe("called");

    // Kuya dismisses Hans from Confession Room: Hans MUST return to "working", NOT "idle"!
    await housemates.dismissCall(hm1.housemate.key);
    expect(housemates.get(hm1.housemate.key)?.state).toBe("working");

    // Hans executes a tool and streams reasoning
    (housemates as any).onEvent({
      type: "message.part.updated",
      properties: {
        sessionID: hm1.housemate.sessionId,
        part: {
          type: "thought",
          text: "I am designing the coffee shop landing page layout with navigation and hero section.",
        },
      },
    });

    (housemates as any).onEvent({
      type: "message.part.updated",
      properties: {
        sessionID: hm1.housemate.sessionId,
        part: {
          type: "tool",
          tool: "write_file",
          input: { path: "src/components/CoffeeHero.tsx", content: "export function CoffeeHero() {}" },
        },
      },
    });

    // Verify snapshot does not decay to idle after >4 seconds
    const futureSnap = store.snapshot(Date.now() + 10_000);
    const hansSession = futureSnap.sessions.find((s) => s.housemateKey === hm1.housemate.key);
    expect(hansSession?.state).toBe("working");
    expect(hansSession?.currentAction).toContain("CoffeeHero.tsx");
    expect(hansSession?.currentThought).toContain("designing the coffee shop");

    // Verify getAgentInspection returns full live activity
    const inspection = await housemates.getAgentInspection(hm1.housemate.key);
    expect(inspection).toBeDefined();
    expect(inspection?.name).toBe("Hans");
    expect(inspection?.state).toBe("working");
    expect(inspection?.filesEdited).toContain("src/components/CoffeeHero.tsx");
    expect(inspection?.currentThought).toContain("coffee shop landing page");
    expect(inspection?.recentActivities.length).toBeGreaterThan(0);

    await housemates.stop();
  });

  it("supports Kuya circuit-breaker Retry, Follow-up instructions, and explicit Approval", async () => {
    const store = new Store();
    let promptAsyncCalls: Array<{ sessionId: string; message: string }> = [];

    const fakeClient = {
      createSession: async (input: any) => ({
        id: `mock_session_${input.title}`,
        cost: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
      }),
      streamEvents: () => {},
      abort: async () => true,
      promptAsync: async (sid: string, _dir: string, input: any) => {
        promptAsyncCalls.push({ sessionId: sid, message: input.message });
      },
      messages: async () => [],
    };

    const fakeSupervisor = {
      ensure: async () => fakeClient as any,
      stop: async () => {},
      client: fakeClient as any,
    };

    const housemates = new Housemates(store, fakeSupervisor as any);

    const hm1 = await housemates.summon({
      name: "Hans",
      agent: "build",
      model: { providerID: "openai", modelID: "gpt-4" },
      projectRoot: process.cwd(),
      useWorktree: false,
    });

    const hm2 = await housemates.summon({
      name: "Bea",
      agent: "code-reviewer",
      model: { providerID: "openai", modelID: "gpt-4" },
      projectRoot: process.cwd(),
      useWorktree: false,
    });

    const collab = new CollabManager(store, housemates, fakeSupervisor as any);

    const task = await collab.startTask({
      goal: "Build coffee shop website",
      members: [{ key: hm1.housemate.key }, { key: hm2.housemate.key }],
      maxAttempts: 1,
    });

    // Hans hands off
    await collab.handleSessionIdle(hm1.housemate.sessionId, "Built coffee shop index.html and styles.css");

    // Bea reports verification failure (maxAttempts 1 exceeded -> triggers circuit breaker)
    await collab.handleSessionIdle(
      hm2.housemate.sessionId,
      "VERIFICATION_FAILED: Missing shopping cart drawer button in index.html",
    );

    expect(task.status).toBe("blocked");
    expect(housemates.get(hm1.housemate.key)?.state).toBe("called"); // Hans called to confession

    // 1. Kuya retries the task (+1 round) with direct guidance
    promptAsyncCalls = [];
    const retriedTask = await collab.retryTask(task.id, "Use modal cart drawer with localStorage");
    expect(retriedTask.status).toBe("running");
    expect(retriedTask.maxAttempts).toBe(3);
    expect(housemates.get(hm1.housemate.key)?.state).toBe("working"); // Hans dismissed from confession back to office desk
    expect(promptAsyncCalls.length).toBe(1);
    expect(promptAsyncCalls[0].message).toContain("Kuya's Guidance for this retry");
    expect(promptAsyncCalls[0].message).toContain("modal cart drawer");

    // 2. Kuya sends a follow-up instruction
    promptAsyncCalls = [];
    await collab.followupTask(task.id, "Also add responsive coffee product cards", hm1.housemate.key);
    expect(promptAsyncCalls.length).toBe(1);
    expect(promptAsyncCalls[0].message).toContain("KUYA'S FOLLOW-UP INSTRUCTION");
    expect(promptAsyncCalls[0].message).toContain("responsive coffee product cards");

    // 3. Simulated bash tool execution creating index.html
    (housemates as any).onEvent({
      type: "message.part.updated",
      properties: {
        sessionID: hm1.housemate.sessionId,
        part: {
          type: "tool",
          tool: "bash",
          state: {
            input: { command: "cat << 'EOF' > index.html\n<!DOCTYPE html><html><body><h1>Coffee</h1></body></html>\nEOF" },
            output: "File index.html created",
          },
        },
      },
    });

    const inspection = await housemates.getAgentInspection(hm1.housemate.key);
    expect(inspection?.filesEdited).toContain("index.html");
    const bashAct = inspection?.recentActivities.find((a) => a.title.includes("bash"));
    expect(bashAct).toBeDefined();
    expect(bashAct?.detail).toContain("Output:\nFile index.html created");

    // 4. Kuya approves and marks the task done
    collab.approveTask(task.id);
    expect(task.status).toBe("done");
    expect(housemates.get(hm1.housemate.key)?.state).toBe("idle");
    expect(housemates.get(hm2.housemate.key)?.state).toBe("idle");
    expect(collab.getActiveTask()).toBeNull();

    await housemates.stop();
  });
});
