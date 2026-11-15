// Bahay ni Kuya scene controller: snapshot reconciliation, walking, drawing, WS.

import {
  allocateSlots,
  doorPoint,
  drawScene,
  FLOOR_Y,
  CORRIDOR_Y,
  ROOMS,
  ROOM_IDS,
  legendAccent,
  type RoomId,
  type Slot,
  type SlotRequest,
} from "./rooms.js";
import {
  drawBubble,
  drawCharacter,
  drawLabel,
  drawParentLink,
  drawZzz,
  HARNESS_ORDER,
  MONO,
  SCENE_H,
  SCENE_W,
  truncateToWidth,
} from "./sprites.js";

// ---------------------------------------------------------------- snapshot types

interface HarnessView {
  name: string;
  installed: boolean;
  running: boolean;
  procs: number;
}

interface SessionView {
  harness: string;
  sessionId: string;
  parentId: string | null;
  state: "idle" | "working";
  title?: string;
  tool?: string;
  directory?: string;
  pid?: number;
  since: number;
  lastEventTs: number;
  source: "adapter" | "scan";
}

interface Snapshot {
  type: "snapshot";
  ts: number;
  harnesses: HarnessView[];
  sessions: SessionView[];
}

// ---------------------------------------------------------------- characters

interface Char {
  key: string;
  harness: string;
  parentKey: string | null;
  sub: boolean;
  sleeping: boolean;
  room: RoomId;
  label: string;
  working: boolean;
  tool: string | null;
  lastTool: string | null;
  bubbleUntil: number;
  directory?: string;
  pid?: number;
  instanceIndex: number;
  subagentCount: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  path: { x: number; y: number }[];
  facing: 1 | -1;
  walking: boolean;
  slotId: string | null;
}

const WALK_SPEED = 40; // px/s
const ARRIVE = 2; // px

const chars = new Map<string, Char>();
let allocation = new Map<string, Slot>();

function sessionKey(harness: string, sessionId: string): string {
  return `${harness}\u0000${sessionId}`;
}

function buildPath(
  fromX: number,
  fromY: number,
  fromRoom: RoomId,
  toX: number,
  toY: number,
  toRoom: RoomId,
): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = [];
  if (fromRoom !== toRoom) {
    const fromDoor = ROOMS[fromRoom].doorX;
    const toDoor = ROOMS[toRoom].doorX;
    path.push({ x: fromDoor, y: FLOOR_Y });
    path.push({ x: fromDoor, y: CORRIDOR_Y });
    path.push({ x: toDoor, y: CORRIDOR_Y });
    path.push({ x: toDoor, y: FLOOR_Y });
  }
  path.push({ x: toX, y: toY });
  return path;
}

interface Desired {
  key: string;
  harness: string;
  parentKey: string | null;
  sub: boolean;
  sleeping: boolean;
  room: RoomId;
  label: string;
  working: boolean;
  tool: string | null;
  directory?: string;
  pid?: number;
  instanceIndex: number;
}

function reconcile(snap: Snapshot, now: number): number {
  const byKey = new Map<string, SessionView>();
  for (const s of snap.sessions) byKey.set(sessionKey(s.harness, s.sessionId), s);

  const perHarness = new Map<string, number>();
  for (const s of snap.sessions) perHarness.set(s.harness, (perHarness.get(s.harness) ?? 0) + 1);

  const desired = new Map<string, Desired>();
  const harnessInstances = new Map<string, number>();

  for (const s of snap.sessions) {
    const key = sessionKey(s.harness, s.sessionId);
    const parent = s.parentId ? byKey.get(sessionKey(s.harness, s.parentId)) : undefined;
    const parentKey = parent ? sessionKey(parent.harness, parent.sessionId) : null;
    const sub = parentKey !== null;
    const title = (s.title ?? "").trim();
    const parentName = parent
      ? parent.source === "adapter" && parent.title
        ? parent.title
        : parent.harness
      : s.harness;
    const label = sub
      ? `↳ ${parentName}`
      : title
        ? title.toLowerCase().startsWith(s.harness.toLowerCase())
          ? title
          : `${s.harness} (${title})`
        : s.harness;

    let instanceIndex = 0;
    if (!sub) {
      instanceIndex = harnessInstances.get(s.harness) ?? 0;
      harnessInstances.set(s.harness, instanceIndex + 1);
    }

    desired.set(key, {
      key,
      harness: s.harness,
      parentKey,
      sub,
      sleeping: false,
      room: s.state === "working" ? "office" : "living",
      label,
      working: s.state === "working",
      tool: s.tool ?? null,
      directory: s.directory,
      pid: s.pid,
      instanceIndex,
    });
  }

  let sleepingCount = 0;
  for (const h of snap.harnesses) {
    const count = perHarness.get(h.name) ?? 0;
    if (h.installed && !h.running && count === 0) {
      sleepingCount += 1;
      desired.set(`harness:${h.name}`, {
        key: `harness:${h.name}`,
        harness: h.name,
        parentKey: null,
        sub: false,
        sleeping: true,
        room: "bedroom",
        label: h.name,
        working: false,
        tool: null,
        instanceIndex: 0,
      });
    } else if (h.running && count === 0) {
      desired.set(`ambient:${h.name}`, {
        key: `ambient:${h.name}`,
        harness: h.name,
        parentKey: null,
        sub: false,
        sleeping: false,
        room: "living",
        label: `${h.name} (ambient)`,
        working: false,
        tool: null,
        instanceIndex: 0,
      });
    }
  }

  // drop characters that no longer exist
  for (const key of [...chars.keys()]) if (!desired.has(key)) chars.delete(key);

  // deterministic slot allocation, keeping existing spots while the room matches
  const requests: SlotRequest[] = [];
  for (const d of desired.values()) {
    requests.push({ key: d.key, room: d.room, sub: d.sub, parentKey: d.sub ? d.parentKey : null });
  }
  const previous = new Map<string, Slot>();
  for (const [key, slot] of allocation) {
    const d = desired.get(key);
    if (!d) continue;
    // a companion spot is only valid while the session is still a subagent
    if (slot.id.includes(":sub-") && !d.sub) continue;
    previous.set(key, slot);
  }
  allocation = allocateSlots(previous, requests);

  for (const d of desired.values()) {
    const slot = allocation.get(d.key);
    if (!slot) continue;
    const targetX = slot.x;
    const targetY = slot.y;
    let c = chars.get(d.key);

    if (!c) {
      const door = doorPoint(d.room);
      const roomDef = ROOMS[d.room];
      let hash = 0;
      for (let i = 0; i < d.key.length; i += 1) hash = (hash * 31 + d.key.charCodeAt(i)) >>> 0;
      const spread = ((hash % 5) - 2) * 9;
      const spawnX = Math.min(
        Math.max(door.x + spread, roomDef.x + 18),
        roomDef.x + roomDef.w - 18,
      );
      c = {
        key: d.key,
        harness: d.harness,
        parentKey: d.parentKey,
        sub: d.sub,
        sleeping: d.sleeping,
        room: d.room,
        label: d.label,
        working: d.working,
        tool: d.tool,
        lastTool: null,
        bubbleUntil: 0,
        directory: d.directory,
        pid: d.pid,
        instanceIndex: d.instanceIndex,
        subagentCount: 0,
        x: spawnX,
        y: door.y,
        targetX,
        targetY,
        path: buildPath(spawnX, door.y, d.room, targetX, targetY, d.room),
        facing: 1,
        walking: true,
        slotId: slot.id,
      };
      chars.set(d.key, c);
    } else {
      c.label = d.label;
      c.working = d.working;
      c.tool = d.tool;
      c.directory = d.directory;
      c.pid = d.pid;
      c.instanceIndex = d.instanceIndex;

      const roomChanged = c.room !== d.room;
      const targetChanged = c.targetX !== targetX || c.targetY !== targetY;
      if (roomChanged) {
        c.path = buildPath(c.x, c.y, c.room, targetX, targetY, d.room);
        c.room = d.room;
      } else if (targetChanged) {
        c.path = buildPath(c.x, c.y, d.room, targetX, targetY, d.room);
      }
      c.targetX = targetX;
      c.targetY = targetY;
      c.slotId = slot.id;
      c.sleeping = d.sleeping;
      c.label = d.label;
      c.parentKey = d.parentKey;
      c.sub = d.sub;
    }

    c.working = d.working;
    c.tool = d.tool;

    if (c.working) {
      if (c.tool) {
        if (c.tool !== c.lastTool) {
          c.lastTool = c.tool;
          c.bubbleUntil = now + 4000;
        }
      } else {
        c.lastTool = null;
      }
    } else {
      c.lastTool = null;
      c.bubbleUntil = 0;
    }
  }

  // Recalculate subagent counts
  for (const c of chars.values()) c.subagentCount = 0;
  for (const c of chars.values()) {
    if (c.parentKey && chars.has(c.parentKey)) {
      chars.get(c.parentKey)!.subagentCount += 1;
    }
  }

  return sleepingCount;
}

// ---------------------------------------------------------------- movement

function step(c: Char, dt: number): void {
  let remaining = WALK_SPEED * dt;
  while (remaining > 0 && c.path.length > 0) {
    const wp = c.path[0];
    const dx = wp.x - c.x;
    const dy = wp.y - c.y;

    if (Math.abs(dx) <= ARRIVE && Math.abs(dy) <= ARRIVE) {
      c.x = wp.x;
      c.y = wp.y;
      c.path.shift();
      continue;
    }

    let moved = 0;
    if (Math.abs(dx) > 0.5) {
      const stepX = Math.sign(dx) * Math.min(Math.abs(dx), remaining);
      c.x += stepX;
      moved = Math.abs(stepX);
      if (moved > 0.01) c.facing = dx > 0 ? 1 : -1;
    } else if (Math.abs(dy) > 0.5) {
      const stepY = Math.sign(dy) * Math.min(Math.abs(dy), remaining);
      c.y += stepY;
      moved = Math.abs(stepY);
    }
    if (moved === 0) break;
    remaining -= moved;
  }
  c.walking = c.path.length > 0;
}

// ---------------------------------------------------------------- drawing

function typingDots(now: number): string {
  const dots = 1 + (Math.floor(now / 450) % 3);
  return ".".repeat(dots) + "\u00a0".repeat(3 - dots);
}

function paint(now: number, reduced: boolean): void {
  const occupied = new Set<RoomId>();
  for (const c of chars.values()) occupied.add(c.room);
  drawScene(ctx, { occupied });

  // subagent dashed tethers behind the characters
  for (const c of chars.values()) {
    if (!c.parentKey) continue;
    const parent = chars.get(c.parentKey);
    if (!parent) continue;
    drawParentLink(
      ctx,
      c.x,
      c.y - (c.sub ? 15 : 22),
      parent.x,
      parent.y - (parent.sub ? 15 : 22),
    );
  }

  const list = [...chars.values()].sort((a, b) => a.y - b.y || a.x - b.x || (a.key < b.key ? -1 : 1));
  for (const c of list) {
    const size = c.sub ? 30 : 44;
    let bob = 0;
    if (!reduced) {
      if (c.walking) bob = Math.floor(now / (1000 / 6)) % 2 === 0 ? 0 : -2;
      else if (c.working) bob = Math.floor(now / (1000 / 3)) % 2 === 0 ? 0 : -2;
    }

    drawCharacter(
      ctx,
      {
        harness: c.harness,
        x: Math.round(c.x),
        y: Math.round(c.y),
        bob,
        size,
        facing: c.facing,
        instanceIndex: c.instanceIndex,
        highlighted: hoveredKey === c.key || pinnedKey === c.key,
      },
      spriteDpr,
    );

    if (c.sleeping) {
      drawZzz(ctx, Math.round(c.x), Math.round(c.y), size, now, reduced);
    }
  }

  // speech bubbles sit just above their owner's head (permanent labels removed)
  for (const c of list) {
    if (c.sleeping || !c.working) continue;
    const size = c.sub ? 30 : 44;
    const text = c.tool && now < c.bubbleUntil ? c.tool : typingDots(now);
    const anchor = Math.round(c.y - size - 8);
    drawBubble(ctx, text, Math.round(c.x), anchor);
  }
}

// ---------------------------------------------------------------- dom

let hoveredKey: string | null = null;
let pinnedKey: string | null = null;

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;
const statusEl = document.getElementById("status") as HTMLElement;
const connEl = document.getElementById("conn") as HTMLElement;
const bannerEl = document.getElementById("banner") as HTMLElement;
const legendEl = document.getElementById("legend") as HTMLElement;

const cardEl = document.getElementById("char-card") as HTMLElement | null;
const cardIconEl = document.getElementById("card-icon") as HTMLElement | null;
const cardHarnessEl = document.getElementById("card-harness") as HTMLElement | null;
const cardBadgeEl = document.getElementById("card-badge") as HTMLElement | null;
const cardProjectEl = document.getElementById("card-project") as HTMLElement | null;
const cardToolEl = document.getElementById("card-tool") as HTMLElement | null;
const cardSubagentsEl = document.getElementById("card-subagents") as HTMLElement | null;
const cardPidEl = document.getElementById("card-pid") as HTMLElement | null;
const cardCloseEl = document.getElementById("card-close") as HTMLButtonElement | null;

function updateCard(c: Char): void {
  if (!cardEl) return;
  const project = c.directory ? c.directory.split(/[\\/]/).filter(Boolean).pop() || "—" : "—";
  const stateStr = c.sleeping ? "sleeping" : c.working ? "working" : "idle";

  if (cardIconEl) cardIconEl.textContent = (c.harness === "opencode" ? "🦫" : c.harness === "codex" ? "🐙" : c.harness === "pi" ? "🐹" : c.harness === "omp" ? "🦝" : c.harness === "hermes" ? "🦉" : "🐾");
  if (cardHarnessEl) {
    cardHarnessEl.textContent = c.instanceIndex > 0 ? `${c.harness} #${c.instanceIndex + 1}` : c.harness;
  }
  if (cardBadgeEl) {
    cardBadgeEl.textContent = stateStr;
    cardBadgeEl.className = `char-card-badge state-${stateStr}`;
  }
  if (cardProjectEl) cardProjectEl.textContent = project;
  if (cardToolEl) cardToolEl.textContent = c.tool || (c.working ? "thinking" : "—");
  if (cardSubagentsEl) cardSubagentsEl.textContent = String(c.subagentCount);
  if (cardPidEl) {
    const pidVal = c.pid ?? (c.key.includes("scan:") ? c.key.split("scan:")[1] : null);
    cardPidEl.textContent = pidVal ? `PID ${pidVal}` : (c.sleeping ? "offline" : "PID —");
  }

  const rect = canvas.getBoundingClientRect();
  const domX = (c.x / SCENE_W) * rect.width;
  const domY = (c.y / SCENE_H) * rect.height;
  cardEl.style.left = `${Math.min(rect.width - 230, Math.max(10, domX - 110))}px`;
  cardEl.style.top = `${Math.max(10, domY - (c.sub ? 30 : 44) - 95)}px`;
  cardEl.hidden = false;
  if (cardCloseEl) cardCloseEl.hidden = !pinnedKey;
}

function hideCard(): void {
  if (pinnedKey) return;
  if (cardEl) cardEl.hidden = true;
  hoveredKey = null;
}

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = SCENE_W / rect.width;
  const scaleY = SCENE_H / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  let found: Char | null = null;
  for (const c of chars.values()) {
    const size = c.sub ? 30 : 44;
    const dist = Math.hypot(c.x - mx, c.y - my);
    if (dist <= size * 0.75) {
      found = c;
      break;
    }
  }

  if (found) {
    hoveredKey = found.key;
    if (!pinnedKey) updateCard(found);
  } else {
    hoveredKey = null;
    if (!pinnedKey) hideCard();
  }
});

canvas.addEventListener("mouseleave", () => {
  hoveredKey = null;
  if (!pinnedKey) hideCard();
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = SCENE_W / rect.width;
  const scaleY = SCENE_H / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  let found: Char | null = null;
  for (const c of chars.values()) {
    const size = c.sub ? 30 : 44;
    const dist = Math.hypot(c.x - mx, c.y - my);
    if (dist <= size * 0.75) {
      found = c;
      break;
    }
  }

  if (found) {
    if (pinnedKey === found.key) {
      pinnedKey = null;
      hideCard();
    } else {
      pinnedKey = found.key;
      updateCard(found);
    }
  } else {
    pinnedKey = null;
    hideCard();
  }
});

if (cardCloseEl) {
  cardCloseEl.addEventListener("click", (e) => {
    e.stopPropagation();
    pinnedKey = null;
    hideCard();
  });
}

let spriteDpr = 1;

function fitCanvas(): void {
  const dpr = Math.max(1, Math.min(3, Math.ceil(window.devicePixelRatio || 1)));
  spriteDpr = dpr;
  const w = SCENE_W * dpr;
  const h = SCENE_H * dpr;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
}

function buildLegend(): void {
  legendEl.textContent = "";
  for (const name of HARNESS_ORDER) {
    const chip = document.createElement("span");
    chip.className = "chip";
    const dot = document.createElement("i");
    dot.style.background = legendAccent(name);
    chip.append(dot, document.createTextNode(name));
    legendEl.append(chip);
  }
}

function setConnected(connected: boolean): void {
  connEl.dataset.state = connected ? "on" : "off";
  connEl.setAttribute("aria-label", connected ? "connected" : "disconnected");
  bannerEl.hidden = connected;
}

function updateHeader(snap: Snapshot, sleeping: number): void {
  const working = snap.sessions.filter((s) => s.state === "working").length;
  const idle = snap.sessions.length - working;
  statusEl.textContent = `${working} working · ${idle} idle · ${sleeping} sleeping`;
}

// ---------------------------------------------------------------- snapshots + ws

let gotSnapshot = false;
let socket: WebSocket | null = null;
let retryTimer: number | null = null;

function applySnapshot(snap: Snapshot): void {
  if (!snap || snap.type !== "snapshot" || !Array.isArray(snap.sessions) || !Array.isArray(snap.harnesses)) {
    return;
  }
  gotSnapshot = true;
  const sleeping = reconcile(snap, performance.now());
  updateHeader(snap, sleeping);
}

function scheduleReconnect(): void {
  if (retryTimer !== null) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    connect();
  }, 2000);
}

function connect(): void {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  try {
    socket = new WebSocket(`${proto}//${location.host}/ws`);
  } catch {
    setConnected(false);
    scheduleReconnect();
    return;
  }

  socket.onopen = () => setConnected(true);
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(String(event.data)) as Snapshot;
      applySnapshot(data);
    } catch {
      /* ignore malformed frames */
    }
  };
  socket.onerror = () => {
    try {
      socket?.close();
    } catch {
      /* ignore */
    }
  };
  socket.onclose = () => {
    socket = null;
    setConnected(false);
    scheduleReconnect();
  };
}

// ---------------------------------------------------------------- motion loop

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduced = motionQuery.matches;
motionQuery.addEventListener("change", (event) => {
  reduced = event.matches;
  if (reduced) {
    for (const c of chars.values()) {
      c.x = c.targetX;
      c.y = c.targetY;
      c.path = [];
      c.walking = false;
    }
  }
});

let lastFrame = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  if (reduced) {
    for (const c of chars.values()) {
      if (c.path.length > 0) {
        c.x = c.targetX;
        c.y = c.targetY;
        c.path = [];
        c.walking = false;
      }
    }
  } else {
    for (const c of chars.values()) step(c, dt);
  }

  paint(now, reduced);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot

buildLegend();
fitCanvas();
setConnected(false);
window.addEventListener("resize", fitCanvas);
connect();

fetch("/state")
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (!gotSnapshot && data) applySnapshot(data as Snapshot);
  })
  .catch(() => {
    /* WS is the primary source; this is only a cold-start fallback */
  });

requestAnimationFrame(frame);
