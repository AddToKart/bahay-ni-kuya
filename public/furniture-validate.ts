// Browser mirror of scripts/validate-furniture.ts (drawn-bounds rules).
// The Node script reads house.json + atlas meta from disk; this version validates the
// already-loaded HouseMap with the atlas meta the renderer holds.
import type { HouseMap, MapPOI, MapProp } from "./map.js";

export interface Violation {
  prop: string;
  room: string;
  tile: [number, number];
  rule: string;
  detail: string;
}

const T = 16;

interface MetaSprite {
  width: number;
  height: number;
  footprint: [number, number];
  walkable: boolean;
  layer?: string;
}

const WALL_PROPS: Record<string, true> = {
  "art-frame": true,
  "wall-clock": true,
  whiteboard: true,
  "house-sign": true,
  "street-sconce": true,
  "kitchen-shelf": true,
  "gym-mirror": true,
  "confession-spotlight": true,
  "break-dartboard": true,
  "break-poster": true,
};
const TABLETOP: Record<string, true> = {
  "desk-lamp": true,
  "kitchen-microwave": true,
  "kitchen-coffee": true,
  "kitchen-fruit-bowl": true,
  "kitchen-kettle": true,
};
const CARRIER: Record<string, true> = {
  "library-side-table": true,
  "kitchen-counter": true,
  "kitchen-counter-end": true,
  "kitchen-counter-sink": true,
  desk: true,
  "kitchen-table": true,
  "break-coffee-table": true,
  "library-table": true,
};
const DESK: Record<string, true> = { desk: true };
const CLEARANCE: Record<string, true> = {
  desk: true,
  "couch-sectional": true,
  "bed-bunk": true,
  "kitchen-fridge": true,
  "kitchen-stove": true,
  "kitchen-counter-sink": true,
  "kitchen-counter": true,
  "kitchen-counter-end": true,
  "break-vending": true,
  "kitchen-cooler": true,
  treadmill: true,
  "pool-table": true,
  "kitchen-table": true,
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export function validateFurniture(map: HouseMap, meta: Record<string, MetaSprite>): Violation[] {
  const W = map.width;
  const walls = map.walls;
  const doors = map.doors;
  const collision = map.collision;
  const at = (data: number[], x: number, y: number): number =>
    x < 0 || y < 0 || x >= map.width || y >= map.height ? -1 : data[y * W + x];
  const walkable = (x: number, y: number): boolean => at(collision, x, y) === 0;
  const rooms = map.rooms as Record<string, { x: number; y: number; w: number; h: number }>;
  const roomAt = (x: number, y: number): string | null => {
    for (const [name, r] of Object.entries(rooms)) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return name;
    }
    return null;
  };
  const roomOf = (x: number, y: number) => {
    const name = roomAt(x, y);
    return name ? rooms[name] : null;
  };

  const props = (map.props ?? []) as MapProp[];
  const violations: Violation[] = [];
  const push = (p: { id: string; x: number; y: number }, rule: string, detail: string, tile?: [number, number]): void => {
    violations.push({ prop: p.id, room: roomAt(p.x, p.y) ?? "outside", tile: tile ?? [p.x, p.y], rule, detail });
  };

  const drawn = new Map<string, Rect>();
  for (const p of props) {
    const m = meta[p.sprite];
    if (!m) {
      push(p, "sprite", `unknown sprite "${p.sprite}"`);
      continue;
    }
    const rect: Rect = { x: p.x, y: p.y, w: m.width / T, h: m.height / T };
    drawn.set(p.id, rect);

    const anchorRoom = roomOf(p.x, p.y);
    const hallwayFace = !anchorRoom && (p.y === 11 || p.y === 15) && p.x >= 1 && p.x <= 40;
    const room = anchorRoom ?? (hallwayFace ? map.rooms.hallway : null);
    if (!room) {
      push(p, "room", "drawn prop anchored outside any room");
      continue;
    }

    if (p.layer === "wall") {
      const bandStart = hallwayFace ? p.y : room.y === 1 ? 1 : 15;
      const inX = p.x >= room.x && p.x + rect.w <= room.x + room.w;
      const inBand = p.y === bandStart && p.y + rect.h <= bandStart + 2;
      if (!WALL_PROPS[p.sprite] && m.layer !== "wall" && !p.sprite.startsWith("wall-")) {
        push(p, "wall-band", `${p.sprite} is not a wall-type sprite`);
      }
      if (!inBand) push(p, "wall-band", `drawn rect rows ${p.y}..${+(p.y + rect.h).toFixed(2)} not fully on face band rows ${bandStart}..${bandStart + 2}`);
      if (!inX) push(p, "wall-band", `drawn rect crosses the room x-range`);
      for (let ty = Math.floor(p.y); ty < p.y + rect.h; ty++) {
        for (let tx = Math.floor(p.x); tx < p.x + rect.w; tx++) {
          if (at(doors, tx, ty) > 0) push(p, "door-overlap", `covers door/archway tile (${tx},${ty})`, [tx, ty]);
        }
      }
      continue;
    }

    for (let ty = Math.floor(p.y); ty < Math.ceil(p.y + rect.h); ty++) {
      for (let tx = Math.floor(p.x); tx < Math.ceil(p.x + rect.w); tx++) {
        const inRoom = tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h;
        if (!inRoom) {
          push(p, "room-boundary", `drawn rect crosses room boundary at (${tx},${ty})`, [tx, ty]);
          continue;
        }
        if (at(walls, tx, ty) > 0) push(p, "wall-overlap", `drawn rect covers wall tile (${tx},${ty})`, [tx, ty]);
        if (at(doors, tx, ty) > 0) push(p, "door-overlap", `drawn rect covers door/archway tile (${tx},${ty})`, [tx, ty]);
      }
    }
  }

  const list = props.filter((p) => drawn.has(p.id));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const ra = drawn.get(a.id) as Rect;
      const rb = drawn.get(b.id) as Rect;
      if (!overlaps(ra, rb)) continue;
      const rug = (p: MapProp): boolean => (p.layer ?? "object") === "floor" && /rug|mat/.test(p.sprite);
      const tabletopOn = (p: MapProp, carrier: MapProp): boolean =>
        TABLETOP[p.sprite] === true && CARRIER[carrier.sprite] === true && contains(drawn.get(carrier.id) as Rect, drawn.get(p.id) as Rect);
      const chairOnDesk = (chair: MapProp, desk: MapProp): boolean =>
        chair.sprite === "chair" && DESK[desk.sprite] === true && chair.y === desk.y + 1 && chair.x >= desk.x && chair.x < desk.x + (meta[desk.sprite]?.width ?? T) / T;
      if (rug(a) || rug(b)) continue;
      if (tabletopOn(a, b) || tabletopOn(b, a)) continue;
      if (chairOnDesk(a, b) || chairOnDesk(b, a)) continue;
      violations.push({ prop: b.id, room: roomAt(b.x, b.y) ?? "outside", tile: [b.x, b.y], rule: "drawn-overlap", detail: `drawn rect overlaps ${a.id} (${a.sprite})` });
    }
  }

  for (const p of props) {
    if (!TABLETOP[p.sprite]) continue;
    const rect = drawn.get(p.id);
    if (!rect) continue;
    const carrier = props.find((c) => CARRIER[c.sprite] && contains(drawn.get(c.id) as Rect, rect));
    if (!carrier) push(p, "tabletop", "tabletop prop is not fully on a table/desk/counter");
  }

  const desks = props.filter((p) => DESK[p.sprite]);
  const chairs = props.filter((p) => p.sprite === "chair");
  const rowOffsets = new Map<number, number>();
  for (const chair of chairs) {
    const desk = desks.find((d) => {
      const w = (meta[d.sprite]?.width ?? T) / T;
      return chair.y === d.y + 1 && chair.x >= d.x && chair.x < d.x + w;
    });
    if (!desk) {
      push(chair, "chair-desk", "chair is not on a desk seat tile");
      continue;
    }
    const offset = chair.x - desk.x;
    const expected = Math.floor(((meta[desk.sprite]?.width ?? T) / T - 1) / 2);
    if (offset !== expected) push(chair, "chair-center", `chair offset ${offset} != desk seat offset ${expected}`);
    const prev = rowOffsets.get(desk.y);
    if (prev !== undefined && prev !== offset) push(chair, "chair-row", `offset differs from row offset ${prev}`);
    else rowOffsets.set(desk.y, offset);
  }
  for (const chair of chairs) {
    const poi = (map.pois ?? []).find((q: MapPOI) => (q.id.startsWith("office_desk_") || q.id.startsWith("subagent_desk_")) && q.x === chair.x && q.y === chair.y);
    if (poi && poi.facing !== "up") {
      violations.push({ prop: poi.id, room: poi.room, tile: [poi.x, poi.y], rule: "chair-facing", detail: `desk POI faces ${poi.facing}, expected up` });
    }
  }

  for (const p of props) {
    if ((p.layer ?? "object") !== "object" || !CLEARANCE[p.sprite]) continue;
    const m = meta[p.sprite];
    if (!m) continue;
    const frontY = p.y + m.footprint[1];
    let free = false;
    for (let dx = 0; dx < m.footprint[0]; dx++) if (walkable(p.x + dx, frontY)) free = true;
    if (!free) push(p, "clearance", `no walkable clearance tile in front (row ${frontY})`, [p.x, frontY]);
  }

  for (const poi of map.pois ?? []) {
    if (poi.id.startsWith("door_")) {
      if (!walkable(poi.x, poi.y)) violations.push({ prop: poi.id, room: poi.room, tile: [poi.x, poi.y], rule: "poi-blocked", detail: "door tile is solid" });
      continue;
    }
    if (walkable(poi.x, poi.y)) continue;
    const front =
      poi.facing === "up"
        ? [poi.x, poi.y - 1]
        : poi.facing === "left"
          ? [poi.x - 1, poi.y]
          : poi.facing === "right"
            ? [poi.x + 1, poi.y]
            : [poi.x, poi.y + 1];
    if (!walkable(front[0], front[1])) {
      violations.push({ prop: poi.id, room: poi.room, tile: [poi.x, poi.y], rule: "poi-blocked", detail: `standing and approach tiles (${front[0]},${front[1]}) are solid` });
    }
  }

  return violations;
}
