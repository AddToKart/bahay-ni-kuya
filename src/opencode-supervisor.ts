// Managed opencode server supervisor: start, health, logs, clean shutdown, reuse after restart.
//
// One shared headless server hosts all housemate sessions (verified in P3: one server, several
// sessions). The server binds loopback only. `--pure` is intentionally NOT used: P3 found that
// it did not prevent external plugins from loading, so it provides no isolation guarantee.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { OpenCodeClient } from "./opencode-client";
import { isAlive, killTree } from "./procutil";
import { log } from "./log";

const DIR = join(homedir(), ".bahay-ni-kuya");
const STATE_PATH = join(DIR, "opencode-state.json");
const DEFAULT_PORT = Number(process.env.BAHAY_OPENCODE_PORT ?? 40051);
const LOG_MAX = 300;

interface ServerState {
  port: number;
  pid: number;
  startedAt: number;
}

export class OpenCodeSupervisor {
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private clientInstance: OpenCodeClient | null = null;
  readonly port: number;
  private logs: string[] = [];
  private starting: Promise<OpenCodeClient> | null = null;

  constructor(port = DEFAULT_PORT) {
    this.port = port;
  }

  get client(): OpenCodeClient | null {
    return this.clientInstance;
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  private pushLog(line: string): void {
    for (const part of line.split("\n")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      this.logs.push(trimmed);
      if (this.logs.length > LOG_MAX) this.logs.shift();
    }
  }

  private readState(): ServerState | null {
    try {
      if (!existsSync(STATE_PATH)) return null;
      return JSON.parse(readFileSync(STATE_PATH, "utf8")) as ServerState;
    } catch {
      return null;
    }
  }

  private writeState(state: ServerState | null): void {
    try {
      if (!state) {
        rmSync(STATE_PATH, { force: true });
        return;
      }
      if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
      writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
    } catch {
      /* state file is best effort */
    }
  }

  /** Start (or adopt) the managed server and return a ready client. */
  async ensure(): Promise<OpenCodeClient> {
    if (this.clientInstance && (await this.clientInstance.health())) return this.clientInstance;
    if (this.starting) return this.starting;

    this.starting = this.startOrAdopt().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startOrAdopt(): Promise<OpenCodeClient> {
    const state = this.readState();

    // Adopt a live managed server from a previous house process (same port).
    if (state && state.port === this.port && isAlive(state.pid)) {
      const candidate = new OpenCodeClient(this.port);
      if (await candidate.health()) {
        this.clientInstance = candidate;
        log(`opencode: adopted managed server pid ${state.pid} on port ${this.port}`);
        return candidate;
      }
      log(`opencode: pid ${state.pid} alive but unhealthy; replacing it`);
      killTree(state.pid);
      this.writeState(null);
    } else if (state) {
      this.writeState(null);
    }

    const proc = Bun.spawn(
      [
        "opencode",
        "serve",
        "--port",
        String(this.port),
        "--hostname",
        "127.0.0.1",
        "--print-logs",
        "--log-level",
        "INFO",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    this.process = proc;
    this.writeState({ port: this.port, pid: proc.pid, startedAt: Date.now() });
    log(`opencode: starting managed server on 127.0.0.1:${this.port} (pid ${proc.pid})`);

    void this.pump(proc.stdout);
    void this.pump(proc.stderr);

    const client = new OpenCodeClient(this.port);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await client.health()) {
        this.clientInstance = client;
        log(`opencode: managed server healthy on port ${this.port}`);
        return client;
      }
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 300);
      await promise;
    }

    killTree(proc.pid);
    this.writeState(null);
    throw new Error(`opencode server did not become healthy on port ${this.port}`);
  }

  private async pump(stream: ReadableStream<Uint8Array> | null): Promise<void> {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.pushLog(decoder.decode(value, { stream: true }));
      }
    } catch {
      /* stream closed */
    }
  }

  async stop(): Promise<void> {
    const state = this.readState();
    const pid = this.process?.pid ?? state?.pid;
    if (pid && isAlive(pid)) {
      killTree(pid);
      log(`opencode: stopped managed server pid ${pid}`);
    }
    this.process = null;
    this.clientInstance = null;
    this.writeState(null);
  }
}
