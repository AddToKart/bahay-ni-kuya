import { describe, expect, it } from "bun:test";
import { Store } from "../src/store";
import type { ProcInfo } from "../src/scan";

describe("Milestone 1: Process scan deduplication & instance tracking", () => {
  it("deduplicates child processes and counts only top-level harness instances", () => {
    const store = new Store();
    store.setInstalled({
      opencode: true,
      codex: true,
      pi: true,
      omp: true,
      hermes: true,
    });

    const mockProcs: ProcInfo[] = [
      // Top-level omp instance 1 (spawned by terminal PID 500)
      { pid: 1000, ppid: 500, name: "omp.exe", cmd: "omp", cpuMs: 100 },
      // Child process of omp instance 1 (spawned by PID 1000)
      { pid: 1001, ppid: 1000, name: "node.exe", cmd: "node oh-my-pi worker", cpuMs: 50 },
      // Another child of omp instance 1
      { pid: 1002, ppid: 1000, name: "node.exe", cmd: "node oh-my-pi lsp", cpuMs: 30 },
      // Top-level omp instance 2 (spawned by terminal PID 600)
      { pid: 2000, ppid: 600, name: "omp.exe", cmd: "omp", cpuMs: 200 },
      // Top-level codex instance
      { pid: 3000, ppid: 700, name: "codex.exe", cmd: "codex", cpuMs: 150 },
      // Unrelated process
      { pid: 9999, ppid: 1, name: "explorer.exe", cmd: "explorer.exe", cpuMs: 500 },
    ];

    store.applyScan(mockProcs, 1000000);
    const snap = store.snapshot();

    const ompHarness = snap.harnesses.find((h) => h.name === "omp");
    expect(ompHarness).toBeDefined();
    // 3 omp processes total, but only 2 top-level instances!
    expect(ompHarness!.procs).toBe(2);

    const ompSessions = snap.sessions.filter((s) => s.harness === "omp");
    expect(ompSessions.length).toBe(2);
    expect(ompSessions.map((s) => s.sessionId).sort()).toEqual(["scan:1000", "scan:2000"]);

    // Verify PID is attached
    expect(ompSessions.find((s) => s.sessionId === "scan:1000")?.pid).toBe(1000);
    expect(ompSessions.find((s) => s.sessionId === "scan:2000")?.pid).toBe(2000);

    const codexSessions = snap.sessions.filter((s) => s.harness === "codex");
    expect(codexSessions.length).toBe(1);
    expect(codexSessions[0].pid).toBe(3000);
  });
});
