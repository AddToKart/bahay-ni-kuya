import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Store } from "./store";
import { checkInstalled, scanProcesses } from "./scan";
import { startOpenCodeWatcher } from "./opencode-db";
import { log, logTail } from "./log";
import { INSTALLED_REFRESH_MS, SCAN_MS, type IngestEvent } from "./types";
import { mergeCodexHooks } from "../scripts/install-adapters";

const PORT = Number(process.env.BAHAY_NI_KUYA_PORT ?? 4777);
const HOST = process.env.BAHAY_NI_KUYA_HOST ?? "127.0.0.1";

interface WsLike {
  send(data: string): void;
}

function isIngestEvent(value: unknown): value is IngestEvent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.harness === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.type === "string"
  );
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

function broadcast(force = false): void {
  const snapshot = store.snapshot(Date.now());
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
    if (pid) log(`port ${PORT} is owned by PID ${pid}`);
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
      if (req.method === "GET" && url.pathname === "/state") return jsonResponse(store.snapshot(Date.now()));
      if (req.method === "GET" && url.pathname === "/debug") {
        return jsonResponse({ ...store.snapshot(Date.now()), log: logTail(80) });
      }
      if (req.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });

      if (req.method === "GET") {
        const staticResponse = await serveStatic(url.pathname);
        if (staticResponse) return staticResponse;
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
startOpenCodeWatcher(store);

process.on("SIGINT", () => {
  log("shutting down");
  process.exit(0);
});

const installed = store
  .snapshot()
  .harnesses.filter((h) => h.installed)
  .map((h) => h.name)
  .join(", ");
log(`Bahay ni Kuya listening on http://localhost:${PORT} (${server.port})`);
log(`installed harnesses: ${installed || "none"}`);
