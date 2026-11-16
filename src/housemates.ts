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
  state: "arriving" | "idle" | "working" | "blocked" | "in_confession" | "called" | "evicting";
  guests: string[];
  cost: number;
  tokens?: TokenUsage;
  createdAt: number;
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
    if (this.recs.size >= CAP) throw new Error(`housemate cap reached (${CAP})`);
    const name = input.name.trim();
    const agent = input.agent.trim();
    if (!name) throw new Error("name required");
    if (!agent) throw new Error("agent required");
    if (!input.model?.modelID || !input.model.providerID) throw new Error("model required");

    const cwd = validateCwd(input.projectRoot?.trim() ? input.projectRoot : process.cwd());
    if (!cwd.ok || !cwd.path) throw new Error(cwd.error ?? "project root is not allowlisted");

    const client = await this.start();
    const key = `hm_${slug(name)}_${Date.now().toString(36).slice(-4)}`;
    const created = this.createWorktree(cwd.path, key, name);
    const directory = created.worktree ?? cwd.path;

    const session = await client.createSession({
      directory,
      title: name,
      agent,
      model: {
        id: input.model.modelID,
        providerID: input.model.providerID,
        ...(input.model.variant ? { variant: input.model.variant } : {}),
      },
      ...(input.permissions
        ? {
            permission: Object.entries(input.permissions).map(([permission, action]) => ({
              permission,
              pattern: "*",
              action,
            })),
          }
        : {}),
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
    });

    const timer = setTimeout(() => {
      rec.state = "idle";
      this.store.ingest({ harness: HARNESS, type: "housemate_arrived", sessionId: session.id, housemateKey: key });
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
    if (client) await client.abort(rec.sessionId, rec.directory).catch(() => false);

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

    this.store.ingest({ harness: HARNESS, type: "housemate_evicted", sessionId: rec.sessionId, housemateKey: key });
    this.recs.delete(key);
    this.sessionToKey.delete(rec.sessionId);
    this.activeTurns.delete(key);
    for (const guest of rec.guests) this.guestHost.delete(guest);
    const timer = this.arrivedTimers.get(key);
    clearTimeout(timer);
    this.arrivedTimers.delete(key);

    audit("kuya", "evict", key, { worktree: rec.worktree, branch: rec.branch, diffStat: diffStat || "(clean)" });
    return { worktree: rec.worktree, branch: rec.branch, diffStat };
  }

  async call(key: string, message: string, when: "after-turn" | "interrupt"): Promise<void> {
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
  async answer(questionId: string, answer: { option?: number; text?: string }): Promise<boolean> {
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
      ok = await client.replyPermission(route.requestId, reply);
    } else {
      const labels = route.options ?? [];
      const value =
        typeof answer.option === "number" && labels[answer.option]
          ? labels[answer.option]
          : (answer.text ?? "");
      ok = await client.replyQuestion(route.requestId, [[value]]);
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

  getUsage(key: string): { available: boolean; cost?: number; tokens?: TokenUsage } {
    const rec = this.recs.get(key);
    if (!rec) return { available: false };
    if (rec.tokens || typeof rec.cost === "number") {
      return { available: true, cost: rec.cost, tokens: rec.tokens };
    }
    return { available: false };
  }

  private async sendMessage(rec: HousemateRec, text: string): Promise<void> {
    const client = this.supervisor.client;
    if (!client) throw new Error("opencode server not ready");
    this.callActive.set(rec.key, Date.now() + 120_000);
    rec.state = "called";
    this.store.ingest({ harness: HARNESS, type: "kuya_call", sessionId: rec.sessionId, housemateKey: rec.key });
    this.store.ingest({
      harness: HARNESS,
      type: "chat_message",
      sessionId: rec.sessionId,
      role: "kuya",
      text,
    });
    // The blocking prompt resolves when the turn completes; the event stream drives the house
    // state, so the request itself is fire-and-forget.
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
    while (this.promptQueue.length > 0 && this.activeTurns.size < MAX_CONCURRENT_TURNS) {
      const next = this.promptQueue.shift();
      if (!next) break;
      const rec = this.recs.get(next.key);
      if (!rec) continue;
      void this.sendMessage(rec, next.message).catch(() => undefined);
    }
  }

  private createWorktree(root: string, key: string, name: string): {
    worktree?: string;
    branch?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const inside = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
    });
    if (inside.status !== 0) throw new Error("project root is not a git repository; refusing to run outside a worktree");
    const dirty = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
    if (dirty.stdout.trim()) warnings.push("main worktree has uncommitted changes");

    const branch = `kuya/${slug(name)}-${key.slice(-4)}`;
    const worktree = join(root, ".kuya-worktrees", key);
    if (existsSync(worktree)) throw new Error(`worktree already exists: ${worktree}`);
    const add = spawnSync("git", ["-C", root, "worktree", "add", "-b", branch, worktree, "HEAD"], {
      encoding: "utf8",
    });
    if (add.status !== 0) {
      throw new Error(`git worktree add failed: ${(add.stderr || add.stdout || "").trim()}`);
    }
    return { worktree, branch, warnings };
  }

  private gitDiffStat(worktree: string): string {
    const res = spawnSync("git", ["-C", worktree, "diff", "--stat"], { encoding: "utf8" });
    return (res.stdout || "").trim();
  }

  private onEvent(event: OpenCodeEvent): void {
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
          this.store.ingest({ harness: HARNESS, type: "guest_arrived", guestKey: info.id, hostKey: info.parentID });
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
        const status = p.status as { type?: string; message?: string } | undefined;
        if (!sid || !status) break;
        const key = this.sessionToKey.get(sid);
        if (status.type === "busy") {
          if (key) {
            const rec = this.recs.get(key);
            if (rec) rec.state = "working";
            this.activeTurns.add(key);
            this.store.ingest({ harness: HARNESS, type: "task_started", sessionId: sid, title: key });
          }
        } else if (status.type === "idle") {
          if (key) {
            const rec = this.recs.get(key);
            if (rec) rec.state = "idle";
            this.activeTurns.delete(key);
            this.callActive.delete(key);
            this.store.ingest({ harness: HARNESS, type: "task_completed", sessionId: sid });
            this.drainQueue();
          } else if (this.guestHost.has(sid)) {
            this.scheduleGuestLeft(sid);
          }
        } else if (status.type === "retry" && key) {
          this.store.ingest({
            harness: HARNESS,
            type: "error",
            sessionId: sid,
            error: status.message ?? "retry",
          });
        }
        break;
      }
      case "session.idle": {
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        if (!sid) break;
        const key = this.sessionToKey.get(sid);
        if (key) {
          this.activeTurns.delete(key);
          this.callActive.delete(key);
          this.store.ingest({ harness: HARNESS, type: "task_completed", sessionId: sid });
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
          this.store.ingest({ harness: HARNESS, type: "session_end", sessionId: sid });
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
        const part = p.part as { type?: string; tool?: string; text?: string } | undefined;
        const sid = typeof p.sessionID === "string" ? p.sessionID : "";
        if (!part || !sid) break;
        if (part.type === "tool" && part.tool) {
          this.store.ingest({ harness: HARNESS, type: "tool", sessionId: sid, tool: part.tool });
        } else if (part.type === "text" && part.text) {
          const key = this.sessionToKey.get(sid);
          const activeUntil = key ? (this.callActive.get(key) ?? 0) : 0;
          if (key && Date.now() < activeUntil) {
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
        const meta = p.metadata as { command?: string } | undefined;
        const text = meta?.command ? `Bash: ${meta.command}` : `Permission: ${String(p.permission ?? "request")}`;
        this.questions.set(id, { kind: "permission", requestId: id, sessionId: sid });
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
        const first = questions[0] as { question?: string; options?: Array<{ label?: string }> } | undefined;
        if (!first?.question) break;
        const options = (first.options ?? [])
          .map((option) => option.label)
          .filter((label): label is string => typeof label === "string");
        this.questions.set(id, { kind: "question", requestId: id, sessionId: sid, options });
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
        const answers = Array.isArray(p.answers) ? p.answers.flat().join(", ") : undefined;
        if (id) this.store.ingest({ harness: HARNESS, type: "question_answered", id, text: answers });
        break;
      }
      case "permission.replied": {
        const id = typeof p.requestID === "string" ? p.requestID : "";
        if (id) this.store.ingest({ harness: HARNESS, type: "question_answered", id });
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
      this.store.ingest({ harness: HARNESS, type: "guest_left", guestKey: sid, hostKey });
    });
  }
}
