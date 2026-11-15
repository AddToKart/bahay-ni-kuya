/**
 * Furniture validator v2 — DRAWN BOUNDS.
 *
 * Validates what is actually rendered, not just the 1x1 map footprint: every prop's
 * drawn rectangle is computed from its atlas frame size (public/atlas/meta.json), the
 * renderer's anchor/scale rules (object/wall props anchor top-left at tile origin; flip
 * mirrors in place and does not move the rectangle) converted to tile space.
 *
 * Fails on, with no allowlist and no "judged compliant" escape:
 *  - any two floor props whose drawn rects overlap (only: tabletop item fully on its
 *    table/desk/counter, rug under furniture, chair tucked into its desk's seat tile)
 *  - wall props not fully on the north-wall face band of their own room, or crossing a
 *    door/archway
 *  - floor props whose drawn rect crosses a wall edge, room boundary, door/archway, or
 *    whose base is not on a floor tile of their room
 *  - tabletop props not fully on a table/desk/counter drawn rect
 *  - tall props whose drawn rect overlaps another prop (covered by the overlap rule)
 *  - missing 1-tile clearance in front of desks/sofas/beds/counters/machines
 *  - chairs off their desk seat tile, not facing the desk, or with differing offsets in
 *    the same row
 *  - props off the 16px grid, unknown sprites, unreachable POIs
 *
 * Run: bun run validate-furniture (exit 0 pass / exit 1 with prop id, room, tile, rule).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Violation {
  prop: string;
  room: string;
  tile: [number, number];
  rule: string;
  detail: string;
}

const T = 16;

interface Prop {
  name: string;
  x: number;
  y: number;
  sprite: string;
  variant: string;
  flip: boolean;
  layer: "object" | "floor" | "wall";
}

interface Poi {
  name: string;
  x: number;
  y: number;
  room: string;
  facing: string;
}

interface RoomInfo {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MetaSprite {
  width: number;
  height: number;
  footprint: [number, number];
  walkable: boolean;
  layer?: string;
}

interface MapData {
  width: number;
  height: number;
  rooms: Record<string, RoomInfo>;
  layers: Array<{ name: string; data?: number[]; objects?: any[] }>;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), rel), "utf8")) as T;
}

function prop(o: any, name: string): any {
  return o.properties?.find((p: any) => p.name === name)?.value;
}

export function loadValidationInputs(): { map: MapData; meta: Record<string, MetaSprite> } {
  const map = loadJson<MapData>("public/map/house.json");
  const metaJson = loadJson<{ sprites: Record<string, MetaSprite> }>("public/atlas/meta.json");
  return { map, meta: metaJson.sprites };
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const contains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export function validateFurniture(input = loadValidationInputs()): Violation[] {
  const { map, meta } = input;
  const W = map.width;
  const layer = (name: string): number[] =>
    map.layers.find((l) => l.name === name)?.data ?? new Array(W * map.height).fill(0);
  const walls = layer("walls");
  const doors = layer("doors");
  const collision = layer("collision");

  const at = (data: number[], x: number, y: number): number =>
    x < 0 || y < 0 || x >= map.width || y >= map.height ? -1 : data[y * W + x];
  const isWalkable = (x: number, y: number): boolean => at(collision, x, y) === 0;

  const roomAt = (x: number, y: number): string | null => {
    for (const [name, r] of Object.entries(map.rooms)) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return name;
    }
    return null;
  };
  const roomOfTile = (x: number, y: number): RoomInfo | null => {
    const name = roomAt(x, y);
    return name ? map.rooms[name] : null;
  };

  const rawProps = map.layers.find((l) => l.name === "props")?.objects ?? [];
  const props: Prop[] = rawProps.map((o) => ({
    name: o.name as string,
    x: Math.round(o.x / T),
    y: Math.round(o.y / T),
    sprite: prop(o, "sprite") as string,
    variant: (prop(o, "variant") as string) ?? "",
    flip: Boolean(prop(o, "flip")),
    layer: ((prop(o, "layer") as string) ?? "object") as Prop["layer"],
  }));

  const violations: Violation[] = [];
  const push = (p: Prop, rule: string, detail: string, tile?: [number, number]): void => {
    const room = roomAt(p.x, p.y) ?? roomAt(tile?.[0] ?? p.x, tile?.[1] ?? p.y) ?? "outside";
    violations.push({ prop: p.name, room, tile: tile ?? [p.x, p.y], rule, detail });
  };

  // Grid snap + sprite known
  for (const o of rawProps) {
    if (o.x % T !== 0 || o.y % T !== 0) {
      violations.push({ prop: o.name, room: roomAt(Math.round(o.x / T), Math.round(o.y / T)) ?? "outside", tile: [Math.round(o.x / T), Math.round(o.y / T)], rule: "grid", detail: `not on the 16px grid (${o.x},${o.y})` });
    }
  }

  // Drawn rect and room bounds
  const drawn = new Map<string, Rect>();
  for (const p of props) {
    const m = meta[p.sprite];
    if (!m) {
      push(p, "sprite", `unknown sprite "${p.sprite}"`);
      continue;
    }
    const rect: Rect = { x: p.x, y: p.y, w: m.width / T, h: m.height / T };
    drawn.set(p.name, rect);

    const anchorRoom = roomOfTile(p.x, p.y);
    const hallwayFace = !anchorRoom && (p.y === 11 || p.y === 15) && p.x >= 1 && p.x <= 40;
    const room = anchorRoom ?? (hallwayFace ? map.rooms.hallway : null);
    if (!room) {
      push(p, "room", "drawn prop anchored outside any room");
      continue;
    }

    if (p.layer === "wall") {
      // North-wall face band: top rooms cap row 0 + plaster face row 1 => band rows 1..2;
      // bottom rooms divider row 15 => band rows 15..16; hallway faces 11..12 or 15..16.
      const bandStart = hallwayFace ? p.y : room.y === 1 ? 1 : 15;
      const inX = p.x >= room.x && p.x + rect.w <= room.x + room.w;
      const inBand = p.y === bandStart && p.y + rect.h <= bandStart + 2;
      if (!WALL_PROPS[p.sprite] && m.layer !== "wall" && !p.sprite.startsWith("wall-")) {
        push(p, "wall-band", `${p.sprite} is not a wall-type sprite`);
      }
      if (!inBand) push(p, "wall-band", `drawn rect rows ${p.y}..${+(p.y + rect.h).toFixed(2)} not fully on face band rows ${bandStart}..${bandStart + 2}`);
      if (!inX) push(p, "wall-band", `drawn rect x ${p.x}..${+(p.x + rect.w).toFixed(2)} crosses the room x-range ${room.x}..${room.x + room.w}`);
      for (let ty = Math.floor(p.y); ty < p.y + rect.h; ty++) {
        for (let tx = Math.floor(p.x); tx < p.x + rect.w; tx++) {
          if (at(doors, tx, ty) > 0) push(p, "door-overlap", `covers door/archway tile (${tx},${ty})`, [tx, ty]);
        }
      }
      continue;
    }

    // Floor props (object + floor/rungs): every tile of the drawn rect inside the room,
    // not on a wall or door.
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

  // Drawn-rect overlap
  const list = props.filter((p) => drawn.has(p.name));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const ra = drawn.get(a.name) as Rect;
      const rb = drawn.get(b.name) as Rect;
      if (!overlaps(ra, rb)) continue;

      const rug = (p: Prop): boolean => p.layer === "floor" && /rug|mat/.test(p.sprite);
      const tabletopOn = (p: Prop, carrier: Prop): boolean =>
        TABLETOP[p.sprite] === true && CARRIER[carrier.sprite] === true && contains(drawn.get(carrier.name) as Rect, drawn.get(p.name) as Rect);
      const chairOnDesk = (chair: Prop, desk: Prop): boolean =>
        chair.sprite === "chair" && DESK[desk.sprite] === true && chair.y === desk.y + 1 && chair.x >= desk.x && chair.x < desk.x + (meta[desk.sprite]?.width ?? T) / T;

      if (rug(a) || rug(b)) continue;
      if (tabletopOn(a, b) || tabletopOn(b, a)) continue;
      if (chairOnDesk(a, b) || chairOnDesk(b, a)) continue;

      violations.push({
        prop: b.name,
        room: roomAt(b.x, b.y) ?? "outside",
        tile: [b.x, b.y],
        rule: "drawn-overlap",
        detail: `drawn rect overlaps ${a.name} (${a.sprite}) at x${ra.x}..${+(ra.x + ra.w).toFixed(2)} y${ra.y}..${+(ra.y + ra.h).toFixed(2)}`,
      });
    }
  }

  // Tabletop props fully on a carrier drawn rect
  for (const p of props) {
    if (!TABLETOP[p.sprite]) continue;
    const rect = drawn.get(p.name);
    if (!rect) continue;
    const carrier = props.find((c) => CARRIER[c.sprite] && contains(drawn.get(c.name) as Rect, rect));
    if (!carrier) push(p, "tabletop", "tabletop prop is not fully on a table/desk/counter drawn rect");
  }

  // Chairs: desk seat tile, facing desk, uniform offset per row
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
    if (offset !== expected) push(chair, "chair-center", `chair offset ${offset} != desk seat offset ${expected} (desk ${desk.name})`);
    const prev = rowOffsets.get(desk.y);
    if (prev !== undefined && prev !== offset) push(chair, "chair-row", `offset ${offset} differs from row offset ${prev}`);
    else rowOffsets.set(desk.y, offset);
  }
  // facing: office desk POI on the chair tile must face up (toward the desk)
  const poiRaw = map.layers.find((l) => l.name === "pois")?.objects ?? [];
  const pois: Poi[] = poiRaw.map((o) => ({
    name: o.name as string,
    x: Math.round(o.x / T),
    y: Math.round(o.y / T),
    room: (prop(o, "room") as string) ?? "",
    facing: (prop(o, "facing") as string) ?? "down",
  }));
  for (const chair of chairs) {
    const poi = pois.find((p) => p.name.startsWith("office_desk_") || p.name.startsWith("subagent_desk_") ? p.x === chair.x && p.y === chair.y : false);
    if (poi && poi.facing !== "up") {
      violations.push({ prop: poi.name, room: poi.room, tile: [poi.x, poi.y], rule: "chair-facing", detail: `desk POI faces ${poi.facing}, expected up (toward the desk)` });
    }
  }

  // Clearance: one walkable tile in front (footprint bottom + 1)
  for (const p of props) {
    if (p.layer !== "object" || !CLEARANCE[p.sprite]) continue;
    const m = meta[p.sprite];
    if (!m) continue;
    const frontY = p.y + m.footprint[1];
    let free = false;
    for (let dx = 0; dx < m.footprint[0]; dx++) if (isWalkable(p.x + dx, frontY)) free = true;
    if (!free) push(p, "clearance", `no walkable clearance tile in front (row ${frontY})`, [p.x, frontY]);
  }

  // POI reachability (standing tile or approach tile walkable)
  for (const poi of pois) {
    if (poi.name.startsWith("door_")) {
      if (!isWalkable(poi.x, poi.y)) violations.push({ prop: poi.name, room: poi.room, tile: [poi.x, poi.y], rule: "poi-blocked", detail: "door tile is solid" });
      continue;
    }
    if (isWalkable(poi.x, poi.y)) continue;
    const front = (() => {
      switch (poi.facing) {
        case "up":
          return [poi.x, poi.y - 1];
        case "left":
          return [poi.x - 1, poi.y];
        case "right":
          return [poi.x + 1, poi.y];
        default:
          return [poi.x, poi.y + 1];
      }
    })();
    if (!isWalkable(front[0], front[1])) {
      violations.push({ prop: poi.name, room: poi.room, tile: [poi.x, poi.y], rule: "poi-blocked", detail: `standing and approach tiles (${front[0]},${front[1]}) are solid` });
    }
  }

  return violations;
}

function main(): void {
  const violations = validateFurniture();
  if (violations.length > 0) {
    console.error(`FAIL: ${violations.length} drawn-bounds violation(s):`);
    for (const v of violations) console.error(`  - [${v.rule}] ${v.prop} (${v.room}) @ (${v.tile[0]},${v.tile[1]}): ${v.detail}`);
    process.exit(1);
  }
  console.log("validate-furniture OK (drawn bounds)");
}

if (import.meta.main) main();
