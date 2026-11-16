// Real opencode housemates: summon (worktree + session), evict (abort, keep worktree),
// confession questions (verified reply routes), calls, guests (observed child sessions).
//
// Rule 11: this module never creates a child session and never passes parentID. Child sessions
// are only observed from the event stream and rendered as guests.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Store } from "./store";
import { OpenCodeSupervisor } from "./opencode-supervisor";
import {
  type OpenCodeClient,
  type OpenCodeEvent,
  type OpenCodeSession,
} from "./opencode-client";
import { audit } from "./audit";
import { validateCwd } from "./security";
import houseConfig from "../config/house.json";
import type { Harness, TokenUsage } from "./types";

const HARNESS: Harness = "opencode";
const CAP = houseConfig.housemateCap ?? 6;
const MAX_CONCURRENT_TURNS = houseConfig.maxConcurrentTurns ?? 3;
const MIN_GUEST_VISIBLE_MS = 3000;

export interface SummonInput {
  name: string;
  agent: string;
  model: { providerID: string; modelID: string; variant?: string };
  projectRoot: string;
  persona?: string;
  permissions?: Record<string, "ask" | "allow" | "deny">;
  houseId?: string;
  useWorktree?: boolean;
  autoApprove?: boolean;
}

export interface AgentActivityItem {
  id: string;
  type: "thought" | "tool" | "text" | "patch" | "command";
  title: string;
  detail?: string;
  file?: string;
  ts: number;
}

export interface AgentInspectionData {
  key: string;
  name: string;
  agent: string;
  model: string;
  provider: string;
  state: string;
  directory: string;
  sessionId: string;
  currentAction: string;
  currentThought: string;
  currentTool: string;
  filesEdited: string[];
  recentActivities: AgentActivityItem[];
  messages: any[];
}

export interface HousemateRec {
  key: string;
  name: string;
  harness: typeof HARNESS;
  agent: string;
  model: string;
  provider: string;
  variant?: string;
  persona?: string;
  sessionId: string;
  directory: string;
  worktree?: string;
  branch?: string;
  state:
    | "arriving"
    | "idle"
    | "working"
    | "blocked"
    | "in_confession"
    | "called"
    | "evicting";
  guests: string[];
  cost: number;
  tokens?: TokenUsage;
  createdAt: number;
  autoApprove?: boolean;
  permissions?: Record<string, "ask" | "allow" | "deny">;
  currentAction?: string;
  currentThought?: string;
  currentTool?: string;
  filesEdited?: string[];
  recentActivities?: AgentActivityItem[];
}

export interface SummonResult {
  housemate: HousemateRec;
  warnings: string[];
}

export interface EvictResult {
  worktree?: string;
  branch?: string;
  diffStat: string;
}

interface QuestionRoute {
  kind: "permission" | "question";
  requestId: string;
  sessionId: string;
  directory: string;
  options?: string[];
}

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "housemate";

const modelString = (session: OpenCodeSession): string | undefined => {
  const m = session.model;
  if (!m) return undefined;
  return `${m.providerID}/${m.id}${m.variant ? `@${m.variant}` : ""}`;
};

const HOLD = Number.MAX_SAFE_INTEGER;

export class Housemates {
  private recs = new Map<string, HousemateRec>();
  private sessionToKey = new Map<string, string>();
  private questions = new Map<string, QuestionRoute>();
  private guestHost = new Map<string, string>();
  private activeTurns = new Set<string>();
  private promptQueue: Array<{ key: string; message: string }> = [];
  private eventAbort: AbortController | null = null;
  private arrivedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private callActive = new Map<string, number>();
  private sessionToTaskId = new Map<string, string>();
  onTaskCompleted?: (taskId: string, exitCode: number) => void;
  onSessionIdle?: (sessionId: string) => Promise<boolean>;
  isSessionInCollab?: (sessionId: string) => boolean;
  getCollabState?: (sessionId: string) => SessionState | null;

  constructor(
    private store: Store,
    private supervisor: OpenCodeSupervisor,
  ) {}

  list(): HousemateRec[] {
    return [...this.recs.values()];
  }

  get(key: string): HousemateRec | undefined {
    return this.recs.get(key);
  }

  async getAgentInspection(key: string): Promise<AgentInspectionData | null> {
    const rec = this.recs.get(key);
    if (!rec) return null;

    let fullMessages: any[] = [];
    try {
      const client = this.supervisor.client;
      if (client) {
        fullMessages = await client.messages(rec.sessionId, rec.directory);
      }
    } catch {}

    const state = this.getCollabState?.(rec.sessionId) || rec.state;
    return {
      key: rec.key,
      name: rec.name,
      agent: rec.agent,
      model: `${rec.provider}/${rec.model}`,
      provider: rec.provider,
      state,
      directory: rec.directory,
      sessionId: rec.sessionId,
      currentAction: rec.currentAction || (state === "working" ? "Working on task" : state),
      currentThought: rec.currentThought || "",
      currentTool: rec.currentTool || "",
      filesEdited: rec.filesEdited || [],
      recentActivities: rec.recentActivities || [],
      messages: fullMessages,
    };
  }

  getSessionIdForTask(taskId: string): string | undefined {
    for (const [sid, tid] of this.sessionToTaskId.entries()) {
      if (tid === taskId) return sid;
    }
    return undefined;
  }

  async abortSession(sessionId: string): Promise<boolean> {
    const client = this.supervisor.client;
    const key = this.sessionToKey.get(sessionId);
    const rec = key ? this.recs.get(key) : undefined;
    if (!client || !rec) return false;
    return client.abort(sessionId, rec.directory).catch(() => false);
  }

  /** Start the managed server and the event stream (idempotent). */
  async start(): Promise<OpenCodeClient> {
    const client = await this.supervisor.ensure();
    if (!this.eventAbort) {
      const abort = new AbortController();
      this.eventAbort = abort;
      void client.streamEvents((event) => this.onEvent(event), abort.signal);
    }
    return client;
  }

  async stop(): Promise<void> {
    this.eventAbort?.abort();
    this.eventAbort = null;
    for (const timer of this.arrivedTimers.values()) clearTimeout(timer);
    this.arrivedTimers.clear();
    await this.supervisor.stop();
  }

  async summon(input: SummonInput): Promise<SummonResult> {
    if (this.recs.size >= CAP)
      throw new Error(`housemate cap reached (${CAP})`);
    const name = input.name.trim();
    const agent = input.agent.trim();
    if (!name) throw new Error("name required");
    if (!agent) throw new Error("agent required");
    if (!input.model?.modelID || !input.model.providerID)
      throw new Error("model required");

    const cwd = validateCwd(
      input.projectRoot?.trim() ? input.projectRoot : process.cwd(),
    );
    if (!cwd.ok || !cwd.path)
      throw new Error(cwd.error ?? "project root is not allowlisted");

    const client = await this.start();
    const key = `hm_${slug(name)}_${Date.now().toString(36).slice(-4)}`;
    const useWorktree = input.useWorktree !== false;
    let created: { worktree?: string; branch?: string; warnings: string[] } = {
      warnings: [],
    };
    if (useWorktree) {
      created = this.createWorktree(cwd.path, key, name);
    }
    const directory = created.worktree ?? cwd.path;

    const autoApprove =
      input.autoApprove ??
      (input.permissions?.bash === "allow" ||
        input.permissions?.["*"] === "allow" ||
        true);
    const permissions: Record<string, "ask" | "allow" | "deny"> =
      input.permissions ??
      (autoApprove
        ? {
            "*": "allow",
            bash: "allow",
            edit: "allow",
            read: "allow",
            glob: "allow",
          }
        : { bash: "ask", edit: "ask" });

    const session = await client.createSession({
      directory,
      title: name,
      agent,
      model: {
        id: input.model.modelID,
        providerID: input.model.providerID,
        ...(input.model.variant ? { variant: input.model.variant } : {}),
      },
      permission: Object.entries(permissions).map(([permission, action]) => ({
        permission,
        pattern: "*",
        action,
      })),
    });

    const rec: HousemateRec = {
      key,
      name,
      harness: HARNESS,
      agent,
      model: input.model.modelID,
      provider: input.model.providerID,
      variant: input.model.variant,
      persona: input.persona,
      sessionId: session.id,
      directory,
      worktree: created.worktree,
      branch: created.branch,
      state: "arriving",
      guests: [],
      cost: session.cost ?? 0,
      tokens: session.tokens,
      createdAt: Date.now(),
      autoApprove,
      permissions,
      filesEdited: [],
      recentActivities: [],
    };
    this.recs.set(key, rec);
    this.sessionToKey.set(session.id, key);

    this.store.ingest({
      harness: HARNESS,
      type: "housemate_summoned",
      sessionId: session.id,
      housemateKey: key,
      name,
      agent,
      model: `${rec.provider}/${rec.model}`,
      directory,
      houseId: input.houseId,
    });

    const timer = setTimeout(() => {
      if (rec.state !== "called" && !this.callActive.has(key)) {
        rec.state = "idle";
        this.store.ingest({
          harness: HARNESS,
          type: "housemate_arrived",
          sessionId: session.id,
          housemateKey: key,
        });
      }
      this.arrivedTimers.delete(key);
    }, 8000);
    this.arrivedTimers.set(key, timer);

    audit("kuya", "summon", key, {
      agent,
      model: `${rec.provider}/${rec.model}`,
      directory,
      worktree: created.worktree,
      branch: created.branch,
    });
    return { housemate: rec, warnings: created.warnings };
  }

  async evict(key: string): Promise<EvictResult> {
    const rec = this.recs.get(key);
    if (!rec) throw new Error(`unknown housemate: ${key}`);
    const client = this.supervisor.client;
    if (client)
      await client.abort(rec.sessionId, rec.directory).catch(() => false);

    const diffStat = rec.worktree ? this.gitDiffStat(rec.worktree) : "";
    this.store.ingest({
      harness: HARNESS,
      type: "housemate_evict_started",
      sessionId: rec.sessionId,
      housemateKey: key,
      reason: "kuya_evict",
    });

    // Let the walk-out animation play; the worktree and branch are KEPT (Rule 8).
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 5000);
    await promise;

    this.store.ingest({
      harness: HARNESS,
      type: "housemate_evicted",
      sessionId: rec.sessionId,
      housemateKey: key,
    });
    this.recs.delete(key);
    this.sessionToKey.delete(rec.sessionId);
    this.activeTurns.delete(key);
    for (const guest of rec.guests) this.guestHost.delete(guest);
    const timer = this.arrivedTimers.get(key);
    clearTimeout(timer);
    this.arrivedTimers.delete(key);

    audit("kuya", "evict", key, {
      worktree: rec.worktree,
      branch: rec.branch,
      diffStat: diffStat || "(clean)",
    });
    return { worktree: rec.worktree, branch: rec.branch, diffStat };
  }

  /** Assign a work task to a housemate: walks them to an office desk to execute via opencode. */
  async assignTask(
    key: string,
    prompt: string,
    cwd?: string,
  ): Promise<{ taskId: string; sessionId: string }> {
    const rec = this.recs.get(key);
    if (!rec) throw new Error(`unknown housemate: ${key}`);
    const client = this.supervisor.client;
    if (!client) throw new Error("opencode server not ready");

    const text = prompt.trim();
    if (!text) throw new Error("task prompt required");

    // Clear any active confession call since they are now dispatched to work in the office
    this.callActive.delete(key);
    rec.state = "working";
    this.activeTurns.add(key);

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const executionDir = cwd || rec.directory;
    this.sessionToTaskId.set(rec.sessionId, taskId);

    this.store.ingest({
      harness: HARNESS,
      sessionId: rec.sessionId,
      type: "task_started",
      state: "working",
      title: text.slice(0, 80),
      directory: executionDir,
    });

    void client
      .promptAsync(rec.sessionId, executionDir, {
        message: text,
        agent: rec.agent,
        model: {
          providerID: rec.provider,
          modelID: rec.model,
          ...(rec.variant ? { variant: rec.variant } : {}),
        },
      })
      .catch((error: unknown) => {
        this.store.ingest({
          harness: HARNESS,
          type: "error",
          sessionId: rec.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    audit("kuya", "task", key, { prompt: text, directory: executionDir });
    return { taskId, sessionId: rec.sessionId };
  }

  async call(
    key: string,
    message: string,
    when: "after-turn" | "interrupt",
  ): Promise<void> {
    const rec = this.recs.get(key);
    if (!rec) throw new Error(`unknown housemate: ${key}`);
    const text = message.trim().slice(0, 400);
    if (!text) throw new Error("message required");
    const client = this.supervisor.client;
    if (!client) throw new Error("opencode server not ready");

    if (when === "interrupt") {
      await client.abort(rec.sessionId, rec.directory).catch(() => false);
    }

    if (this.activeTurns.size >= MAX_CONCURRENT_TURNS) {
      this.promptQueue.push({ key, message: text });
      audit("kuya", "call-queued", key, { text });
      return;
    }
    await this.sendMessage(rec, text);
    audit("kuya", "call", key, { text, when });
  }

  /** Answer a question/permission through the verified opencode reply routes. */
  async answer(
    questionId: string,
    answer: { option?: number; text?: string },
  ): Promise<boolean> {
    const route = this.questions.get(questionId);
    const client = this.supervisor.client;
    if (!route || !client) return false;

    let ok = false;
    if (route.kind === "permission") {
      const text = (answer.text ?? "").toLowerCase();
      const reply = /always/.test(text)
        ? "always"
        : /no|hindi|reject|deny|huwag/.test(text)
          ? "reject"
          : "once";
      ok = await client.replyPermission(
        route.requestId,
        reply,
        route.directory,
      );
    } else {
      const labels = route.options ?? [];
      const value =
        typeof answer.option === "number" && labels[answer.option]
          ? labels[answer.option]
          : (answer.text ?? "");
      ok = await client.replyQuestion(
        route.requestId,
        [[value]],
        route.directory,
      );
    }

    if (ok) {
      this.questions.delete(questionId);
      this.store.ingest({
        harness: HARNESS,
        type: "question_answered",
        id: questionId,
        option: answer.option,
        text: answer.text,
      });
      audit("kuya", "answer", questionId, { kind: route.kind });
    }
    return ok;
  }

  getUsage(key: string): {
    available: boolean;
    cost?: number;
    tokens?: TokenUsage;
  } {
    const rec = this.recs.get(key);
    if (!rec) return { available: false };
    if (rec.tokens || typeof rec.cost === "number") {
      return { available: true, cost: rec.cost, tokens: rec.tokens };
    }
    return { available: false };
  }

  async dismissCall(key: string): Promise<void> {
    const rec = this.recs.get(key);
    if (!rec) return;
    this.callActive.delete(key);
    this.activeTurns.delete(key);
    const collabState = this.getCollabState?.(rec.sessionId);
    rec.state = collabState ?? "idle";
    this.store.ingest({
      harness: HARNESS,
      type: "kuya_call_ended",
      sessionId: rec.sessionId,
      housemateKey: key,
    });
    audit("kuya", "dismiss", key, {});
  }

  private async sendMessage(rec: HousemateRec, text: string): Promise<void> {
    const client = this.supervisor.client;
    if (!client) throw new Error("opencode server not ready");
    this.callActive.set(rec.key, HOLD);
    rec.state = "called";
    this.store.ingest({
      harness: HARNESS,
      type: "kuya_call",
      sessionId: rec.sessionId,
      housemateKey: rec.key,
    });
    this.store.ingest({
      harness: HARNESS,
      type: "chat_message",
      sessionId: rec.sessionId,
      role: "kuya",
      text,
    });
    void client
      .prompt(rec.sessionId, rec.directory, {
        message: text,
        agent: rec.agent,
        model: {
          providerID: rec.provider,
          modelID: rec.model,
          ...(rec.variant ? { variant: rec.variant } : {}),
        },
      })
      .then((res: unknown) => {
        if (res && typeof res === "object") {
          const resObj = res as Record<string, any>;
          let replyText = "";
          if (Array.isArray(resObj.parts)) {
            for (const pt of resObj.parts) {
              if (pt?.type === "text" && typeof pt?.text === "string") {
                replyText += pt.text;
              }
            }
          } else if (typeof resObj.text === "string") {
            replyText = resObj.text;
          }
          // Do not ingest if it's the echoed user prompt (opencode returns the created user message)
          if (resObj.role === "user" || replyText.trim() === text.trim()) {
            return;
          }
          if (replyText.trim()) {
            this.store.ingest({
              harness: HARNESS,
              type: "chat_message",
              sessionId: rec.sessionId,
              role: "housemate",
              text: replyText.trim().slice(0, 400),
            });
          }
        }
      })
      .catch((error: unknown) => {
        this.store.ingest({
          harness: HARNESS,
          type: "error",
          sessionId: rec.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private drainQueue(): void {
    while (
      this.promptQueue.length > 0 &&
      this.activeTurns.size < MAX_CONCURRENT_TURNS
    ) {
      const next = this.promptQueue.shift();
      if (!next) break;
      const rec = this.recs.get(next.key);
      if (!rec) continue;
      void this.sendMessage(rec, next.message).catch(() => undefined);
    }
  }

  private createWorktree(
    root: string,
    key: string,
    name: string,
  ): {
    worktree?: string;
    branch?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const inside = spawnSync(
      "git",
      ["-C", root, "rev-parse", "--is-inside-work-tree"],
      {
        encoding: "utf8",
      },
    );
    if (inside.status !== 0)
      throw new Error(
        "project root is not a git repository; refusing to run outside a worktree",
      );
    const dirty = spawnSync("git", ["-C", root, "status", "--porcelain"], {
      encoding: "utf8",
    });
    if (dirty.stdout.trim())
      warnings.push("main worktree has uncommitted changes");

    const branch = `kuya/${slug(name)}-${key.slice(-4)}`;
    const worktree = join(root, ".kuya-worktrees", key);
    if (existsSync(worktree))
      throw new Error(`worktree already exists: ${worktree}`);
    const add = spawnSync(
      "git",
      ["-C", root, "worktree", "add", "-b", branch, worktree, "HEAD"],
      {
        encoding: "utf8",
      },
    );
    if (add.status !== 0) {
      throw new Error(
        `git worktree add failed: ${(add.stderr || add.stdout || "").trim()}`,
      );
    }
    return { worktree, branch, warnings };
  }

  private gitDiffStat(worktree: string): string {
    const res = spawnSync("git", ["-C", worktree, "diff", "--stat"], {
      encoding: "utf8",
    });
    return (res.stdout || "").trim();
  }

  private async onEvent(event: OpenCodeEvent): Promise<void> {
    const p = (event.properties ?? {}) as Record<string, any>;
    switch (event.type) {
      case "session.created": {
        const info = p.info as OpenCodeSession | undefined;
        if (!info?.id) break;
        if (info.parentID) {
          this.guestHost.set(info.id, info.parentID);
          this.store.updateSessionMeta(HARNESS, info.id, {
            agent: info.agent,
            model: modelString(info),
            cost: info.cost,
            tokens: info.tokens,
          });
          this.store.ingest({
            harness: HARNESS,
            type: "guest_arrived",
            guestKey: info.id,
            hostKey: info.parentID,
          });
          const parentKey = this.sessionToKey.get(info.parentID);
          if (parentKey) {
            const host = this.recs.get(parentKey);
            if (host) host.guests.push(info.id);
          }
        }
        break;
      }
      case "session.updated": {
        const info = p.info as OpenCodeSession | undefined;
        if (!info?.id) break;
        this.store.updateSessionMeta(HARNESS, info.id, {
          agent: info.agent,
          model: modelString(info),
          cost: info.cost,
          tokens: info.tokens,
        });
        const key = this.sessionToKey.get(info.id);
        if (key) {
          const rec = this.recs.get(key);
          if (rec) {
            rec.cost = info.cost ?? rec.cost;
            rec.tokens = info.tokens ?? rec.tokens;
          }
        }
        break;
      }
      case "session.status": {
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        const status = p.status as
          | { type?: string; message?: string }
          | undefined;
        if (!sid || !status) break;
        const key = this.sessionToKey.get(sid);
        if (key) {
          const rec = this.recs.get(key);
          if (rec && (rec.state === "called" || this.callActive.has(key))) {
            if (status.type === "busy") {
              this.activeTurns.add(key);
            } else if (status.type === "idle") {
              this.activeTurns.delete(key);
              this.drainQueue();
            }
            break;
          }
          if (status.type === "busy") {
            if (rec) rec.state = "working";
            this.activeTurns.add(key);
            this.store.ingest({
              harness: HARNESS,
              type: "task_started",
              sessionId: sid,
              title: key,
            });
          } else if (status.type === "idle") {
            if (this.isSessionInCollab?.(sid)) {
              this.activeTurns.delete(key);
              this.drainQueue();
              if (this.onSessionIdle) void this.onSessionIdle(sid);
              break;
            }
            if (rec) rec.state = "idle";
            this.activeTurns.delete(key);
            this.callActive.delete(key);
            this.store.ingest({
              harness: HARNESS,
              type: "task_completed",
              sessionId: sid,
            });
            this.drainQueue();
          } else if (status.type === "retry" && key) {
            this.store.ingest({
              harness: HARNESS,
              type: "error",
              sessionId: sid,
              error: status.message ?? "retry",
            });
          }
        } else if (this.guestHost.has(sid) && status.type === "idle") {
          this.scheduleGuestLeft(sid);
        }
        break;
      }
      case "session.idle": {
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        if (!sid) break;
        const key = this.sessionToKey.get(sid);
        if (key) {
          const rec = this.recs.get(key);
          const taskId = this.sessionToTaskId.get(sid);
          if (taskId) {
            this.sessionToTaskId.delete(sid);
            this.onTaskCompleted?.(taskId, 0);
          }
          if (this.onSessionIdle) {
            const handled = await this.onSessionIdle(sid);
            if (handled) {
              this.activeTurns.delete(key);
              this.drainQueue();
              break;
            }
          }
          if (rec && (rec.state === "called" || this.callActive.has(key))) {
            this.activeTurns.delete(key);
            this.drainQueue();
            break;
          }
          if (this.isSessionInCollab?.(sid)) {
            this.activeTurns.delete(key);
            this.drainQueue();
            break;
          }
          this.activeTurns.delete(key);
          this.callActive.delete(key);
          this.store.ingest({
            harness: HARNESS,
            type: "task_completed",
            sessionId: sid,
          });
          this.drainQueue();
        } else if (this.guestHost.has(sid)) {
          this.scheduleGuestLeft(sid);
        }
        break;
      }
      case "session.error": {
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        const error = p.error as { message?: string } | undefined;
        if (sid && this.sessionToKey.has(sid)) {
          const taskId = this.sessionToTaskId.get(sid);
          if (taskId) {
            this.sessionToTaskId.delete(sid);
            this.onTaskCompleted?.(taskId, 1);
          }
          this.store.ingest({
            harness: HARNESS,
            type: "error",
            sessionId: sid,
            error: error?.message ?? "session error",
          });
        }
        break;
      }
      case "session.deleted": {
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        if (!sid) break;
        if (this.sessionToKey.has(sid)) {
          this.store.ingest({
            harness: HARNESS,
            type: "session_end",
            sessionId: sid,
          });
          const key = this.sessionToKey.get(sid);
          if (key) {
            this.recs.delete(key);
            this.sessionToKey.delete(sid);
          }
        } else if (this.guestHost.has(sid)) {
          this.scheduleGuestLeft(sid);
        }
        break;
      }
      case "message.part.updated": {
        const part = p.part as any;
        const msg = p.message as { role?: string } | undefined;
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        if (!part || !sid) break;
        const key = this.sessionToKey.get(sid);
        const rec = key ? this.recs.get(key) : undefined;
        const partRole = part?.role ?? msg?.role;
        if (partRole === "user") break;

        // 1. Thought / Reasoning
        if (
          part.type === "thought" ||
          part.type === "reasoning" ||
          (typeof part.thought === "string" && part.thought)
        ) {
          const thoughtText =
            typeof part.text === "string"
              ? part.text
              : typeof part.thought === "string"
                ? part.thought
                : "";
          if (thoughtText && rec) {
            rec.currentThought = thoughtText;
            rec.currentAction = "Thinking & analyzing...";
            if (!rec.recentActivities) rec.recentActivities = [];
            const lastAct = rec.recentActivities[rec.recentActivities.length - 1];
            if (lastAct && lastAct.type === "thought" && Date.now() - lastAct.ts < 4000) {
              lastAct.detail = thoughtText;
              lastAct.ts = Date.now();
            } else {
              rec.recentActivities.push({
                id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: "thought",
                title: "Thought Process",
                detail: thoughtText,
                ts: Date.now(),
              });
              if (rec.recentActivities.length > 60) rec.recentActivities.shift();
            }
            this.store.ingest({
              harness: HARNESS,
              type: "state",
              sessionId: sid,
              currentAction: rec.currentAction,
              currentThought: thoughtText.slice(0, 300),
            });
          }
        }

        // 2. Tool / File Edit / Command
        else if (part.type === "tool" && part.tool) {
          const toolName = String(part.tool);
          let targetFile = "";
          let command = "";
          const input = part.input || part.args || part.parameters || {};
          if (typeof input.path === "string") targetFile = input.path;
          else if (typeof input.filePath === "string") targetFile = input.filePath;
          else if (typeof input.file === "string") targetFile = input.file;
          if (typeof input.command === "string") command = input.command;

          if (rec) {
            rec.currentTool = toolName;
            if (targetFile) {
              if (!rec.filesEdited) rec.filesEdited = [];
              if (!rec.filesEdited.includes(targetFile)) rec.filesEdited.push(targetFile);
              rec.currentAction = `${toolName.includes("edit") || toolName.includes("write") ? "Editing" : "Inspecting"} ${targetFile}`;
            } else if (command) {
              rec.currentAction = `Running command: ${command.slice(0, 50)}`;
            } else {
              rec.currentAction = `Using tool: ${toolName}`;
            }

            if (!rec.recentActivities) rec.recentActivities = [];
            rec.recentActivities.push({
              id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: targetFile ? "patch" : command ? "command" : "tool",
              title: rec.currentAction,
              detail: JSON.stringify(input, null, 2),
              file: targetFile || undefined,
              ts: Date.now(),
            });
            if (rec.recentActivities.length > 60) rec.recentActivities.shift();
          }

          this.store.ingest({
            harness: HARNESS,
            type: "tool",
            sessionId: sid,
            tool: toolName,
            currentAction: rec?.currentAction,
            currentThought: rec?.currentThought?.slice(0, 300),
          });
        }

        // 3. Patch / File modification directly
        else if (part.type === "patch" && (part.file || part.path)) {
          const file = String(part.file || part.path);
          if (rec) {
            if (!rec.filesEdited) rec.filesEdited = [];
            if (!rec.filesEdited.includes(file)) rec.filesEdited.push(file);
            rec.currentAction = `Modifying ${file}`;
            if (!rec.recentActivities) rec.recentActivities = [];
            rec.recentActivities.push({
              id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: "patch",
              title: `Modified ${file}`,
              detail: typeof part.patch === "string" ? part.patch : undefined,
              file,
              ts: Date.now(),
            });
            if (rec.recentActivities.length > 60) rec.recentActivities.shift();
          }
        }

        // 4. Assistant Text (streaming response or confession chat)
        else if (part.type === "text" && part.text) {
          const activeUntil = key ? (this.callActive.get(key) ?? 0) : 0;
          if (
            key &&
            (Date.now() < activeUntil || this.recs.get(key)?.state === "called")
          ) {
            this.store.ingest({
              harness: HARNESS,
              type: "chat_message",
              sessionId: sid,
              role: "housemate",
              text: part.text.slice(0, 400),
            });
          }
        }
        break;
      }
      case "permission.asked": {
        const id = typeof p.id === "string" ? p.id : "";
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        const key = this.sessionToKey.get(sid);
        if (!id || !key) break;
        const rec = this.recs.get(key);
        if (
          rec &&
          (rec.autoApprove ||
            rec.permissions?.bash === "allow" ||
            rec.permissions?.["*"] === "allow")
        ) {
          const client = this.supervisor.client;
          if (client) {
            void client
              .replyPermission(id, "always", rec.directory)
              .catch(() => {});
            break;
          }
        }
        const meta = p.metadata as { command?: string } | undefined;
        const text = meta?.command
          ? `Bash: ${meta.command}`
          : `Permission: ${String(p.permission ?? "request")}`;
        this.questions.set(id, {
          kind: "permission",
          requestId: id,
          sessionId: sid,
          directory: rec?.directory ?? "",
        });
        this.store.ingest({
          harness: HARNESS,
          type: "question_asked",
          sessionId: sid,
          housemateKey: key,
          id,
          kind: "permission",
          text: text.slice(0, 400),
          options: ["Allow once", "Reject"],
        });
        break;
      }
      case "question.asked": {
        const id = typeof p.id === "string" ? p.id : "";
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        const key = this.sessionToKey.get(sid);
        if (!id || !key) break;
        const questions = Array.isArray(p.questions) ? p.questions : [];
        const first = questions[0] as
          | { question?: string; options?: Array<{ label?: string }> }
          | undefined;
        if (!first?.question) break;
        const options = (first.options ?? [])
          .map((option) => option.label)
          .filter((label): label is string => typeof label === "string");
        this.questions.set(id, {
          kind: "question",
          requestId: id,
          sessionId: sid,
          directory: this.recs.get(key)?.directory ?? "",
          options,
        });
        this.store.ingest({
          harness: HARNESS,
          type: "question_asked",
          sessionId: sid,
          housemateKey: key,
          id,
          kind: options.length > 0 ? "choice" : "text",
          text: first.question.slice(0, 400),
          options,
        });
        break;
      }
      case "question.replied": {
        const id = typeof p.requestID === "string" ? p.requestID : "";
        const answers = Array.isArray(p.answers)
          ? p.answers.flat().join(", ")
          : undefined;
        if (id)
          this.store.ingest({
            harness: HARNESS,
            type: "question_answered",
            id,
            text: answers,
          });
        break;
      }
      case "permission.replied": {
        const id = typeof p.requestID === "string" ? p.requestID : "";
        if (id)
          this.store.ingest({
            harness: HARNESS,
            type: "question_answered",
            id,
          });
        break;
      }
      default:
        break;
    }
  }

  private scheduleGuestLeft(sid: string): void {
    const hostKey = this.guestHost.get(sid);
    if (!hostKey) return;
    this.guestHost.delete(sid);
    const parentKey = this.sessionToKey.get(hostKey);
    if (parentKey) {
      const host = this.recs.get(parentKey);
      if (host) host.guests = host.guests.filter((guest) => guest !== sid);
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, MIN_GUEST_VISIBLE_MS);
    void promise.then(() => {
      this.store.ingest({
        harness: HARNESS,
        type: "guest_left",
        guestKey: sid,
        hostKey,
      });
    });
  }
}
