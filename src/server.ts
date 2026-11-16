import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Store } from "./store";
import { checkInstalled, scanProcesses } from "./scan";
import { log, logTail } from "./log";
import { INSTALLED_REFRESH_MS, SCAN_MS, HARNESSES, type IngestEvent } from "./types";
import { mergeCodexHooks } from "../scripts/install-adapters";
import { saveLayout } from "./layout";
import {
  isAllowedHostAndOrigin,
  isAuthenticated,
  getOrCreateToken,
  validateCwd,
  getAllowlistedRoots,
} from "./security";
import { Dispatcher } from "./dispatcher";
import { Housemates } from "./housemates";
import { Houses } from "./houses";
import { OpenCodeSupervisor } from "./opencode-supervisor";
import { CollabManager } from "./collab";
import { RateLimiter } from "./ratelimit";
import { audit, auditTail } from "./audit";

const PORT = Number(process.env.BAHAY_NI_KUYA_PORT ?? 4777);
const HOST = process.env.BAHAY_NI_KUYA_HOST ?? "127.0.0.1";

interface WsLike {
  send(data: string): void;
}

function isIngestEvent(value: unknown): value is IngestEvent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string") return false;
  const base = typeof record.harness === "string" && typeof record.sessionId === "string";
  const keyed =
    typeof record.housemateKey === "string" ||
    typeof record.guestKey === "string" ||
    typeof record.id === "string";
  return base || keyed;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Hermes outbound webhooks post their own payload shape:
 * { hook_event_name, profile, tool_name, tool_input, session_id, cwd, extra, delivery_id, timestamp }.
 * Map it onto the Bahay ni Kuya contract. Unknown events are accepted and ignored (hooks are
 * fire-and-forget; a 4xx would only produce noise in the harness).
 */
function mapHermesPayload(value: unknown): IngestEvent[] {
  if (typeof value !== "object" || value === null) return [];
  const raw = value as Record<string, unknown>;
  const event = asString(raw.hook_event_name);
  const extra = typeof raw.extra === "object" && raw.extra !== null ? (raw.extra as Record<string, unknown>) : {};
  const childId = asString(extra.child_session_id) ?? asString(extra.subagent_id);
  const parentId = asString(extra.parent_session_id) ?? asString(raw.parent_session_id);
  const sessionId = asString(raw.session_id) ?? childId;
  if (!event || !sessionId) return [];
  const tool = asString(raw.tool_name);
  const directory = asString(raw.cwd) ?? undefined;
  const base = { harness: "hermes", directory } as const;

  switch (event) {
    case "on_session_start":
      return [{ ...base, sessionId, type: "session_start", state: "idle" }];
    case "on_session_end":
      return [{ ...base, sessionId, type: "session_end" }];
    case "pre_llm_call":
    case "agent_start":
      return [{ ...base, sessionId, type: "state", state: "working" }];
    case "post_llm_call":
    case "agent_end":
      return [{ ...base, sessionId, type: "state", state: "idle" }];
    case "pre_tool_call":
    case "post_tool_call":
      return [{ ...base, sessionId, type: "tool", tool }];
    case "subagent_start": {
      const child = childId ?? `subagent:${sessionId}:${asString(extra.subagent_index) ?? "0"}`;
      return [
        { ...base, sessionId, type: "state", state: "working" },
        {
          ...base,
          sessionId: child,
          parentSessionId: parentId ?? sessionId,
          type: "session_start",
          state: "working",
          title: asString(extra.description) ?? asString(extra.task) ?? "subagent",
        },
      ];
    }
    case "subagent_stop": {
      const child = childId ?? `subagent:${sessionId}:${asString(extra.subagent_index) ?? "0"}`;
      return [{ ...base, sessionId: child, type: "session_end" }];
    }
    default:
      return [];
  }
}

const store = new Store();
const dispatcher = new Dispatcher(store);
const supervisor = new OpenCodeSupervisor();
const housemates = new Housemates(store, supervisor);
const collab = new CollabManager(store, housemates, supervisor);

collab.onAnnounce = () => scheduleBroadcast();

housemates.isSessionInCollab = (sid) => collab.isSessionInCollab(sid);
housemates.getCollabState = (sid) => collab.getMemberCollabState(sid);

housemates.onSessionIdle = async (sid) => {
  const handled = await collab.handleSessionIdle(sid, "");
  if (handled) scheduleBroadcast();
  return handled;
};

housemates.onTaskCompleted = (taskId, exitCode) => {
  dispatcher.completeExternalTask(taskId, exitCode);
  scheduleBroadcast();
};

dispatcher.onCancel = (taskId) => {
  const sid = housemates.getSessionIdForTask(taskId);
  if (sid) {
    void housemates.abortSession(sid);
  }
};
const houses = new Houses();
const limiter = new RateLimiter();
const clients = new Set<WsLike>();
const transpiler = new Bun.Transpiler({ loader: "ts" });
const jsCache = new Map<string, { mtime: number; js: string }>();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function serveStatic(pathname: string): Promise<Response | null> {
  if (pathname.includes("..") || pathname.includes("\0")) return null;
  const rel = pathname === "/" ? "/index.html" : pathname;
  if (!/^\/[A-Za-z0-9._\-/]+$/.test(rel)) return null;

  if (rel.endsWith(".js")) {
    const tsPath = `public${rel.slice(0, -3)}.ts`;
    const tsFile = Bun.file(tsPath);
    if (await tsFile.exists()) {
      const mtime = tsFile.lastModified;
      const cached = jsCache.get(tsPath);
      if (cached && cached.mtime === mtime) {
        return new Response(cached.js, {
          headers: { "content-type": MIME[".js"], "cache-control": "no-store" },
        });
      }
      try {
        const js = transpiler.transformSync(await tsFile.text());
        jsCache.set(tsPath, { mtime, js });
        return new Response(js, {
          headers: { "content-type": MIME[".js"], "cache-control": "no-store" },
        });
      } catch (err) {
        log("static: transpile failed", { tsPath, error: String(err) });
        return new Response(`console.error(${JSON.stringify(String(err))})`, {
          headers: { "content-type": MIME[".js"] },
        });
      }
    }
  }

  const file = Bun.file(`public${rel}`);
  if (!(await file.exists())) return null;
  const ext = rel.slice(rel.lastIndexOf("."));
  return new Response(file, {
    headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" },
  });
}

let lastSignature = "";

function fullSnapshot(): object {
  const snap = store.snapshot(Date.now());
  return {
    ...snap,
    houses: houses.list(),
    collabTasks: collab.getTasks(),
    activeCollab: collab.getActiveTask(),
  };
}

function broadcast(force = false): void {
  const snapshot = fullSnapshot() as ReturnType<typeof store.snapshot> & { houses: unknown };
  const signature = JSON.stringify({ harnesses: snapshot.harnesses, sessions: snapshot.sessions });
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  const payload = JSON.stringify(snapshot);
  for (const ws of clients) {
    try {
      ws.send(payload);
    } catch {
      clients.delete(ws);
    }
  }
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBroadcast(): void {
  if (pendingTimer) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    broadcast(false);
  }, 60);
}

let scanning = false;

async function scanTick(): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    const procs = await scanProcesses();
    if (procs) {
      store.applyScan(procs, Date.now());
      scheduleBroadcast();
    }
  } catch (err) {
    log("scan tick failed", String(err));
  } finally {
    scanning = false;
  }
}

async function installedTick(): Promise<void> {
  try {
    store.setInstalled(await checkInstalled());
    scheduleBroadcast();
  } catch (err) {
    log("installed check failed", String(err));
  }
}

function reportPortOwner(): void {
  try {
    const proc = Bun.spawnSync([
      "powershell.exe",
      "-NoProfile",
      "-Command",
      `(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`,
    ]);
    const pid = new TextDecoder().decode(proc.stdout).trim();
    if (pid) log(`port ${PORT} is owned by PID ${pid}. Run 'bun run clean-port' or terminate PID ${pid} to free it.`);
  } catch {
    /* best effort */
  }
}

function checkCodexHooks(): void {
  try {
    const hooksPath = join(homedir(), ".codex", "hooks.json");
    if (!existsSync(hooksPath)) return;
    const content = readFileSync(hooksPath, "utf8");
    if (!content.includes("bahay-codex")) {
      log("Orca or user updated ~/.codex/hooks.json without bahay-codex; re-merging...");
      const cmdPath = join(homedir(), ".bahay-ni-kuya", "adapters", "codex", "bahay-codex.cmd").replace(/\\/g, "/");
      const config = JSON.parse(content);
      const merged = mergeCodexHooks(config, cmdPath);
      if (merged.added.length > 0) {
        writeFileSync(hooksPath, JSON.stringify(merged.config, null, 2) + "\n");
        log(`re-merged ${merged.added.length} codex hook(s) into ~/.codex/hooks.json`);
      }
    }
  } catch (err) {
    log("codex hooks check failed", String(err));
  }
}

checkCodexHooks();
store.setInstalled(await checkInstalled());
await scanTick();

let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
    port: PORT,
    hostname: HOST,
    maxRequestBodySize: 64 * 1024,
    async fetch(req, srv) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        if (srv.upgrade(req, { data: {} })) return;
        return new Response("websocket upgrade failed", { status: 400 });
      }
      if (req.method === "POST" && url.pathname === "/event") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }
        if (!isIngestEvent(body)) return new Response("bad event shape", { status: 400 });
        const result = store.ingest(body);
        if (!result.ok) return jsonResponse({ ok: false, error: result.reason }, 400);
        scheduleBroadcast();
        return new Response(null, { status: 204 });
      }
      if (req.method === "POST" && url.pathname === "/event/hermes") {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const mapped = mapHermesPayload(body);
        for (const event of mapped) store.ingest(event);
        if (mapped.length > 0) scheduleBroadcast();
        return new Response(null, { status: 204 });
      }
      if (req.method === "GET" && url.pathname === "/healthz") return jsonResponse({ ok: true, port: PORT });
      if (req.method === "GET" && url.pathname === "/state") return jsonResponse(fullSnapshot());
      if (req.method === "GET" && url.pathname === "/debug") {
        return jsonResponse({ ...fullSnapshot(), log: logTail(80) });
      }
      if (req.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });

      // --- Security & API Gate ---
      if (url.pathname.startsWith("/api/")) {
        // Enforce loopback Host and Origin validation
        if (!isAllowedHostAndOrigin(req)) {
          return jsonResponse({ error: "Forbidden: invalid Host or Origin header" }, 403);
        }

        // Token bootstrap for same-origin browser client
        if (req.method === "GET" && url.pathname === "/api/auth/token") {
          return jsonResponse({ token: getOrCreateToken() });
        }

        // Allowlisted roots for project selection
        if (req.method === "GET" && url.pathname === "/api/roots") {
          return jsonResponse({ roots: getAllowlistedRoots() });
        }

        // Rate-limit every mutating control call (Rule 7).
        if (req.method !== "GET") {
          const gate = limiter.take(`${req.method} ${url.pathname}`);
          if (!gate.ok) {
            return new Response(JSON.stringify({ error: "rate limited" }), {
              status: 429,
              headers: {
                "content-type": "application/json",
                "retry-after": String(Math.max(1, Math.ceil(gate.retryAfterMs / 1000))),
              },
            });
          }
        }

        // --- Houses: global + project house management ---
        if (url.pathname === "/api/houses" || url.pathname.startsWith("/api/houses/")) {
          if (req.method === "GET" && url.pathname === "/api/houses") {
            return jsonResponse({ houses: houses.list() });
          }
          if (!isAuthenticated(req)) {
            return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          }
          if (req.method === "POST" && url.pathname === "/api/houses") {
            let body: Record<string, unknown>;
            try {
              body = (await req.json()) as Record<string, unknown>;
            } catch {
              return jsonResponse({ error: "Bad json" }, 400);
            }
            const root = typeof body.root === "string" ? body.root.trim() : "";
            if (!root) return jsonResponse({ error: "root is required" }, 400);
            const cwdCheck = validateCwd(root);
            if (!cwdCheck.ok) return jsonResponse({ error: cwdCheck.error }, 400);
            try {
              const house = houses.create(cwdCheck.path!);
              const payload = JSON.stringify({ type: "house_opened", houseId: house.id, label: house.label });
              for (const ws of clients) {
                try { ws.send(payload); } catch { clients.delete(ws); }
              }
              scheduleBroadcast();
              return jsonResponse({ house }, 201);
            } catch (err) {
              return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
            }
          }
          const houseDeleteMatch = url.pathname.match(/^\/api\/houses\/([^/]+)$/);
          if (req.method === "DELETE" && houseDeleteMatch) {
            const houseId = decodeURIComponent(houseDeleteMatch[1]);
            const house = houses.get(houseId);
            if (!house) return jsonResponse({ error: "house not found" }, 404);
            const closed = houses.close(houseId);
            if (!closed) return jsonResponse({ error: "house not found" }, 404);
            const payload = JSON.stringify({ type: "house_closed", houseId, label: house.label });
            for (const ws of clients) {
              try { ws.send(payload); } catch { clients.delete(ws); }
            }
            scheduleBroadcast();
            return jsonResponse({ ok: true });
          }
          return jsonResponse({ error: "not found" }, 404);
        }

        // --- Phase 4: real opencode housemates ---
        if (url.pathname === "/api/housemates" || url.pathname.startsWith("/api/housemates/")) {
          if (!isAuthenticated(req)) {
            return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          }
          if (req.method === "GET" && url.pathname === "/api/housemates") {
            return jsonResponse({ housemates: housemates.list(), cap: 6 });
          }
          if (req.method === "POST" && url.pathname === "/api/housemates") {
            let body: Record<string, unknown>;
            try {
              body = (await req.json()) as Record<string, unknown>;
            } catch {
              return jsonResponse({ error: "Bad json" }, 400);
            }
            const rawModel = body.model;
            const model =
              rawModel && typeof rawModel === "object"
                ? {
                    providerID: "providerID" in rawModel && typeof rawModel.providerID === "string" ? rawModel.providerID : "",
                    modelID: "modelID" in rawModel && typeof rawModel.modelID === "string" ? rawModel.modelID : "",
                    variant: "variant" in rawModel && typeof rawModel.variant === "string" ? rawModel.variant : undefined,
                  }
                : { providerID: "", modelID: "", variant: undefined };
            const name = typeof body.name === "string" ? body.name : "";
            const agent = typeof body.agent === "string" ? body.agent : "";
            const projectRoot = typeof body.projectRoot === "string" ? body.projectRoot : process.cwd();
            const houseId = typeof body.houseId === "string" ? body.houseId : undefined;
            const useWorktree = typeof body.useWorktree === "boolean" ? body.useWorktree : undefined;
            const autoApprove = typeof body.autoApprove === "boolean" ? body.autoApprove : undefined;
            const permissions =
              body.permissions && typeof body.permissions === "object"
                ? Object.fromEntries(
                    Object.entries(body.permissions).filter(
                      (entry): entry is [string, "ask" | "allow" | "deny"] =>
                        entry[1] === "ask" || entry[1] === "allow" || entry[1] === "deny",
                    ),
                  )
                : undefined;
            if (!name || !agent || !model.providerID || !model.modelID) {
              return jsonResponse({ error: "name, agent and model {providerID,modelID} are required" }, 400);
            }
            try {
              const result = await housemates.summon({
                name,
                agent,
                model,
                projectRoot,
                permissions,
                persona: typeof body.persona === "string" ? body.persona : undefined,
                houseId,
                useWorktree,
                autoApprove,
              });
              scheduleBroadcast();
              return jsonResponse(result, 201);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              return jsonResponse({ error: message }, /cap/i.test(message) ? 429 : 400);
            }
          }

          const inspectMatch = url.pathname.match(/^\/api\/housemates\/([^/]+)\/inspect$/);
          if (req.method === "GET" && inspectMatch) {
            const key = decodeURIComponent(inspectMatch[1]);
            const data = await housemates.getAgentInspection(key);
            if (!data) return jsonResponse({ error: `housemate not found: ${key}` }, 404);
            return jsonResponse(data);
          }

          const evictMatch = url.pathname.match(/^\/api\/housemates\/([^/]+)$/);
          if (req.method === "DELETE" && evictMatch) {
            try {
              const result = await housemates.evict(decodeURIComponent(evictMatch[1]));
              scheduleBroadcast();
              return jsonResponse({ ok: true, ...result });
            } catch (err) {
              return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
            }
          }

          const taskMatch = url.pathname.match(/^\/api\/housemates\/([^/]+)\/task$/);
          if (req.method === "POST" && taskMatch) {
            let body: Record<string, unknown>;
            try {
              body = (await req.json()) as Record<string, unknown>;
            } catch {
              return jsonResponse({ error: "Bad json" }, 400);
            }
            const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
            const cwd = typeof body.cwd === "string" ? body.cwd.trim() : undefined;
            if (!prompt) return jsonResponse({ error: "prompt is required" }, 400);
            try {
              const key = decodeURIComponent(taskMatch[1]);
              const result = await housemates.assignTask(key, prompt, cwd);
              const hm = housemates.get(key);
              dispatcher.recordExternalTask(
                result.taskId,
                "opencode",
                prompt,
                cwd || hm?.directory || "",
                hm?.name
              );
              scheduleBroadcast();
              return jsonResponse(result, 200);
            } catch (err) {
              return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
            }
          }

          const callMatch = url.pathname.match(/^\/api\/housemates\/([^/]+)\/call$/);
          if (req.method === "POST" && callMatch) {
            let body: Record<string, unknown>;
            try {
              body = (await req.json()) as Record<string, unknown>;
            } catch {
              return jsonResponse({ error: "Bad json" }, 400);
            }
            const message = typeof body.message === "string" ? body.message : "";
            const when = body.when === "interrupt" ? "interrupt" : "after-turn";
            if (!message) return jsonResponse({ error: "message required" }, 400);
            try {
              await housemates.call(decodeURIComponent(callMatch[1]), message, when);
              scheduleBroadcast();
              return new Response(null, { status: 202 });
            } catch (err) {
              return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
            }
          }

          const dismissMatch = url.pathname.match(/^\/api\/housemates\/([^/]+)\/dismiss$/);
          if (req.method === "POST" && dismissMatch) {
            try {
              await housemates.dismissCall(decodeURIComponent(dismissMatch[1]));
              scheduleBroadcast();
              return new Response(null, { status: 200 });
            } catch (err) {
              return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
            }
          }

          const answerMatch = url.pathname.match(/^\/api\/housemates\/([^/]+)\/answer$/);
          if (req.method === "POST" && answerMatch) {
            let body: Record<string, unknown>;
            try {
              body = (await req.json()) as Record<string, unknown>;
            } catch {
              return jsonResponse({ error: "Bad json" }, 400);
            }
            const questionId = typeof body.questionId === "string" ? body.questionId : "";
            if (!questionId) return jsonResponse({ error: "questionId required" }, 400);
            const option = typeof body.option === "number" ? body.option : undefined;
            const text = typeof body.text === "string" ? body.text : undefined;
            const answered = await housemates.answer(questionId, { option, text });
            if (answered) {
              scheduleBroadcast();
              return jsonResponse({ ok: true });
            }
            const fallback = store.answerQuestion(questionId, { option, text });
            if (fallback.ok) {
              scheduleBroadcast();
              return jsonResponse({ ok: true });
            }
            return jsonResponse({ error: "unknown question" }, 400);
          }

          const usageMatch = url.pathname.match(/^\/api\/housemates\/([^/]+)\/usage$/);
          if (req.method === "GET" && usageMatch) {
            return jsonResponse(housemates.getUsage(decodeURIComponent(usageMatch[1])));
          }

          return jsonResponse({ error: "not found" }, 404);
        }

        if (req.method === "GET" && url.pathname === "/api/opencode/agents") {
          if (!isAuthenticated(req)) return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          try {
            const client = await supervisor.ensure();
            return jsonResponse({ agents: await client.agents() });
          } catch (err) {
            return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 502);
          }
        }

        if (req.method === "GET" && url.pathname === "/api/opencode/models") {
          if (!isAuthenticated(req)) return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          try {
            const client = await supervisor.ensure();
            return jsonResponse({ models: await client.models() });
          } catch (err) {
            return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 502);
          }
        }

        if (req.method === "GET" && url.pathname === "/api/audit") {
          if (!isAuthenticated(req)) return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          const limit = Number(url.searchParams.get("limit") ?? 100);
          return jsonResponse({ lines: auditTail(Number.isFinite(limit) ? limit : 100) });
        }

        // Dev layout editor save: furniture layers only, loopback + bearer token enforced.
        if (req.method === "POST" && url.pathname === "/api/layout/save") {
          if (!isAuthenticated(req)) return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          const text = await req.text();
          if (text.length > 1_000_000) return jsonResponse({ error: "Payload too large" }, 413);
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            return jsonResponse({ error: "Bad json" }, 400);
          }
          try {
            const props = typeof body === "object" && body !== null ? (body as { props?: unknown }).props : undefined;
            const result = saveLayout(props);
            log(`layout saved: ${result.props} props, backup ${result.backup}`);
            return jsonResponse(result);
          } catch (error) {
            return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
          }
        }

        // --- Phase 2: confession answers + demo-only simulation (Bearer + Host/Origin) ---
        if (url.pathname.startsWith("/api/confession/")) {
          if (!isAuthenticated(req)) {
            return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          }
          if (req.method === "POST" && url.pathname === "/api/confession/answer") {
            let body: any;
            try {
              body = await req.json();
            } catch {
              return jsonResponse({ error: "Bad json" }, 400);
            }
            const questionId = typeof body?.questionId === "string" ? body.questionId : undefined;
            if (!questionId) return jsonResponse({ error: "questionId required" }, 400);
            const hasOption = typeof body.option === "number";
            const hasText = typeof body.text === "string" && body.text.trim().length > 0;
            if (!hasOption && !hasText) return jsonResponse({ error: "option or text required" }, 400);
            const result = store.answerQuestion(questionId, {
              option: hasOption ? body.option : undefined,
              text: hasText ? body.text : undefined,
            });
            if (!result.ok) return jsonResponse({ error: result.reason ?? "answer failed" }, 400);
            scheduleBroadcast();
            return jsonResponse({ ok: true, promoted: result.promoted?.id ?? null });
          }
          if (req.method === "POST" && url.pathname === "/api/confession/skip") {
            let body: any;
            try {
              body = await req.json();
            } catch {
              return jsonResponse({ error: "Bad json" }, 400);
            }
            const questionId = typeof body?.questionId === "string" ? body.questionId : undefined;
            if (!questionId) return jsonResponse({ error: "questionId required" }, 400);
            const result = store.skipQuestion(questionId);
            scheduleBroadcast();
            return jsonResponse({ ok: result.ok, promoted: result.promoted?.id ?? null });
          }
          return jsonResponse({ error: "not found" }, 404);
        }

        // Demo-only simulation endpoint: lets the console buttons drive the fake Phase 2 flow.
        // P4 replaces this with real control endpoints; it accepts only v2 event names.
        if (req.method === "POST" && url.pathname === "/api/simulate") {
          if (!isAuthenticated(req)) {
            return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          }
          const SIMULATABLE: Record<string, true> = {
            housemate_summoned: true,
            housemate_arrived: true,
            housemate_evict_started: true,
            housemate_evicted: true,
            question_asked: true,
            question_answered: true,
            kuya_call: true,
            kuya_call_ended: true,
            chat_message: true,
            guest_arrived: true,
            guest_left: true,
          };
          let body: Record<string, unknown>;
          try {
            body = (await req.json()) as Record<string, unknown>;
          } catch {
            return jsonResponse({ error: "Bad json" }, 400);
          }
          if (!body || typeof body.type !== "string" || SIMULATABLE[body.type] !== true) {
            return jsonResponse({ error: "unsupported simulate type" }, 400);
          }
          const result = store.ingest({
            ...body,
            harness: typeof body.harness === "string" ? body.harness : "opencode",
            sessionId:
              typeof body.sessionId === "string"
                ? body.sessionId
                : typeof body.housemateKey === "string"
                  ? body.housemateKey
                  : typeof body.guestKey === "string"
                    ? body.guestKey
                    : "sim",
          });
          if (!result.ok) return jsonResponse({ error: result.reason ?? "simulate failed" }, 400);
          scheduleBroadcast();
          return new Response(null, { status: 202 });
        }

        // Dispatcher endpoints require valid Bearer token
        if (url.pathname.startsWith("/api/tasks")) {
          if (!isAuthenticated(req)) {
            return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          }

          // POST /api/tasks { harness, prompt, cwd }
          if (req.method === "POST" && url.pathname === "/api/tasks") {
            let body: any;
            try {
              body = await req.json();
            } catch {
              return jsonResponse({ error: "Invalid JSON body" }, 400);
            }
            const { harness, prompt, cwd, callerHarness, caller_harness, depth, parentTaskId, parent_task_id } = body;
            if (!harness || !prompt) {
              return jsonResponse({ error: "harness and prompt are required" }, 400);
            }
            if (!HARNESSES.includes(harness)) {
              return jsonResponse({ error: `Unknown harness: ${harness}` }, 400);
            }
            const cwdValidation = validateCwd(cwd);
            if (!cwdValidation.ok) {
              return jsonResponse({ error: cwdValidation.error }, 400);
            }

            if (body.housemateKey) {
              const hmKey = String(body.housemateKey);
              const hm = housemates.get(hmKey);
              if (hm) {
                try {
                  const res = await housemates.assignTask(hmKey, prompt, cwdValidation.path!);
                  const record = dispatcher.recordExternalTask(res.taskId, "opencode", prompt, cwdValidation.path!);
                  scheduleBroadcast();
                  return jsonResponse(record, 201);
                } catch (err: any) {
                  return jsonResponse({ error: err.message || "Failed to submit task to housemate" }, 400);
                }
              }
            }

            try {
              const caller = callerHarness || caller_harness;
              const taskDepth = typeof depth === "number" ? depth : depth ? parseInt(depth, 10) : 0;
              const parentId = parentTaskId || parent_task_id;
              const task = dispatcher.submitTask(harness, prompt, cwdValidation.path!, caller, taskDepth, parentId);
              scheduleBroadcast();
              return jsonResponse(task, 201);
            } catch (err: any) {
              return jsonResponse({ error: err.message || "Failed to submit task" }, 400);
            }
          }

          // GET /api/tasks
          if (req.method === "GET" && url.pathname === "/api/tasks") {
            return jsonResponse(dispatcher.getTasks());
          }

          // POST /api/tasks/:id/cancel
          const cancelMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/cancel$/);
          if (req.method === "POST" && cancelMatch) {
            const taskId = cancelMatch[1];
            const canceled = dispatcher.cancelTask(taskId);
            scheduleBroadcast();
            return jsonResponse({ ok: canceled, status: canceled ? "canceled" : "failed_to_cancel" });
          }

          // GET /api/tasks/:id
          const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
          if (req.method === "GET" && taskMatch) {
            const taskId = taskMatch[1];
            const task = dispatcher.getTask(taskId);
            if (!task) return jsonResponse({ error: "Task not found" }, 404);
            return jsonResponse(task);
          }
        }

        // Collab (Lingguhang Hamon) endpoints
        if (url.pathname.startsWith("/api/collab")) {
          if (!isAuthenticated(req)) {
            return jsonResponse({ error: "Unauthorized: invalid or missing bearer token" }, 401);
          }

          // POST /api/collab/tasks
          if (req.method === "POST" && url.pathname === "/api/collab/tasks") {
            let body: any;
            try {
              body = await req.json();
            } catch {
              return jsonResponse({ error: "Invalid JSON body" }, 400);
            }
            const { goal, cwd, members, maxAttempts, rushMode, kuyaConfig } = body;
            try {
              const task = await collab.startTask({ goal, cwd, members, maxAttempts, rushMode, kuyaConfig });
              scheduleBroadcast();
              return jsonResponse(task, 201);
            } catch (err: any) {
              return jsonResponse({ error: err.message || "Failed to start collaboration task" }, 400);
            }
          }

          // GET /api/collab/tasks
          if (req.method === "GET" && url.pathname === "/api/collab/tasks") {
            return jsonResponse(collab.getTasks());
          }

          // POST /api/collab/tasks/:id/cancel
          const cancelCollabMatch = url.pathname.match(/^\/api\/collab\/tasks\/([^/]+)\/cancel$/);
          if (req.method === "POST" && cancelCollabMatch) {
            const taskId = cancelCollabMatch[1];
            const canceled = collab.cancelTask(taskId);
            scheduleBroadcast();
            return jsonResponse({ ok: canceled });
          }

          // POST /api/collab/tasks/:id/approve
          const approveCollabMatch = url.pathname.match(/^\/api\/collab\/tasks\/([^/]+)\/approve$/);
          if (req.method === "POST" && approveCollabMatch) {
            const taskId = approveCollabMatch[1];
            try {
              const task = collab.approveTask(taskId);
              scheduleBroadcast();
              return jsonResponse(task);
            } catch (err: any) {
              return jsonResponse({ error: err.message || "Failed to approve task" }, 400);
            }
          }

          // POST /api/collab/tasks/:id/retry
          const retryCollabMatch = url.pathname.match(/^\/api\/collab\/tasks\/([^/]+)\/retry$/);
          if (req.method === "POST" && retryCollabMatch) {
            const taskId = retryCollabMatch[1];
            let body: any = {};
            try {
              body = await req.json();
            } catch {}
            try {
              const task = await collab.retryTask(taskId, body.feedback);
              scheduleBroadcast();
              return jsonResponse(task);
            } catch (err: any) {
              return jsonResponse({ error: err.message || "Failed to retry task" }, 400);
            }
          }

          // POST /api/collab/tasks/:id/followup
          const followupCollabMatch = url.pathname.match(/^\/api\/collab\/tasks\/([^/]+)\/followup$/);
          if (req.method === "POST" && followupCollabMatch) {
            const taskId = followupCollabMatch[1];
            let body: any = {};
            try {
              body = await req.json();
            } catch {
              return jsonResponse({ error: "Invalid JSON body" }, 400);
            }
            if (!body.message) {
              return jsonResponse({ error: "Follow-up message is required" }, 400);
            }
            try {
              const task = await collab.followupTask(taskId, body.message, body.targetKey);
              scheduleBroadcast();
              return jsonResponse(task);
            } catch (err: any) {
              return jsonResponse({ error: err.message || "Failed to submit follow-up" }, 400);
            }
          }

          // GET /api/collab/tasks/:id
          const collabMatch = url.pathname.match(/^\/api\/collab\/tasks\/([^/]+)$/);
          if (req.method === "GET" && collabMatch) {
            const taskId = collabMatch[1];
            const task = collab.getTask(taskId);
            if (!task) return jsonResponse({ error: "Collaboration task not found" }, 404);
            return jsonResponse(task);
          }
        }
      }

      if (req.method === "GET" || req.method === "HEAD") {
        const staticResponse = await serveStatic(url.pathname);
        if (staticResponse) {
          if (req.method === "HEAD") {
            return new Response(null, { headers: staticResponse.headers, status: staticResponse.status });
          }
          return staticResponse;
        }
      }
      return new Response("not found", { status: 404 });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
        try {
          ws.send(JSON.stringify(store.snapshot(Date.now())));
        } catch {
          clients.delete(ws);
        }
      },
      message() {},
      close(ws) {
        clients.delete(ws);
      },
    },
  });
} catch (err) {
  log(`could not bind ${HOST}:${PORT}`, String(err));
  reportPortOwner();
  log(`set BAHAY_NI_KUYA_PORT to a free port, or stop the process above`);
  process.exit(1);
}

setInterval(() => {
  store.sweep(Date.now());
  broadcast(false);
}, 500);
setInterval(() => void scanTick(), SCAN_MS);
setInterval(() => void installedTick(), INSTALLED_REFRESH_MS);
setInterval(() => broadcast(true), 10_000);

const shutdown = async () => {
  log("shutting down");
  try {
    await housemates.stop();
  } catch {}
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.on("SIGBREAK", () => void shutdown());

const installed = store
  .snapshot()
  .harnesses.filter((h) => h.installed)
  .map((h) => h.name)
  .join(", ");
log(`Bahay ni Kuya listening on http://localhost:${PORT} (${server.port})`);
log(`installed harnesses: ${installed || "none"}`);
