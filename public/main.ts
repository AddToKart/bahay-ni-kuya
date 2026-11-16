// Bahay ni Kuya scene controller: snapshot reconciliation, A* navigation, autonomous house life, task flow & Kuya layer, 4-direction animation, CCTV & WS.

import { HARNESS_ORDER, MONO, PALETTE, accentFor, VARIANT_ACCENTS } from "./sprites.js";
import { loadHouseMap, type HouseMap, type RoomId } from "./map.js";
import { MapRenderer } from "./renderer.js";
import { NavGrid, type Point } from "./nav.js";
import { drawAnimatedCharacter, type Action, type Facing, type Emote } from "./anim.js";
import { HouseLifeManager, type POI } from "./life.js";
import { KuyaLayer } from "./kuya.js";
import { KuyaConsole } from "./console.js";
import { DiaryRoom } from "./confession.js";
import { installLayoutEditor } from "./layout-editor.js";
import type { ChatLine, QuestionView, SessionState } from "../src/types.js";

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
  state: SessionState;
  title?: string;
  tool?: string;
  directory?: string;
  pid?: number;
  since: number;
  lastEventTs: number;
  source: "adapter" | "scan";
  errorCount?: number;
  nominated?: boolean;
  housemateKey?: string;
  guest?: boolean;
}

interface Snapshot {
  type: "snapshot";
  ts: number;
  harnesses: HarnessView[];
  sessions: SessionView[];
  questions?: QuestionView[];
  chat?: ChatLine[];
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
  state: SessionState;
  working: boolean;
  blocked: boolean;
  errorState: boolean;
  errorCount: number;
  nominated: boolean;
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
  guest: boolean;
  carry: "bag" | "suitcase" | "folder" | null;
}

const chars = new Map<string, Char>();
let houseMap: HouseMap | null = null;
let navGrid: NavGrid | null = null;
let renderer: MapRenderer | null = null;
const lifeManager = new HouseLifeManager();
const kuya = new KuyaLayer();
const kuyaConsole = new KuyaConsole();
const diary = new DiaryRoom();

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
  state: SessionState;
  room: RoomId;
  label: string;
  working: boolean;
  blocked: boolean;
  errorState: boolean;
  errorCount: number;
  nominated: boolean;
  tool: string | null;
  directory?: string;
  pid?: number;
  instanceIndex: number;
  arriving: boolean;
  evicting: boolean;
  confession: boolean;
  queued: boolean;
  called: boolean;
  guest: boolean;
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

    const isWorking = s.state === "working";
    const isBlocked = s.state === "blocked";
    const isError = s.state === "error";
    const isArriving = s.state === "arriving";
    const isEvicting = s.state === "evicting";
    const isQueued = s.state === "queued_for_confession";
    const isInConfession = s.state === "in_confession";
    const isCalled = s.state === "called";
    const isConfession = isQueued || isInConfession || isCalled;

    let room: RoomId = "living";
    if (isBlocked || isConfession) {
      room = "confession";
    } else if (isArriving || isEvicting) {
      room = "hallway";
    } else if (isWorking) {
      room = s.harness === "hermes" ? "living" : "office";
    }

    desired.set(key, {
      key,
      harness: s.harness,
      parentKey,
      sub,
      sleeping: false,
      state: s.state,
      room,
      label,
      working: isWorking,
      blocked: isBlocked,
      errorState: isError,
      errorCount: s.errorCount || 0,
      nominated: s.nominated || false,
      tool: s.tool ?? null,
      directory: s.directory,
      pid: s.pid,
      instanceIndex,
      arriving: isArriving,
      evicting: isEvicting,
      confession: isConfession,
      queued: isQueued,
      called: isCalled,
      guest: s.guest === true,
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
        state: "idle",
        room: "bedroom",
        label: h.name,
        working: false,
        blocked: false,
        errorState: false,
        errorCount: 0,
        nominated: false,
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
        state: "idle",
        room: "living",
        label: `${h.name} (ambient)`,
        working: false,
        blocked: false,
        errorState: false,
        errorCount: 0,
        nominated: false,
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
    } else if (d.confession) {
      // Confession Room: the chair occupant uses the chair; queued askers stand at the east wall.
      poi = lifeManager.getPOI("confession_chair") || null;
      if (poi && !d.queued) lifeManager.reservePOI(d.key, poi.id);
    } else if (d.arriving) {
      poi = lifeManager.pickIdlePOI(d.key, now);
    } else if (d.evicting) {
      poi = null;
    } else if (d.blocked) {
      // Confession room for blocked / permission required
      poi = lifeManager.getPOI("confession_chair") || null;
      if (poi) lifeManager.reservePOI(d.key, poi.id);
    } else if (d.working) {
      // Hermes special research rule: uses reading nook / bookshelf in living room
      if (d.harness === "hermes") {
        poi = lifeManager.getPOI("living_bookshelf") || null;
        if (poi) lifeManager.reservePOI(d.key, poi.id);
      }
      if (!poi) {
        poi = lifeManager.pickDeskPOI(d.key, d.sub);
      }
    } else {
      // Idle housemate
      const prevState = lifeManager.states.get(d.key);
      if (!prevState || prevState.isSleeping || !prevState.currentPoiId) {
        poi = lifeManager.pickIdlePOI(d.key, now);
      } else {
        poi = lifeManager.getPOI(prevState.currentPoiId) || lifeManager.pickIdlePOI(d.key, now);
      }
    }

    let targetX = poi ? poi.x * 16 + 8 : 18 * 16 + 8;
    let targetY = poi ? poi.y * 16 + 14 : 6 * 16 + 14;
    if (d.queued) {
      targetX = 7 * 16 + 8;
      targetY = 19 * 16 + 14;
    }
    if (d.evicting) {
      targetX = 26 * 16 + 8;
      targetY = 26 * 16 + 14;
    }
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
      // Determine spawn location
      let spawnX = 6 * 16 + 8;
      let spawnY = 11 * 16 + 14;

      if (d.arriving) {
        // Front door (D1): the south exterior opening at (26,26), walking north.
        spawnX = 26 * 16 + 8;
        spawnY = 26 * 16 + 14;
      } else if (d.sleeping) {
        spawnX = targetX;
        spawnY = targetY;
      } else if (d.sub && d.parentKey && chars.has(d.parentKey)) {
        // Subagents spawn directly at their parent
        const parent = chars.get(d.parentKey)!;
        spawnX = parent.x;
        spawnY = parent.y;
      }

      c = {
        key: d.key,
        harness: d.harness,
        parentKey: d.parentKey,
        sub: d.sub,
        sleeping: d.sleeping,
        room: targetRoom,
        label: d.label,
        state: d.state,
        working: d.working,
        blocked: d.blocked,
        errorState: d.errorState,
        errorCount: d.errorCount,
        nominated: d.nominated,
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
        emote: d.working ? "exclamation" : null,
        emoteUntil: d.working ? now + 2500 : undefined,
        walking: !d.sleeping,
        poiId: poi ? poi.id : null,
        guest: d.guest,
        carry: d.evicting ? "suitcase" : d.arriving ? "bag" : d.guest ? "folder" : null,
      };
      chars.set(d.key, c);

      // Initial task Kuya banner if starting directly into work
      if (d.working) {
        if (d.harness === "hermes") {
          kuya.announce(kuya.formatLine("hermes_research", { harness: "hermes" }));
        } else {
          kuya.announce(kuya.formatLine("task_call", { harness: d.harness }));
        }
      }
    } else {
      // Handle state transitions and Kuya announcements
      const prevState = c.state;
      const prevWorking = c.working;
      const prevBlocked = c.blocked;

      c.label = d.label;
      c.state = d.state;
      c.working = d.working;
      c.blocked = d.blocked;
      c.errorState = d.errorState;
      c.errorCount = d.errorCount;
      c.nominated = d.nominated;
      c.tool = d.tool;
      c.directory = d.directory;
      c.pid = d.pid;
      c.instanceIndex = d.instanceIndex;
      c.parentKey = d.parentKey;
      c.sub = d.sub;
      c.guest = d.guest;
      c.carry = d.evicting ? "suitcase" : d.arriving ? "bag" : d.guest ? "folder" : null;

      // 0. Phase 2: arrival, eviction, confession question, Kuya call
      if (d.arriving && prevState !== "arriving") {
        kuya.announce(kuya.formatLine("summon_welcome", { harness: d.harness, name: d.label }));
      } else if (d.evicting && prevState !== "evicting") {
        c.emote = "exclamation";
        c.emoteUntil = now + 3000;
        kuya.announce(kuya.formatLine("evict_line", { harness: d.harness, name: d.label }));
      } else if (d.called && prevState !== "called") {
        kuya.announce(kuya.formatLine("call_to_confession", { harness: d.harness, name: d.label }));
      } else if (
        d.confession &&
        prevState !== "in_confession" &&
        prevState !== "queued_for_confession" &&
        prevState !== "called"
      ) {
        c.emote = "exclamation";
        c.emoteUntil = now + 4000;
        kuya.announce(kuya.formatLine("confession_call", { harness: d.harness, name: d.label }));
      }
      // 1. Task Started
      else if (!prevWorking && d.working) {
        c.emote = "exclamation";
        c.emoteUntil = now + 3000;
        if (d.harness === "hermes") {
          kuya.announce(kuya.formatLine("hermes_research", { harness: "hermes" }));
        } else {
          kuya.announce(kuya.formatLine("task_call", { harness: d.harness }));
        }
      }
      // 2. Blocked / Permission Asked
      else if (!prevBlocked && d.blocked) {
        c.emote = "exclamation";
        c.emoteUntil = now + 4000;
        kuya.announce(kuya.formatLine("blocked_confession", { harness: d.harness }));
      }
      // 3. Error / Nominated
      else if (d.errorState && prevState !== "error") {
        c.emote = "facepalm";
        c.emoteUntil = now + 3500;
        if (d.nominated) {
          kuya.announce(kuya.formatLine("nominated", { harness: d.harness }));
        } else {
          kuya.announce(kuya.formatLine("error_facepalm", { harness: d.harness }));
        }
      }
      // 4. Task Completed / Returned to Idle
      else if (prevWorking && !d.working && !d.blocked && !d.errorState) {
        c.emote = "thumbs_up";
        c.emoteUntil = now + 3500;
        kuya.announce(kuya.formatLine("task_completed", { harness: d.harness }));
      }
      // 5. Wake up event
      else if (c.sleeping && !d.sleeping) {
        c.emote = "thumbs_up";
        c.emoteUntil = now + 3000;
        kuya.announce(kuya.formatLine("wake_up", { harness: d.harness }));
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
    } else if (c.blocked) {
      c.action = "sit";
      c.facing = "down";
    } else if (c.working) {
      c.action = c.harness === "hermes" ? "read" : "type";
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

function drawBubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, isError = false): void {
  ctx.save();
  ctx.font = `9px ${MONO}`;
  const width = Math.max(22, ctx.measureText(text).width + 8);
  const height = 13;
  const bx = Math.round(x - width / 2);
  const by = Math.round(y - height);

  ctx.fillStyle = isError ? "#fee2e2" : "#fff8ee";
  ctx.strokeStyle = isError ? "#ef4444" : PALETTE.frame;
  ctx.lineWidth = 1;
  ctx.fillRect(bx, by, width, height);
  ctx.strokeRect(bx + 0.5, by + 0.5, width - 1, height - 1);

  // Tiny beak pointing down
  ctx.fillStyle = isError ? "#fee2e2" : "#fff8ee";
  ctx.beginPath();
  ctx.moveTo(x - 2, by + height);
  ctx.lineTo(x + 2, by + height);
  ctx.lineTo(x, by + height + 2);
  ctx.fill();

  ctx.fillStyle = isError ? "#991b1b" : PALETTE.ink;
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + 4, by + height / 2 + 0.5);
  ctx.restore();
}

function paint(now: number): void {
  if (!renderer) return;
  renderer.render(chars as any, now);
}

// ---------------------------------------------------------------- dom & interaction

let hoveredKey: string | null = null;
let pinnedKey: string | null = null;

const canvas = document.getElementById("scene") as HTMLCanvasElement;
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
  const stateStr = c.sleeping
    ? "sleeping"
    : c.blocked
      ? "blocked"
      : c.errorState
        ? "error"
        : c.working
          ? "working"
          : "idle";

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
    const base = c.instanceIndex > 0 ? `${c.harness} #${c.instanceIndex + 1}` : c.harness;
    cardHarnessEl.textContent = c.nominated ? `${base} [NOMINATED]` : base;
  }
  if (cardBadgeEl) {
    cardBadgeEl.textContent = stateStr;
    cardBadgeEl.className = `char-card-badge state-${stateStr}`;
  }
  if (cardProjectEl) cardProjectEl.textContent = project;
  if (cardToolEl) cardToolEl.textContent = c.tool || (c.working ? "thinking" : c.blocked ? "waiting approval" : "—");
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

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragCamStartX = 0;
let dragCamStartY = 0;
let didMove = false;

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    isDragging = true;
    didMove = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    if (renderer) {
      dragCamStartX = renderer.camera.targetX;
      dragCamStartY = renderer.camera.targetY;
    }
  }
});

window.addEventListener("mouseup", () => {
  isDragging = false;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (!renderer) return;
  const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
  const newZoom = Math.max(1.0, Math.min(3.5, renderer.camera.targetZoom * zoomFactor));
  renderer.camera.targetZoom = Math.round(newZoom * 100) / 100;
}, { passive: false });

canvas.addEventListener("mousemove", (e) => {
  if (isDragging && renderer) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.hypot(dx, dy) > 4) {
      didMove = true;
      const rect = canvas.getBoundingClientRect();
      const worldDx = (dx * (SCENE_W / rect.width)) / renderer.camera.zoom;
      const worldDy = (dy * (SCENE_H / rect.height)) / renderer.camera.zoom;
      renderer.camera.targetX = Math.max(50, Math.min(620, dragCamStartX - worldDx));
      renderer.camera.targetY = Math.max(40, Math.min(390, dragCamStartY - worldDy));
      renderer.camera.x = renderer.camera.targetX;
      renderer.camera.y = renderer.camera.targetY;
    }
  }

  const { x: mx, y: my } = clientToWorld(e.clientX, e.clientY);
  let found: Char | null = null;
  for (const c of chars.values()) {
    const size = c.sub ? 22 : 34;
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
  isDragging = false;
  hoveredKey = null;
  if (!pinnedKey) hideCard();
});

canvas.addEventListener("click", (e) => {
  if (didMove) return;
  const { x: mx, y: my } = clientToWorld(e.clientX, e.clientY);
  let found: Char | null = null;
  for (const c of chars.values()) {
    const size = c.sub ? 22 : 34;
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
  all: { x: 336, y: 216, zoom: 1.15, label: "CAM ALL - BAHAY NI KUYA" },
  office: { x: 512, y: 88, zoom: 2.2, label: "CAM 3 - OFFICE" },
  living: { x: 288, y: 88, zoom: 2.2, label: "CAM 2 - LIVING ROOM" },
  bedroom: { x: 96, y: 88, zoom: 2.2, label: "CAM 1 - BEDROOM" },
  kitchen: { x: 256, y: 320, zoom: 2.2, label: "CAM 4 - KITCHEN" },
  gameroom: { x: 464, y: 320, zoom: 2.2, label: "CAM 5 - GAME ROOM" },
  confession: { x: 72, y: 330, zoom: 2.4, label: "CAM 6 - CONFESSION ROOM" },
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

// G toggles the furniture/nav debug overlay (footprints, nav grid, POIs, doors, violations)
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "g" || event.repeat) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  renderer?.toggleDebugOverlay();
});

if (btnTestWalk) {
  btnTestWalk.addEventListener("click", () => {
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
        state: "working",
        working: false,
        blocked: false,
        errorState: false,
        errorCount: 0,
        nominated: false,
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
  if (renderer) renderer.resize();
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
  kuyaConsole.updateInstalled(snap.harnesses);
  diary.update(snap);
  const called = snap.sessions.find((s) => s.state === "called");
  if (called) diary.openChat(called.sessionId);
  for (const s of snap.sessions) {
    if (s.directory) kuyaConsole.recordDirectory(s.directory);
  }
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

let isTabVisible = true;
let animFrameId: number | null = null;

// Pause rendering and animation loop when the tab is hidden to reduce CPU to 0%
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    isTabVisible = false;
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  } else {
    isTabVisible = true;
    lastFrame = performance.now();
    if (animFrameId === null) {
      animFrameId = requestAnimationFrame(frame);
    }
  }
});

function frame(now: number): void {
  if (!isTabVisible) return;

  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  if (renderer) renderer.update(dt);

  // House life autonomous POI progression for idle housemates
  for (const c of chars.values()) {
    if (c.key === "test:walker") continue;
    if (!c.working && !c.blocked && !c.sleeping && !c.walking) {
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
  animFrameId = requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot

buildLegend();
fitCanvas();
setConnected(false);
window.addEventListener("resize", fitCanvas);
kuya.initDOM();
kuya.loadLines();
kuyaConsole.init();
void diary.init();

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
    installLayoutEditor(map, renderer);

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

    animFrameId = requestAnimationFrame(frame);
  })
  .catch((err) => {
    console.error("Failed to initialize Bahay ni Kuya map:", err);
  });
