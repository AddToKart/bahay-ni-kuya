/**
 * OpenCode watcher: reads opencode's own SQLite DB (read-only) to produce Agent House
 * events. opencode 1.18.35's TUI plugin context exposes no event bus (verified by probe:
 * `Event`/`session` are absent from the setup context), so the plugin route yields nothing.
 * The DB is written by opencode itself and gives sessions, parent links, titles, tool parts
 * and activity timestamps with zero changes to the harness.
 *
 * Safety: read-only connection, time-bounded indexed queries, every failure swallowed and
 * retried later. Nothing is ever written back.
 */
import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { log } from "./log";
import type { Store } from "./store";

const DB_PATH = join(homedir(), ".local", "share", "opencode", "opencode.db");
const POLL_MS = 3_000;
const ACTIVE_MS = 6_000; // recent DB write => working
const EPISODE_GRACE_MS = 15_000; // sessions updated just before the scan noticed the process
const MAX_SESSIONS = 24;
const TOOL_LOOKBACK_MS = 120_000;

interface SessionRow {
  id: string;
  parent_id: string | null;
  title: string | null;
  directory: string | null;
  time_created: number;
  time_updated: number;
}

interface ToolRow {
  data: string;
  time_updated: number;
}

export function startOpenCodeWatcher(store: Store): void {
  let db: Database | null = null;
  let wasRunning = false;
  let episodeStart = 0;
  let failLogged = false;
  const known = new Set<string>();
  const lastToolSent = new Map<string, number>();

  const connection = (): Database | null => {
    if (db) return db;
    try {
      db = new Database(DB_PATH, { readonly: true, create: false });
      db.exec("PRAGMA busy_timeout = 750");
      failLogged = false;
      return db;
    } catch (err) {
      if (!failLogged) log("opencode-db: open failed", String(err));
      failLogged = true;
      db = null;
      return null;
    }
  };

  const reset = (): void => {
    wasRunning = false;
    episodeStart = 0;
    known.clear();
    lastToolSent.clear();
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
      db = null;
    }
  };

  const tick = (): void => {
    try {
      const snapshot = store.snapshot();
      const opencode = snapshot.harnesses.find((h) => h.name === "opencode");
      if (!opencode?.running) {
        if (wasRunning) reset();
        return;
      }
      if (!wasRunning) {
        wasRunning = true;
        episodeStart = Date.now() - EPISODE_GRACE_MS;
      }
      const database = connection();
      if (!database) return;

      const now = Date.now();
      const discover = database
        .query(
          `select id, parent_id, title, directory, time_created, time_updated
             from session
            where time_archived is null and time_updated >= ?
            order by time_updated desc
            limit ?`,
        )
        .all(episodeStart, MAX_SESSIONS) as SessionRow[];
      for (const row of discover) known.add(row.id);
      if (known.size > MAX_SESSIONS) {
        const keep = new Set(discover.map((row) => row.id));
        for (const id of known) if (!keep.has(id)) known.delete(id);
      }
      if (known.size === 0) return;

      const ids = [...known];
      const placeholders = ids.map(() => "?").join(",");
      const sessions = database
        .query(
          `select id, parent_id, title, directory, time_created, time_updated
             from session where id in (${placeholders}) order by time_updated desc`,
        )
        .all(...ids) as SessionRow[];

      const latestPart = database.query(
        `select max(time_updated) as ts from part where session_id = ? and time_updated >= ?`,
      );
      const latestTool = database.query(
        `select data, time_updated from part
          where session_id = ? and time_updated >= ?
            and json_extract(data, '$.type') = 'tool'
          order by time_updated desc limit 1`,
      );

      for (const row of sessions) {
        const partTs = (latestPart.get(row.id, now - 60_000) as { ts: number | null } | null)?.ts ?? 0;
        const lastActivity = Math.max(row.time_updated, partTs);
        const working = now - lastActivity < ACTIVE_MS;

        store.ingest(
          {
            harness: "opencode",
            sessionId: row.id,
            parentSessionId: row.parent_id ?? undefined,
            type: "session_start",
            state: working ? "working" : "idle",
            title: row.title ?? undefined,
            directory: row.directory ?? undefined,
          },
          now,
        );
        store.ingest(
          { harness: "opencode", sessionId: row.id, type: "state", state: working ? "working" : "idle" },
          now,
        );

        const tool = latestTool.get(row.id, now - TOOL_LOOKBACK_MS) as ToolRow | null;
        if (tool && tool.time_updated > (lastToolSent.get(row.id) ?? 0)) {
          lastToolSent.set(row.id, tool.time_updated);
          try {
            const data = JSON.parse(tool.data) as { tool?: unknown; state?: { status?: unknown } };
            const name = typeof data.tool === "string" ? data.tool : undefined;
            const status = typeof data.state?.status === "string" ? data.state.status : "";
            if (name && (status === "running" || status === "completed" || status === "")) {
              store.ingest({ harness: "opencode", sessionId: row.id, type: "tool", tool: name }, now);
            }
          } catch {
            // malformed part data: ignore, next part will do
          }
        }
      }
    } catch (err) {
      const message = String(err);
      if (!failLogged) log("opencode-db: tick failed (will retry silently)", message);
      failLogged = true;
      try {
        db?.close();
      } catch {
        // ignore
      }
      db = null;
    }
  };

  setInterval(tick, POLL_MS);
}
