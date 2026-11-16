// Headless task dispatcher and runner engine for Bahay ni Kuya

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Harness } from "./types";
import { Store } from "./store";
import runnersConfig from "../config/runners.json";

export type TaskStatus = "queued" | "running" | "done" | "failed" | "canceled";

export interface TaskRecord {
  id: string;
  harness: Harness;
  prompt: string;
  cwd: string;
  worktreeDir?: string;
  branch?: string;
  status: TaskStatus;
  exitCode: number | null;
  tail: string[];
  diffStat?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  callerHarness?: string;
  depth?: number;
  parentTaskId?: string;
}

interface RunnerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export class Dispatcher {
  private tasks = new Map<string, TaskRecord>();
  private activeProcesses = new Map<string, ReturnType<typeof spawn>>();
  private store: Store;
  private taskCounter = 1;
  private runners: Record<string, RunnerConfig>;

  constructor(store: Store) {
    this.store = store;
    this.runners = runnersConfig.runners as Record<string, RunnerConfig>;
  }

  getTasks(): TaskRecord[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }

  recordExternalTask(id: string, harness: Harness, prompt: string, cwd: string): TaskRecord {
    const record: TaskRecord = {
      id,
      harness,
      prompt,
      cwd,
      status: "running",
      exitCode: null,
      tail: [],
      createdAt: Date.now(),
      startedAt: Date.now(),
    };
    this.tasks.set(id, record);
    return record;
  }

  completeExternalTask(id: string, exitCode = 0): void {
    const record = this.tasks.get(id);
    if (!record) return;
    record.status = exitCode === 0 ? "done" : "failed";
    record.exitCode = exitCode;
    record.completedAt = Date.now();
  }

  submitTask(
    harness: Harness,
    prompt: string,
    cwd: string,
    callerHarness?: string,
    depth = 0,
    parentTaskId?: string,
  ): TaskRecord {
    // Guard against delegation loops
    if (callerHarness && callerHarness.toLowerCase() === harness.toLowerCase()) {
      throw new Error(`Delegation loop detected: harness '${harness}' cannot delegate tasks to itself`);
    }
    if (depth >= 2) {
      throw new Error("Delegation depth limit reached: maximum allowed delegation depth is 2 levels");
    }

    const id = `task_${Date.now()}_${this.taskCounter++}`;
    const record: TaskRecord = {
      id,
      harness,
      prompt,
      cwd,
      status: "queued",
      exitCode: null,
      tail: [],
      createdAt: Date.now(),
      callerHarness,
      depth,
      parentTaskId,
    };
    this.tasks.set(id, record);

    // Queue transition event
    this.store.ingest({
      harness,
      sessionId: id,
      type: "task_started",
      state: "working",
      title: prompt.slice(0, 80),
      directory: cwd,
    });

    // Schedule task run
    queueMicrotask(() => this.runTask(record));

    return record;
  }

  private async isGitRepo(dir: string): Promise<boolean> {
    try {
      const proc = Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      return code === 0;
    } catch {
      return false;
    }
  }

  private async setupWorktree(record: TaskRecord): Promise<void> {
    const isGit = await this.isGitRepo(record.cwd);
    if (!isGit) return;

    try {
      const branch = `kuya/${record.harness}-${record.id}`;
      const worktreeBase = join(record.cwd, ".kuya-worktrees");
      if (!existsSync(worktreeBase)) mkdirSync(worktreeBase, { recursive: true });
      const worktreeDir = join(worktreeBase, record.id);

      const addProc = Bun.spawn(["git", "worktree", "add", "-b", branch, worktreeDir, "HEAD"], {
        cwd: record.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const addCode = await addProc.exited;
      if (addCode === 0) {
        record.worktreeDir = worktreeDir;
        record.branch = branch;
      }
    } catch {
      // Fallback: run directly in cwd
    }
  }

  private async cleanupWorktree(record: TaskRecord): Promise<void> {
    if (!record.worktreeDir) return;

    try {
      // 1. Collect git diff stat
      const diffProc = Bun.spawn(["git", "diff", "--stat"], {
        cwd: record.worktreeDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const diffText = await new Response(diffProc.stdout).text();
      record.diffStat = diffText.trim();
    } catch {
      /* ignore */
    }

    try {
      // 2. Remove worktree
      const rmProc = Bun.spawn(["git", "worktree", "remove", "--force", record.worktreeDir], {
        cwd: record.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      await rmProc.exited;

      // 3. Delete branch
      if (record.branch) {
        const brProc = Bun.spawn(["git", "branch", "-D", record.branch], {
          cwd: record.cwd,
          stdout: "pipe",
          stderr: "pipe",
        });
        await brProc.exited;
      }
    } catch {
      // Ensure directory is cleaned
      try {
        if (existsSync(record.worktreeDir)) rmSync(record.worktreeDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private async runTask(record: TaskRecord): Promise<void> {
    if (record.status === "canceled") return;

    record.status = "running";
    record.startedAt = Date.now();

    await this.setupWorktree(record);
    const executionDir = record.worktreeDir || record.cwd;

    const runner = this.runners[record.harness] || {
      command: record.harness,
      args: ["{prompt}"],
      env: {},
    };

    // Format args: replace {prompt} with prompt string
    const cmdArgs = runner.args.map((arg) => (arg === "{prompt}" ? record.prompt : arg));

    // Emit working state & tool activity
    this.store.ingest({
      harness: record.harness,
      sessionId: record.id,
      type: "tool",
      tool: runner.command,
      directory: executionDir,
    });

    try {
      const child = spawn(runner.command, cmdArgs, {
        cwd: executionDir,
        env: {
          ...process.env,
          ...runner.env,
          KUYA_CALLER_HARNESS: record.harness,
          KUYA_DELEGATION_DEPTH: String((record.depth ?? 0) + 1),
          KUYA_PARENT_TASK_ID: record.id,
        },
        shell: process.platform === "win32",
      });

      this.activeProcesses.set(record.id, child);

      const pushLine = (line: string) => {
        const trimmed = line.trim();
        if (trimmed) {
          record.tail.push(trimmed);
          if (record.tail.length > 100) record.tail.shift();
        }
      };

      child.stdout?.on("data", (data) => {
        const text = String(data);
        for (const line of text.split("\n")) pushLine(line);
      });

      child.stderr?.on("data", (data) => {
        const text = String(data);
        for (const line of text.split("\n")) pushLine(`[stderr] ${line}`);
      });

      child.on("close", async (code) => {
        this.activeProcesses.delete(record.id);
        record.exitCode = code;
        record.completedAt = Date.now();

        await this.cleanupWorktree(record);

        if (record.status !== "canceled") {
          record.status = code === 0 ? "done" : "failed";
        }

        if (record.status === "done") {
          this.store.ingest({
            harness: record.harness,
            sessionId: record.id,
            type: "task_completed",
            state: "idle",
            directory: record.cwd,
          });
        } else if (record.status === "failed") {
          this.store.ingest({
            harness: record.harness,
            sessionId: record.id,
            type: "error",
            error: `Exit code ${code}`,
            directory: record.cwd,
          });
        }
      });

      child.on("error", async (err) => {
        this.activeProcesses.delete(record.id);
        record.exitCode = 1;
        record.status = "failed";
        record.completedAt = Date.now();
        pushLine(`[error] ${err.message}`);
        await this.cleanupWorktree(record);

        this.store.ingest({
          harness: record.harness,
          sessionId: record.id,
          type: "error",
          error: err.message,
          directory: record.cwd,
        });
      });
    } catch (err: any) {
      record.status = "failed";
      record.exitCode = 1;
      record.completedAt = Date.now();
      record.tail.push(`[dispatch error] ${err.message}`);
      await this.cleanupWorktree(record);

      this.store.ingest({
        harness: record.harness,
        sessionId: record.id,
        type: "error",
        error: String(err),
        directory: record.cwd,
      });
    }
  }

  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status === "done" || task.status === "failed") return false;

    task.status = "canceled";
    task.completedAt = Date.now();

    const proc = this.activeProcesses.get(id);
    if (proc) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      this.activeProcesses.delete(id);
    }

    this.cleanupWorktree(task);

    this.store.ingest({
      harness: task.harness,
      sessionId: task.id,
      type: "task_completed",
      state: "idle",
      directory: task.cwd,
    });

    return true;
  }
}
