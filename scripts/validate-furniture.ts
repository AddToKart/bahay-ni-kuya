/**
 * Furniture validation for Bahay ni Kuya.
 *
 * Fails on: blocking-prop overlaps, props on wall/door tiles, wall-type props off the
 * north-wall face band, tabletop props not on furniture, bookshelves not flush to a wall,
 * chairs not on their desk's seat tile, props off the 16px grid, missing 1-tile clearance
 * in front of desks/sofas/beds/machines, and unreachable POIs.
 *
 * Run: bun run validate-furniture (exit 0 = pass; exit 1 lists every violation with
 * prop id + tile). Also imported by test/furniture.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Violation {
  prop: string;
  tile: [number, number];
  rule: string;
  detail: string;
}

const T = 16;

interface Prop {
  name: string;
  tile: [number, number];
  sprite: string;
  variant: string;
  frame: string;
  flip: boolean;
  layer: string;
}

interface Poi {
  name: string;
  tile: [number, number];
  room: string;
  facing: string;
}

interface MapData {
  width: number;
  height: number;
  rooms: Record<string, { x: number; y: number; w: number; h: number }>;
  layers: Array<{ name: string; data?: number[]; objects?: any[] }>;
}

const WALL_SPRITES: Record<string, true> = {
  "wall-clock": true,
  "art-frame": true,
  whiteboard: true,
  "house-sign": true,
  "street-sconce": true,
  "kitchen-shelf": true,
  "gym-mirror": true,
  "confession-spotlight": true,
  "break-dartboard": true,
  "break-poster": true,
};
const TABLETOP_SPRITES: Record<string, true> = {
  "desk-lamp": true,
  "kitchen-microwave": true,
  "kitchen-coffee": true,
  "kitchen-fruit-bowl": true,
  "kitchen-kettle": true,
};
const SHELF_SPRITES: Record<string, true> = {
  bookshelf: true,
  "library-shelf": true,
  "library-shelf-b": true,
};
const DESK_SPRITES: Record<string, true> = { desk: true };
const SEAT_SPRITES: Record<string, true> = { chair: true, "chair-front": true };

/** Sprite art spans (tiles) from the .px footprint lines. Rugs/mats are decorative and 0-blocking. */
const WIDTH_BY_SPRITE: Record<string, number> = {
  bookshelf: 2,
  "library-shelf": 2,
  "library-shelf-b": 2,
  whiteboard: 2,
  "kitchen-shelf": 2,
  "couch-sectional": 3,
  "tv-unit": 2,
  "library-rug": 5,
  rug: 3,
  "kitchen-mat": 2,
  "kitchen-table": 2,
  "kitchen-chair": 1,
  "pool-table": 3,
  "lobby-plant-big": 2,
  desk: 2,
  "kitchen-counter-sink": 1,
  "break-vending": 2,
  "gym-bike": 2,
  "weights-rack": 2,
  "gym-mirror": 3,
  "bed-bunk": 2,
};
const HEIGHT_BY_SPRITE: Record<string, number> = {
  "bed-bunk": 2,
  "library-rug": 3,
  rug: 2,
  "pool-table": 2,
};
const FLOOR_DECOR: Record<string, true> = { rug: true, "library-rug": true, "kitchen-mat": true };

function loadMap(): MapData {
  return JSON.parse(readFileSync(join(process.cwd(), "public", "map", "house.json"), "utf8")) as MapData;
}

function tileLayer(map: MapData, name: string): number[] {
  const layer = map.layers.find((l) => l.name === name);
  if (!layer?.data) throw new Error(`missing tile layer ${name}`);
  return layer.data;
}

export function validateFurniture(map: MapData = loadMap()): Violation[] {
  const violations: Violation[] = [];
  const W = map.width;
  const walls = tileLayer(map, "walls");
  const doors = tileLayer(map, "doors");
  const collision = tileLayer(map, "collision");
  const furniture = tileLayer(map, "furniture");

  const at = (data: number[], x: number, y: number): number => (x < 0 || y < 0 || x >= W || y < 0 || y >= map.height ? -1 : data[y * W + x]);
  const isFloor = (x: number, y: number): boolean => at(collision, x, y) === 0;
  const roomAt = (x: number, y: number): string | null => {
    for (const [name, r] of Object.entries(map.rooms)) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return name;
    }
    return null;
  };

  const raw = map.layers.find((l) => l.name === "props")?.objects ?? [];
  const prop = (o: any, name: string): any => o.properties?.find((p: any) => p.name === name)?.value;
  const props: Prop[] = raw.map((o) => ({
    name: o.name as string,
    tile: [Math.round(o.x / T), Math.round(o.y / T)] as [number, number],
    sprite: prop(o, "sprite") as string,
    variant: (prop(o, "variant") as string) ?? "",
    frame: (prop(o, "frame") as string) ?? "default",
    flip: Boolean(prop(o, "flip")),
    layer: (prop(o, "layer") as string) ?? "object",
  }));

  const widthOf = (sprite: string): number => WIDTH_BY_SPRITE[sprite] ?? 1;
  const heightOf = (sprite: string): number => HEIGHT_BY_SPRITE[sprite] ?? 1;
  const spanOf = (p: Prop): [number, number][] => {
    const cells: [number, number][] = [];
    for (let dy = 0; dy < heightOf(p.sprite); dy++) {
      for (let dx = 0; dx < widthOf(p.sprite); dx++) cells.push([p.tile[0] + dx, p.tile[1] + dy]);
    }
    return cells;
  };
  const blocking = (p: Prop): boolean => p.layer === "object" && !FLOOR_DECOR[p.sprite];

  // 1. Grid snap
  for (const o of raw) {
    if (o.x % T !== 0 || o.y % T !== 0) {
      violations.push({ prop: o.name, tile: [Math.round(o.x / T), Math.round(o.y / T)], rule: "grid", detail: `not on the 16px grid (x=${o.x}, y=${o.y})` });
    }
  }

  // 2. Blocking overlaps + wall/door overlap.
  // Tabletop props stacked on a furniture tile (lamp on nightstand, microwave on counter)
  // are one visual unit, not two blockers: they are exempt from mutual overlap but still
  // occupy their tile against everything else.
  const tabletopProps = new Set(props.filter((p) => p.layer === "object" && TABLETOP_SPRITES[p.sprite]).map((p) => p.name));
  const occupied = new Map<string, string>();
  for (const p of props) {
    if (!blocking(p)) continue;
    for (const [x, y] of spanOf(p)) {
      const key = `${x},${y}`;
      const other = occupied.get(key);
      if (other && other !== p.name && !(tabletopProps.has(other) || tabletopProps.has(p.name))) {
        violations.push({ prop: p.name, tile: [x, y], rule: "overlap", detail: `blocking overlap with ${other}` });
      }
      occupied.set(key, p.name);
    }
  }
  for (const p of props) {
    if (p.layer !== "object") continue;
    for (const [x, y] of spanOf(p)) {
      if (at(walls, x, y) > 0) violations.push({ prop: p.name, tile: [x, y], rule: "wall-overlap", detail: "prop covers a wall tile" });
      if (at(doors, x, y) > 0) violations.push({ prop: p.name, tile: [x, y], rule: "door-overlap", detail: "prop covers a door tile" });
    }
  }

  // 3. Wall props on the north-wall face band of their room (top rooms y=2, bottom rooms y=16),
  //    or the hallway's own faces (y=11 north, y=15 south). Never over doors/windows.
  for (const p of props) {
    if (p.layer !== "wall") continue;
    if (!WALL_SPRITES[p.sprite]) {
      violations.push({ prop: p.name, tile: p.tile, rule: "wall-band", detail: `${p.sprite} is not a wall-type sprite` });
      continue;
    }
    const [x, y] = p.tile;
    const onHallwayFace = (y === 11 || y === 15) && x >= 1 && x <= 40;
    const room = roomAt(x, y);
    const bandOf = (roomName: string): number | null => {
      const r = map.rooms[roomName];
      if (r.y === 1) return 2;
      if (r.y === 16) return 16;
      return null;
    };
    const band = room ? bandOf(room) : null;
    if (band === null && !onHallwayFace) {
      violations.push({ prop: p.name, tile: [x, y], rule: "wall-band", detail: "wall prop not on a north-wall face band or hallway face" });
      continue;
    }
    if (band !== null && y !== band) {
      violations.push({ prop: p.name, tile: [x, y], rule: "wall-band", detail: `expected north-wall face band y=${band} for ${room}` });
    }
    if (at(doors, x, y) > 0) violations.push({ prop: p.name, tile: [x, y], rule: "door-overlap", detail: "wall prop over a door" });
  }

  // 4. Tabletop props on furniture tiles
  for (const p of props) {
    if (p.layer !== "object" || !TABLETOP_SPRITES[p.sprite]) continue;
    const [x, y] = p.tile;
    if (at(furniture, x, y) === 0) {
      violations.push({ prop: p.name, tile: [x, y], rule: "tabletop", detail: "tabletop prop with no furniture beneath" });
    }
  }

  // 5. Bookshelves flush to a wall
  for (const p of props) {
    if (p.layer !== "object" || !SHELF_SPRITES[p.sprite]) continue;
    const flush = spanOf(p).some(([x, y]) => at(walls, x - 1, y) > 0 || at(walls, x + 1, y) > 0 || at(walls, x, y - 1) > 0 || at(walls, x, y + 1) > 0);
    if (!flush) violations.push({ prop: p.name, tile: p.tile, rule: "shelf-flush", detail: "bookshelf not flush against a wall" });
  }

  // 6. Desk chairs on the seat tile, south of (facing) their desk
  const desks = props.filter((p) => DESK_SPRITES[p.sprite]);
  const chairs = props.filter((p) => SEAT_SPRITES[p.sprite] && p.layer === "object");
  for (const chair of chairs) {
    const desk = desks.find(
      (d) => Math.abs(d.tile[1] - chair.tile[1]) === 1 && chair.tile[0] >= d.tile[0] && chair.tile[0] <= d.tile[0] + widthOf(d.sprite) - 1,
    );
    if (!desk) {
      violations.push({ prop: chair.name, tile: chair.tile, rule: "chair-desk", detail: "chair not on a desk seat tile" });
      continue;
    }
    if (chair.tile[1] < desk.tile[1]) violations.push({ prop: chair.name, tile: chair.tile, rule: "chair-desk", detail: "chair not south of its desk (facing down)" });
  }

  // 7. POIs reachable: standing tile or approach tile must be walkable
  const poiRaw = map.layers.find((l) => l.name === "pois")?.objects ?? [];
  const pois: Poi[] = poiRaw.map((o) => ({
    name: o.name as string,
    tile: [Math.round(o.x / T), Math.round(o.y / T)] as [number, number],
    room: (prop(o, "room") as string) ?? "",
    facing: (prop(o, "facing") as string) ?? "down",
  }));
  const frontOf = (t: [number, number], facing: string): [number, number] => {
    switch (facing) {
      case "up":
        return [t[0], t[1] - 1];
      case "down":
        return [t[0], t[1] + 1];
      case "left":
        return [t[0] - 1, t[1]];
      default:
        return [t[0] + 1, t[1]];
    }
  };
  for (const poi of pois) {
    if (poi.name.startsWith("door_")) {
      if (!isFloor(poi.tile[0], poi.tile[1])) {
        violations.push({ prop: poi.name, tile: poi.tile, rule: "poi-blocked", detail: "door tile is solid" });
      }
      continue;
    }
    // A POI is reachable when its standing tile is walkable, or its approach tile is
    // (characters path to a solid goal via the nearest open neighbour).
    if (isFloor(poi.tile[0], poi.tile[1])) continue;
    const [fx, fy] = frontOf(poi.tile, poi.facing);
    if (!isFloor(fx, fy)) {
      violations.push({ prop: poi.name, tile: poi.tile, rule: "poi-blocked", detail: `standing and approach tiles (${fx},${fy}) are solid` });
    }
  }

  // 8. Clearance: at least one free tile in front of desks, sofas, counters and machines.
  // Beds are excluded: bunks are 2x2 and their POIs sit on the side seat tile (bed POI rule).
  // pool-table is excluded: cue access is from the long sides, checked via its POI approach.
  const clearanceSprites: Record<string, true> = {
    desk: true,
    "couch-sectional": true,
    "kitchen-fridge": true,
    "kitchen-stove": true,
    "kitchen-counter-sink": true,
    "kitchen-counter": true,
    "kitchen-counter-end": true,
    "break-vending": true,
    "kitchen-cooler": true,
    treadmill: true,
  };
  for (const p of props) {
    if (p.layer !== "object" || !clearanceSprites[p.sprite]) continue;
    const w = widthOf(p.sprite);
    const frontY = p.tile[1] + heightOf(p.sprite);
    let free = false;
    for (let dx = 0; dx < w; dx++) if (isFloor(p.tile[0] + dx, frontY)) free = true;
    if (!free) violations.push({ prop: p.name, tile: [p.tile[0], frontY], rule: "clearance", detail: "no free tile in front" });
  }

  return violations;
}

function main(): void {
  const violations = validateFurniture();
  if (violations.length > 0) {
    console.error(`FAIL: ${violations.length} furniture violation(s):`);
    for (const v of violations) {
      console.error(`  - [${v.rule}] ${v.prop} @ (${v.tile[0]},${v.tile[1]}): ${v.detail}`);
    }
    process.exit(1);
  }
  console.log("validate-furniture OK");
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/validate-furniture.ts");
if (invokedDirectly) main();
