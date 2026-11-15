// Bahay ni Kuya scene controller: snapshot reconciliation, A* navigation, autonomous house life, 4-direction animation, CCTV & WS.

import { HARNESS_ORDER, MONO, PALETTE, accentFor, VARIANT_ACCENTS } from "./sprites.js";
import { loadHouseMap, type HouseMap, type RoomId } from "./map.js";
import { MapRenderer, type YSortable } from "./renderer.js";
import { NavGrid, type Point } from "./nav.js";
import { drawAnimatedCharacter, type Action, type Facing, type Emote } from "./anim.js";
import { HouseLifeManager, type POI } from "./life.js";

// Scene dimensions matching the 42x27 16px tilemap
const SCENE_W = 672;
const SCENE_H = 432;
const WALK_SPEED = 50; // px/s
const ARRIVE = 2; // px

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
  path: Point[];
  facing: Facing;
  action: Action;
  emote: Emote;
  emoteUntil?: number;
  walking: boolean;
  poiId: string | null;
}

const chars = new Map<string, Char>();
let houseMap: HouseMap | null = null;
let navGrid: NavGrid | null = null;
let renderer: MapRenderer | null = null;
const lifeManager = new HouseLifeManager();

function sessionKey(harness: string, sessionId: string): string {
  return `${harness}\u0000${sessionId}`;
}

// Convert world coords to tile coords and compute orthogonal A* path
function calculateAStarPath(fromX: number, fromY: number, toX: number, toY: number): Point[] {
  if (!navGrid) return [{ x: toX, y: toY }];
  const startTx = Math.min(41, Math.max(0, Math.floor(fromX / 16)));
  const startTy = Math.min(26, Math.max(0, Math.floor(fromY / 16)));
  const goalTx = Math.min(41, Math.max(0, Math.floor(toX / 16)));
  const goalTy = Math.min(26, Math.max(0, Math.floor(toY / 16)));

  const tileSteps = navGrid.findPath(startTx, startTy, goalTx, goalTy);
  if (tileSteps.length === 0) return [{ x: toX, y: toY }];

  // Convert tile coords to world pixel waypoints (center of tile, feet at y+14)
  const waypoints = tileSteps.map((p) => ({
    x: p.x * 16 + 8,
    y: p.y * 16 + 14,
  }));

  // Ensure last waypoint is exact target
  waypoints[waypoints.length - 1] = { x: toX, y: toY };
  return waypoints;
}

// ---------------------------------------------------------------- snapshot reconciliation

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

  // Drop characters that no longer exist (preserve manual test walker)
  for (const key of [...chars.keys()]) {
    if (key !== "test:walker" && !desired.has(key)) {
      chars.delete(key);
      lifeManager.removeHousemate(key);
    }
  }

  for (const d of desired.values()) {
    let c = chars.get(d.key);
    let poi: POI | null = null;

    if (d.sleeping) {
      poi = lifeManager.pickBedPOI(d.key);
    } else if (d.working) {
      poi = lifeManager.pickDeskPOI(d.key, d.sub);
    } else {
      // Idle housemate: if previously sleeping or unassigned, wake up and pick an idle POI
      const prevState = lifeManager.states.get(d.key);
      if (!prevState || prevState.isSleeping || !prevState.currentPoiId) {
        poi = lifeManager.pickIdlePOI(d.key, now);
      } else {
        poi = lifeManager.getPOI(prevState.currentPoiId) || lifeManager.pickIdlePOI(d.key, now);
      }
    }

    const targetX = poi ? poi.x * 16 + 8 : 18 * 16 + 8;
    const targetY = poi ? poi.y * 16 + 14 : 6 * 16 + 14;
    const poiFacing: Facing = poi ? poi.facing : "down";
    const poiAction: Action = poi
      ? poi.action
      : d.sleeping
        ? "sleep"
        : d.working
          ? "type"
          : "sit";
    const targetRoom: RoomId = poi ? poi.room : d.room;

    if (!c) {
      // Spawn at bedroom if sleeping, or bedroom door waking up
      const spawnX = d.sleeping ? targetX : 6 * 16 + 8;
      const spawnY = d.sleeping ? targetY : 11 * 16 + 14;
      c = {
        key: d.key,
        harness: d.harness,
        parentKey: d.parentKey,
        sub: d.sub,
        sleeping: d.sleeping,
        room: targetRoom,
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
        y: spawnY,
        targetX,
        targetY,
        path: d.sleeping ? [] : calculateAStarPath(spawnX, spawnY, targetX, targetY),
        facing: poiFacing,
        action: d.sleeping ? "sleep" : "walk",
        emote: null,
        walking: !d.sleeping,
        poiId: poi ? poi.id : null,
      };
      chars.set(d.key, c);
    } else {
      c.label = d.label;
      c.working = d.working;
      c.tool = d.tool;
      c.directory = d.directory;
      c.pid = d.pid;
      c.instanceIndex = d.instanceIndex;
      c.parentKey = d.parentKey;
      c.sub = d.sub;

      // Wake up event
      if (c.sleeping && !d.sleeping) {
        c.emote = "thumbs_up";
        c.emoteUntil = now + 3000;
      }
      c.sleeping = d.sleeping;

      const roomChanged = c.room !== targetRoom;
      const targetChanged = Math.abs(c.targetX - targetX) > 4 || Math.abs(c.targetY - targetY) > 4;

      if (roomChanged || targetChanged) {
        c.room = targetRoom;
        c.targetX = targetX;
        c.targetY = targetY;
        c.poiId = poi ? poi.id : null;
        c.path = calculateAStarPath(c.x, c.y, targetX, targetY);
        c.action = "walk";
        c.walking = true;
      }
    }

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

// ---------------------------------------------------------------- movement & animation

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
      c.facing = dx > 0 ? "right" : "left";
    } else if (Math.abs(dy) > 0.5) {
      const stepY = Math.sign(dy) * Math.min(Math.abs(dy), remaining);
      c.y += stepY;
      moved = Math.abs(stepY);
      c.facing = dy > 0 ? "down" : "up";
    }
    if (moved === 0) break;
    remaining -= moved;
  }

  c.walking = c.path.length > 0;
  if (c.walking) {
    c.action = "walk";
  } else {
    // Reached destination: assume assigned POI activity
    if (c.sleeping) {
      c.action = "sleep";
    } else if (c.working) {
      c.action = "type";
    } else if (c.poiId) {
      const poi = lifeManager.getPOI(c.poiId);
      if (poi) {
        c.action = poi.action;
        c.facing = poi.facing;
      } else {
        c.action = "sit";
      }
    } else {
      c.action = "sit";
    }
  }
}

// ---------------------------------------------------------------- drawing

function typingDots(now: number): string {
  const dots = 1 + (Math.floor(now / 450) % 3);
  return ".".repeat(dots) + "\u00a0".repeat(3 - dots);
}

function drawParentLink(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(230, 225, 215, 0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.font = `9px ${MONO}`;
  const width = Math.max(22, ctx.measureText(text).width + 8);
  const height = 13;
  const bx = Math.round(x - width / 2);
  const by = Math.round(y - height);

  ctx.fillStyle = "#fff8ee";
  ctx.strokeStyle = PALETTE.frame;
  ctx.lineWidth = 1;
  ctx.fillRect(bx, by, width, height);
  ctx.strokeRect(bx + 0.5, by + 0.5, width - 1, height - 1);

  // Tiny beak pointing down
  ctx.fillStyle = "#fff8ee";
  ctx.beginPath();
  ctx.moveTo(x - 2, by + height);
  ctx.lineTo(x + 2, by + height);
  ctx.lineTo(x, by + height + 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + 4, by + height / 2 + 0.5);
  ctx.restore();
}

function paint(now: number): void {
  if (!renderer) return;

  // Prepare YSortable entities for depth-ordered drawing
  const entities: YSortable[] = [];

  // 1. Subagent dashed tethers
  for (const c of chars.values()) {
    if (!c.parentKey) continue;
    const parent = chars.get(c.parentKey);
    if (!parent) continue;
    entities.push({
      y: Math.min(c.y, parent.y) - 20,
      draw: (renderCtx) => {
        drawParentLink(
          renderCtx,
          c.x,
          c.y - (c.sub ? 15 : 22),
          parent.x,
          parent.y - (parent.sub ? 15 : 22),
        );
      },
    });
  }

  // 2. Housemate characters
  for (const c of chars.values()) {
    entities.push({
      y: c.y,
      draw: (renderCtx, dpr) => {
        const size = c.sub ? 26 : 34;

        drawAnimatedCharacter(
          renderCtx,
          {
            harness: c.harness,
            x: Math.round(c.x),
            y: Math.round(c.y),
            size,
            facing: c.facing,
            action: c.action,
            emote: c.emoteUntil && now > c.emoteUntil ? null : c.emote,
            instanceIndex: c.instanceIndex,
            highlighted: hoveredKey === c.key || pinnedKey === c.key,
          },
          now,
          dpr,
        );

        // Speech bubble for active tasks
        if (!c.sleeping && c.working) {
          const text = c.tool && now < c.bubbleUntil ? c.tool : typingDots(now);
          const anchor = Math.round(c.y - size - 8);
          drawBubble(renderCtx, text, Math.round(c.x), anchor);
        }
      },
    });
  }

  renderer.render(ctx, SCENE_W, SCENE_H, entities, spriteDpr, now);
}

// ---------------------------------------------------------------- dom & interaction

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

const btnTestWalk = document.getElementById("btn-test-walk") as HTMLButtonElement | null;

function updateCard(c: Char): void {
  if (!cardEl || !renderer) return;
  const project = c.directory ? c.directory.split(/[\\/]/).filter(Boolean).pop() || "—" : "—";
  const stateStr = c.sleeping ? "sleeping" : c.working ? "working" : "idle";

  if (cardIconEl)
    cardIconEl.textContent =
      c.harness === "opencode"
        ? "🦫"
        : c.harness === "codex"
          ? "🐙"
          : c.harness === "pi"
            ? "🐹"
            : c.harness === "omp"
              ? "🦝"
              : c.harness === "hermes"
                ? "🦉"
                : "🐾";
  if (cardHarnessEl) {
    cardHarnessEl.textContent =
      c.instanceIndex > 0 ? `${c.harness} #${c.instanceIndex + 1}` : c.harness;
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
    cardPidEl.textContent = pidVal ? `PID ${pidVal}` : c.sleeping ? "offline" : "PID —";
  }

  const rect = canvas.getBoundingClientRect();
  // Project world coordinates through camera
  const screenX = (c.x - renderer.camera.x) * renderer.camera.zoom + SCENE_W / 2;
  const screenY = (c.y - renderer.camera.y) * renderer.camera.zoom + SCENE_H / 2;
  const domX = (screenX / SCENE_W) * rect.width;
  const domY = (screenY / SCENE_H) * rect.height;

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

function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
  if (!renderer) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const screenX = (clientX - rect.left) * (SCENE_W / rect.width);
  const screenY = (clientY - rect.top) * (SCENE_H / rect.height);
  const worldX = (screenX - SCENE_W / 2) / renderer.camera.zoom + renderer.camera.x;
  const worldY = (screenY - SCENE_H / 2) / renderer.camera.zoom + renderer.camera.y;
  return { x: worldX, y: worldY };
}

canvas.addEventListener("mousemove", (e) => {
  const { x: mx, y: my } = clientToWorld(e.clientX, e.clientY);
  let found: Char | null = null;
  for (const c of chars.values()) {
    const size = c.sub ? 26 : 34;
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
  const { x: mx, y: my } = clientToWorld(e.clientX, e.clientY);
  let found: Char | null = null;
  for (const c of chars.values()) {
    const size = c.sub ? 26 : 34;
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

// ---------------------------------------------------------------- CCTV controls

const CAM_CONFIGS: Record<string, { x: number; y: number; zoom: number; label: string }> = {
  all: { x: 336, y: 216, zoom: 1, label: "CAM ALL - BAHAY NI KUYA" },
  office: { x: 520, y: 80, zoom: 1.8, label: "CAM 3 - OFFICE" },
  living: { x: 272, y: 80, zoom: 1.8, label: "CAM 2 - LIVING ROOM" },
  bedroom: { x: 88, y: 80, zoom: 1.8, label: "CAM 1 - BEDROOM" },
  kitchen: { x: 88, y: 224, zoom: 1.8, label: "CAM 4 - KITCHEN" },
  gameroom: { x: 272, y: 224, zoom: 1.8, label: "CAM 5 - GAME ROOM" },
  confession: { x: 72, y: 360, zoom: 2.2, label: "CAM 6 - CONFESSION ROOM" },
};

document.querySelectorAll<HTMLButtonElement>(".cam-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cam-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const camKey = btn.dataset.cam || "all";
    const cfg = CAM_CONFIGS[camKey] || CAM_CONFIGS.all;
    if (renderer) {
      renderer.camera.targetX = cfg.x;
      renderer.camera.targetY = cfg.y;
      renderer.camera.targetZoom = cfg.zoom;
      renderer.camera.activeCamLabel = cfg.label;
    }
  });
});

// ---------------------------------------------------------------- debug test walk button

if (btnTestWalk) {
  btnTestWalk.addEventListener("click", () => {
    // Acceptance: clicking debug button sends a character from Bedroom to Office through doors without clipping walls.
    const startX = 4 * 16 + 8;
    const startY = 5 * 16 + 14;
    const goalX = 26 * 16 + 8;
    const goalY = 4 * 16 + 14;

    let walker = chars.get("test:walker");
    if (!walker) {
      walker = {
        key: "test:walker",
        harness: "opencode",
        parentKey: null,
        sub: false,
        sleeping: false,
        room: "bedroom",
        label: "Kuya Walker",
        working: false,
        tool: null,
        lastTool: null,
        bubbleUntil: 0,
        instanceIndex: 0,
        subagentCount: 0,
        x: startX,
        y: startY,
        targetX: goalX,
        targetY: goalY,
        path: [],
        facing: "right",
        action: "walk",
        emote: "exclamation",
        emoteUntil: performance.now() + 2500,
        walking: true,
        poiId: "office_desk_1",
      };
      chars.set("test:walker", walker);
    } else {
      walker.x = startX;
      walker.y = startY;
      walker.targetX = goalX;
      walker.targetY = goalY;
      walker.emote = "exclamation";
      walker.emoteUntil = performance.now() + 2500;
    }

    walker.path = calculateAStarPath(startX, startY, goalX, goalY);
    walker.walking = true;
    walker.action = "walk";

    // Switch camera to show the journey
    if (renderer) {
      renderer.camera.targetX = 336;
      renderer.camera.targetY = 216;
      renderer.camera.targetZoom = 1.1;
      renderer.camera.activeCamLabel = "CAM REC - TEST WALK BEDROOM -> OFFICE";
    }
  });
}

// ---------------------------------------------------------------- canvas sizing & header

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
    dot.style.background = accentFor(name);
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
  if (
    !snap ||
    snap.type !== "snapshot" ||
    !Array.isArray(snap.sessions) ||
    !Array.isArray(snap.harnesses)
  ) {
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

// ---------------------------------------------------------------- motion & house life loop

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

  if (renderer) renderer.update(dt);

  // House life autonomous POI progression for idle housemates
  for (const c of chars.values()) {
    if (c.key === "test:walker") continue;
    if (!c.working && !c.sleeping && !c.walking) {
      const state = lifeManager.states.get(c.key);
      if (state && now >= state.activityUntil) {
        const nextPoi = lifeManager.pickIdlePOI(c.key, now);
        if (nextPoi) {
          c.room = nextPoi.room;
          c.poiId = nextPoi.id;
          c.targetX = nextPoi.x * 16 + 8;
          c.targetY = nextPoi.y * 16 + 14;
          c.path = calculateAStarPath(c.x, c.y, c.targetX, c.targetY);
          c.action = "walk";
          c.walking = true;
        }
      }
    }
  }

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

  paint(now);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot

buildLegend();
fitCanvas();
setConnected(false);
window.addEventListener("resize", fitCanvas);

// Load house map & POIs, then initialize renderer, navGrid, and house life
Promise.all([
  loadHouseMap(),
  fetch("/pois.json")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []),
])
  .then(([map, loadedPois]) => {
    houseMap = map;
    renderer = new MapRenderer(map);
    navGrid = new NavGrid(map.width, map.height, map.collision);

    // Ensure all door tiles are explicitly walkable
    for (let i = 0; i < map.doors.length; i++) {
      if (map.doors[i] > 0) {
        navGrid.setWalkable(i % map.width, Math.floor(i / map.width), true);
      }
    }

    // Initialize autonomous life POIs
    const poisList = Array.isArray(loadedPois) && loadedPois.length > 0 ? loadedPois : map.pois;
    lifeManager.setPOIs(poisList as POI[]);

    connect();

    fetch("/state")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!gotSnapshot && data) applySnapshot(data as Snapshot);
      })
      .catch(() => {
        /* WS is primary */
      });

    requestAnimationFrame(frame);
  })
  .catch((err) => {
    console.error("Failed to initialize Bahay ni Kuya map:", err);
  });
