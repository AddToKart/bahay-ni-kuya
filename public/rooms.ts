// Room geometry, fixed furniture, slots and the deterministic slot allocator.
// Coordinates are scene pixels (960x580 logical).

import { MONO, PALETTE, SCENE_H, SCENE_W, HARNESS_ACCENT } from "./sprites.js";

export type RoomId = "bedroom" | "living" | "office";
export type Pt = { x: number; y: number };

export const ROOM_IDS: RoomId[] = ["bedroom", "living", "office"];
export const FLOOR_Y = 430;
export const CORRIDOR_Y = 490;

export interface RoomDef {
  id: RoomId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  doorX: number;
  wall: string;
}

export const ROOMS: Record<RoomId, RoomDef> = {
  bedroom: { id: "bedroom", label: "BEDROOM", x: 30, y: 50, w: 296, h: 380, doorX: 180, wall: PALETTE.wallBed },
  living: { id: "living", label: "LIVING ROOM", x: 332, y: 50, w: 314, h: 380, doorX: 490, wall: PALETTE.wallLiv },
  office: { id: "office", label: "OFFICE", x: 652, y: 50, w: 278, h: 380, doorX: 790, wall: PALETTE.wallOff },
};

export type SlotKind = "bed" | "seat" | "chair" | "desk" | "floor";

export interface Slot {
  id: string;
  room: RoomId;
  x: number;
  y: number;
  kind: SlotKind;
}

export const SLOTS: Record<RoomId, Slot[]> = {
  bedroom: [
    { id: "bed-l-upper", room: "bedroom", x: 98, y: 264, kind: "bed" },
    { id: "bed-r-upper", room: "bedroom", x: 258, y: 264, kind: "bed" },
    { id: "bed-l-lower", room: "bedroom", x: 98, y: 354, kind: "bed" },
    { id: "bed-r-lower", room: "bedroom", x: 258, y: 354, kind: "bed" },
    { id: "bed-floor-1", room: "bedroom", x: 122, y: FLOOR_Y, kind: "floor" },
    { id: "bed-floor-2", room: "bedroom", x: 240, y: FLOOR_Y, kind: "floor" },
  ],
  living: [
    { id: "sofa-1", room: "living", x: 405, y: 364, kind: "seat" },
    { id: "sofa-2", room: "living", x: 462, y: 364, kind: "seat" },
    { id: "sofa-3", room: "living", x: 519, y: 364, kind: "seat" },
    { id: "chair-1", room: "living", x: 571, y: 372, kind: "chair" },
    { id: "chair-2", room: "living", x: 607, y: 372, kind: "chair" },
    { id: "liv-floor-1", room: "living", x: 400, y: FLOOR_Y, kind: "floor" },
    { id: "liv-floor-2", room: "living", x: 475, y: FLOOR_Y, kind: "floor" },
    { id: "liv-floor-3", room: "living", x: 550, y: FLOOR_Y, kind: "floor" },
  ],
  office: [
    { id: "desk-back-1", room: "office", x: 700, y: 344, kind: "desk" },
    { id: "desk-back-2", room: "office", x: 790, y: 344, kind: "desk" },
    { id: "desk-back-3", room: "office", x: 880, y: 344, kind: "desk" },
    { id: "desk-front-1", room: "office", x: 690, y: FLOOR_Y, kind: "desk" },
    { id: "desk-front-2", room: "office", x: 780, y: FLOOR_Y, kind: "desk" },
    { id: "desk-front-3", room: "office", x: 870, y: FLOOR_Y, kind: "desk" },
  ],
};

export const OVERFLOW: Record<RoomId, Pt[]> = {
  bedroom: [
    { x: 48, y: FLOOR_Y },
    { x: 196, y: FLOOR_Y },
    { x: 286, y: FLOOR_Y },
    { x: 160, y: FLOOR_Y },
  ],
  living: [
    { x: 360, y: FLOOR_Y },
    { x: 440, y: FLOOR_Y },
    { x: 520, y: FLOOR_Y },
    { x: 600, y: FLOOR_Y },
  ],
  office: [
    { x: 664, y: FLOOR_Y },
    { x: 736, y: FLOOR_Y },
    { x: 828, y: FLOOR_Y },
    { x: 906, y: FLOOR_Y },
  ],
};

export function doorPoint(room: RoomId): Pt {
  return { x: ROOMS[room].doorX, y: FLOOR_Y };
}

// ---------------------------------------------------------------- allocation

export interface SlotRequest {
  key: string;
  room: RoomId;
  sub: boolean;
  parentKey: string | null;
}

let dynamicOverflow = 0;

function poolFor(room: RoomId): Slot[] {
  return [
    ...SLOTS[room],
    ...OVERFLOW[room].map((p, i) => ({
      id: `${room}:overflow-${i}`,
      room,
      x: p.x,
      y: p.y,
      kind: "floor" as SlotKind,
    })),
  ];
}

function fallbackSlot(room: RoomId): Slot {
  dynamicOverflow += 1;
  const roomDef = ROOMS[room];
  return {
    id: `${room}:extra-${dynamicOverflow}`,
    room,
    x: roomDef.x + 24 + ((dynamicOverflow * 47) % Math.max(1, roomDef.w - 48)),
    y: FLOOR_Y,
    kind: "floor",
  };
}

/**
 * Assign each key a fixed slot. Existing assignments stay while the entry keeps
 * the same room. Roots get first pick (sorted by key), then subagents, preferring
 * a free slot near their parent's slot. Fully deterministic for a given input.
 */
export function allocateSlots(
  previous: Map<string, Slot>,
  requests: SlotRequest[],
): Map<string, Slot> {
  const result = new Map<string, Slot>();
  const byKey = new Map(requests.map((r) => [r.key, r]));

  for (const [key, slot] of previous) {
    const req = byKey.get(key);
    if (req && slot.room === req.room) result.set(key, slot);
  }

  const free = new Map<RoomId, Slot[]>();
  for (const room of ROOM_IDS) {
    const used = new Set<string>();
    for (const slot of result.values()) if (slot.room === room) used.add(slot.id);
    free.set(room, poolFor(room).filter((s) => !used.has(s.id)));
  }

  const take = (req: SlotRequest, index?: number): Slot => {
    const list = free.get(req.room)!;
    let slot: Slot;
    if (index !== undefined && index >= 0 && index < list.length) slot = list.splice(index, 1)[0];
    else if (list.length > 0) slot = list.shift()!;
    else slot = fallbackSlot(req.room);
    result.set(req.key, slot);
    return slot;
  };

  const roots = requests
    .filter((r) => !r.sub)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const req of roots) if (!result.has(req.key)) take(req);

  const subs = requests
    .filter((r) => r.sub)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const companionUse = new Map<string, number>();
  const companionXs = new Map<string, number[]>();

  const allocateSub = (req: SlotRequest): void => {
    const parentSlot = req.parentKey ? result.get(req.parentKey) : undefined;

    // subagents stand beside their parent's spot so two characters never share one desk
    if (parentSlot && parentSlot.room === req.room) {
      const used = companionUse.get(parentSlot.id) ?? 0;
      if (used < 4) {
        const def = ROOMS[req.room];
        const margin = 18;
        const isFrontDesk = parentSlot.kind === "desk" && parentSlot.y >= FLOOR_Y - 2;
        const gap = parentSlot.kind === "desk" ? (isFrontDesk ? 40 : 34) : 32;
        const dy = parentSlot.kind === "desk" && !isFrontDesk ? 26 : 0;
        const taken = companionXs.get(parentSlot.id) ?? [];
        const candidates: number[] = [];
        for (let row = 0; row < 2; row += 1) {
          const dirs = used % 2 === 0 ? [1, -1] : [-1, 1];
          for (const dir of dirs) candidates.push(parentSlot.x + dir * (gap + row * 12));
        }
        for (const x of candidates) {
          if (x < def.x + margin || x > def.x + def.w - margin) continue;
          if (taken.some((u) => Math.abs(u - x) < 30)) continue;
          const y = Math.min(parentSlot.y + dy, FLOOR_Y + 26);
          companionUse.set(parentSlot.id, used + 1);
          taken.push(x);
          companionXs.set(parentSlot.id, taken);
          result.set(req.key, {
            id: `${parentSlot.id}:sub-${used}`,
            room: req.room,
            x,
            y,
            kind: "floor",
          });
          return;
        }
      }
    }

    const list = free.get(req.room)!;
    if (list.length === 0) {
      take(req);
      return;
    }
    if (parentSlot && parentSlot.room === req.room) {
      let best = 0;
      let bestDist = Infinity;
      list.forEach((slot, i) => {
        const d = Math.abs(slot.x - parentSlot.x) + Math.abs(slot.y - parentSlot.y) * 0.5;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      take(req, best);
    } else {
      take(req);
    }
  };

  let pending = subs;
  while (pending.length > 0) {
    const next: SlotRequest[] = [];
    let progressed = false;
    for (const req of pending) {
      const parentPending =
        req.parentKey !== null &&
        byKey.has(req.parentKey) &&
        !result.has(req.parentKey);
      if (parentPending) {
        next.push(req);
        continue;
      }
      allocateSub(req);
      progressed = true;
    }
    if (!progressed) {
      for (const req of next) allocateSub(req);
      break;
    }
    pending = next;
  }

  return result;
}

// ---------------------------------------------------------------- scene paint

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  rect(ctx, x, y, w, h, fill);
  ctx.strokeStyle = PALETTE.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  box(ctx, x - 3, y - 3, w + 6, h + 6, PALETTE.frame);
  rect(ctx, x, y, w, h, PALETTE.sleeping);
  // dusk hills + moon + a couple of stars
  rect(ctx, x, y + h - 14, w, 14, PALETTE.frame);
  rect(ctx, x + 4, y + h - 19, 18, 5, PALETTE.frame);
  rect(ctx, x + w - 30, y + h - 22, 26, 8, PALETTE.frame);
  rect(ctx, x + 52, y + 10, 12, 12, PALETTE.wallLiv);
  rect(ctx, x + 50, y + 8, 4, 4, PALETTE.wallLiv);
  rect(ctx, x + 14, y + 14, 2, 2, PALETTE.wallLiv);
  rect(ctx, x + 30, y + 30, 2, 2, PALETTE.wallLiv);
  rect(ctx, x + w - 18, y + 16, 2, 2, PALETTE.wallLiv);
  // mullions
  rect(ctx, x + Math.floor(w / 2) - 1, y, 2, h, PALETTE.frame);
  rect(ctx, x, y + Math.floor(h / 2) - 1, w, 2, PALETTE.frame);
}

function drawBunk(ctx: CanvasRenderingContext2D, x: number): void {
  const w = 96;
  // posts + top rail
  rect(ctx, x, 244, 4, FLOOR_Y - 244, PALETTE.frame);
  rect(ctx, x + w - 4, 244, 4, FLOOR_Y - 244, PALETTE.frame);
  rect(ctx, x, 244, w, 4, PALETTE.frame);

  const bunk = (y: number): void => {
    box(ctx, x + 4, y, w - 8, 14, PALETTE.wallLiv); // mattress
    rect(ctx, x + 8, y + 3, 20, 8, PALETTE.wallBed); // pillow
    rect(ctx, x + 32, y + 2, w - 40, 11, PALETTE.sleeping); // blanket
    rect(ctx, x + w / 2 - 8, y + 18, 16, 2, PALETTE.frame);
  };
  bunk(264);
  bunk(354);
  // ladder
  rect(ctx, x + w / 2 - 9, 244, 2, 120, PALETTE.frame);
  rect(ctx, x + w / 2 + 7, 244, 2, 120, PALETTE.frame);
  for (let y = 260; y < 360; y += 20) rect(ctx, x + w / 2 - 9, y, 18, 2, PALETTE.frame);
}

function drawShelf(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  box(ctx, x, y, w, 36, PALETTE.frame);
  rect(ctx, x + 2, y + 2, w - 4, 32, PALETTE.floor2);
  const colors = [PALETTE.working, PALETTE.idle, PALETTE.sleeping, PALETTE.wallBed, PALETTE.wallOff];
  for (let i = 0; i < 7; i += 1) {
    const bx = x + 6 + i * 14;
    const bh = 16 + ((i * 5) % 9);
    rect(ctx, bx, y + 30 - bh, 8, bh, colors[i % colors.length]);
  }
}

function drawSofa(ctx: CanvasRenderingContext2D): void {
  // backrest, arms, seat
  box(ctx, 380, 296, 168, 66, PALETTE.floor);
  box(ctx, 372, 336, 12, 44, PALETTE.floor2);
  box(ctx, 544, 336, 12, 44, PALETTE.floor2);
  box(ctx, 372, 360, 184, 20, PALETTE.floor2);
  // cushion seams
  rect(ctx, 436, 300, 1, 56, PALETTE.frame);
  rect(ctx, 492, 300, 1, 56, PALETTE.frame);
  rect(ctx, 372, 360, 184, 2, PALETTE.frame);
}

function drawChair(ctx: CanvasRenderingContext2D, x: number): void {
  box(ctx, x - 12, 316, 24, 56, PALETTE.floor2);
  box(ctx, x - 14, 372, 28, 10, PALETTE.floor);
  rect(ctx, x - 12, 382, 2, 8, PALETTE.frame);
  rect(ctx, x + 10, 382, 2, 8, PALETTE.frame);
}

function drawLamp(ctx: CanvasRenderingContext2D): void {
  rect(ctx, 351, 300, 2, FLOOR_Y - 300, PALETTE.frame);
  rect(ctx, 346, FLOOR_Y - 4, 12, 4, PALETTE.frame);
  box(ctx, 339, 286, 26, 6, PALETTE.wallLiv);
  rect(ctx, 343, 280, 18, 6, PALETTE.wallLiv);
  rect(ctx, 348, 274, 8, 6, PALETTE.wallLiv);
  rect(ctx, 351, 292, 2, 8, PALETTE.working); // warm bulb line
}

function drawPlant(ctx: CanvasRenderingContext2D): void {
  box(ctx, 628, 402, 16, 28, PALETTE.floor);
  rect(ctx, 630, 356, 4, 46, PALETTE.wallOff);
  rect(ctx, 622, 368, 6, 34, PALETTE.wallOff);
  rect(ctx, 640, 360, 6, 42, PALETTE.wallOff);
  rect(ctx, 618, 384, 8, 14, PALETTE.wallOff);
  rect(ctx, 644, 380, 6, 18, PALETTE.wallOff);
  rect(ctx, 632, 348, 2, 12, PALETTE.frame);
}

function drawOfficeDesk(ctx: CanvasRenderingContext2D, x: number, topY: number, legBottom: number): void {
  // legs
  rect(ctx, x - 31, topY + 10, 3, legBottom - topY - 10, PALETTE.frame);
  rect(ctx, x + 28, topY + 10, 3, legBottom - topY - 10, PALETTE.frame);
  // desktop
  box(ctx, x - 35, topY, 70, 10, PALETTE.floor);
  rect(ctx, x - 10, topY, 20, 3, PALETTE.wallBed); // keyboard
  // CRT monitor
  box(ctx, x - 14, topY - 32, 28, 30, PALETTE.frame);
  box(ctx, x - 11, topY - 29, 22, 24, PALETTE.sleeping);
  rect(ctx, x - 8, topY - 24, 2, 2, PALETTE.wallLiv);
  rect(ctx, x - 4, topY - 24, 2, 2, PALETTE.wallLiv);
  rect(ctx, x + 1, topY - 24, 2, 2, PALETTE.wallLiv);
  rect(ctx, x - 8, topY - 18, 16, 2, PALETTE.wallBed);
  rect(ctx, x - 6, topY - 14, 12, 2, PALETTE.wallBed);
  // desk lamp
  rect(ctx, x + 22, topY - 4, 10, 4, PALETTE.frame);
  rect(ctx, x + 26, topY - 16, 2, 12, PALETTE.frame);
  rect(ctx, x + 20, topY - 21, 12, 5, PALETTE.working);
  rect(ctx, x + 25, topY - 16, 2, 3, PALETTE.working);
}

function drawCorkboard(ctx: CanvasRenderingContext2D): void {
  box(ctx, 664, 84, 86, 42, PALETTE.frame);
  rect(ctx, 666, 86, 82, 38, PALETTE.floor2);
  rect(ctx, 672, 90, 14, 18, PALETTE.wallLiv);
  rect(ctx, 692, 93, 12, 16, PALETTE.wallBed);
  rect(ctx, 708, 89, 16, 20, PALETTE.wallOff);
  rect(ctx, 730, 94, 10, 14, PALETTE.wallLiv);
  rect(ctx, 676, 94, 6, 1, PALETTE.frame);
  rect(ctx, 696, 97, 4, 1, PALETTE.frame);
}

function drawWallClock(ctx: CanvasRenderingContext2D): void {
  box(ctx, 892, 88, 26, 26, PALETTE.wallLiv);
  rect(ctx, 904, 94, 2, 8, PALETTE.frame);
  rect(ctx, 904, 100, 8, 2, PALETTE.frame);
}

function drawBedroom(ctx: CanvasRenderingContext2D): void {
  drawWindow(ctx, 138, 82, 84, 64);
  drawBunk(ctx, 50);
  drawBunk(ctx, 210);
}

function drawLiving(ctx: CanvasRenderingContext2D): void {
  drawShelf(ctx, 360, 96, 110);
  // rug
  box(ctx, 388, 396, 224, 30, PALETTE.wallBed);
  ctx.strokeStyle = PALETTE.floor2;
  ctx.strokeRect(396.5, 401.5, 208, 18);
  drawLamp(ctx);
  drawSofa(ctx);
  drawChair(ctx, 571);
  drawChair(ctx, 607);
  drawPlant(ctx);
}

function drawOffice(ctx: CanvasRenderingContext2D): void {
  drawCorkboard(ctx);
  drawWallClock(ctx);
  // back row stands on a low platform
  box(ctx, 654, 344, 276, 8, PALETTE.floor2);
  for (const x of [700, 790, 880]) drawOfficeDesk(ctx, x, 304, 344);
  for (const x of [690, 780, 870]) drawOfficeDesk(ctx, x, 392, FLOOR_Y);
}

export interface SceneOptions {
  /** rooms that currently hold at least one character */
  occupied: Set<RoomId>;
}

export function drawScene(ctx: CanvasRenderingContext2D, opts: SceneOptions): void {
  // page
  rect(ctx, 0, 0, SCENE_W, SCENE_H, PALETTE.page);

  // room wallpaper
  for (const room of ROOM_IDS) {
    const r = ROOMS[room];
    rect(ctx, r.x, r.y, r.w, r.h, r.wall);
  }

  // room floor strips
  for (const room of ROOM_IDS) {
    const r = ROOMS[room];
    rect(ctx, r.x, 414, r.w, FLOOR_Y - 414, PALETTE.floor);
    rect(ctx, r.x, 414, r.w, 1, PALETTE.frame);
    for (let x = r.x + 24; x < r.x + r.w; x += 32) rect(ctx, x, 416, 1, 13, PALETTE.muted);
  }

  // corridor band
  rect(ctx, 30, FLOOR_Y, 900, 108, PALETTE.floor2);
  rect(ctx, 30, 466, 900, 1, PALETTE.muted);
  rect(ctx, 30, 502, 900, 1, PALETTE.muted);
  for (let x = 30; x < 930; x += 60) {
    rect(ctx, x + 20, FLOOR_Y, 1, 36, PALETTE.muted);
    rect(ctx, x + 50, 466, 1, 36, PALETTE.muted);
    rect(ctx, x + 20, 502, 1, 34, PALETTE.muted);
  }

  // house frame + divider walls
  rect(ctx, 24, 44, 912, 6, PALETTE.frame);
  rect(ctx, 24, 44, 6, 500, PALETTE.frame);
  rect(ctx, 930, 44, 6, 500, PALETTE.frame);
  rect(ctx, 24, 538, 912, 6, PALETTE.frame);
  rect(ctx, 326, 44, 6, 386, PALETTE.frame);
  rect(ctx, 646, 44, 6, 386, PALETTE.frame);

  // wall/floor seam
  rect(ctx, 30, 429, 900, 1, PALETTE.frame);

  // bottom wall with door openings
  rect(ctx, 30, FLOOR_Y, 900, 8, PALETTE.frame);
  for (const room of ROOM_IDS) {
    const r = ROOMS[room];
    rect(ctx, r.doorX - 22, FLOOR_Y, 44, 8, PALETTE.floor2);
    rect(ctx, r.doorX - 24, 414, 2, 16, PALETTE.frame);
    rect(ctx, r.doorX + 22, 414, 2, 16, PALETTE.frame);
  }

  // furniture
  drawBedroom(ctx);
  drawLiving(ctx);
  drawOffice(ctx);

  // labels in room corners (dim when the room is empty)
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const room of ROOM_IDS) {
    const r = ROOMS[room];
    ctx.fillStyle = opts.occupied.has(room) ? PALETTE.ink : PALETTE.muted;
    ctx.fillText(r.label, r.x + 10, r.y + 22);
  }
}

/** Accent dot color helper for the page legend. */
export function legendAccent(name: string): string {
  return HARNESS_ACCENT[name] ?? PALETTE.muted;
}
