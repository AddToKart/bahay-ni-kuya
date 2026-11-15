// Browser-side furniture validator for the G-key debug overlay in renderer.ts.
// Same rules as scripts/validate-furniture.ts, typed against the loaded HouseMap
// (map.ts already normalizes props/pois into tile coordinates and plain fields).
import type { HouseMap, MapPOI, MapProp } from "./map.js";

export interface Violation {
  prop: string;
  tile: [number, number];
  rule: string;
  detail: string;
}

const T = 16;

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

interface CheckedProp {
  name: string;
  tile: [number, number];
  sprite: string;
  layer: string;
}

function layerOf(map: HouseMap, name: string): number[] {
  const raw = (map as unknown as { layers?: Array<{ name: string; data?: number[] }> }).layers;
  return raw?.find((l) => l.name === name)?.data ?? [];
}

export function validateFurniture(map: HouseMap): Violation[] {
  const violations: Violation[] = [];
  const W = map.width;
  const walls = map.walls;
  const doors = map.doors;
  const collision = map.collision;
  const furniture = map.furniture;

  const at = (data: number[], x: number, y: number): number =>
    x < 0 || y < 0 || x >= W || y >= map.height ? -1 : data[y * W + x];
  const isFloor = (x: number, y: number): boolean => at(collision, x, y) === 0;
  const roomAt = (x: number, y: number): string | null => {
    for (const [name, r] of Object.entries(map.rooms)) {
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return name;
    }
    return null;
  };

  const props: CheckedProp[] = map.props.map((p: MapProp) => ({
    name: p.id,
    tile: [p.x, p.y] as [number, number],
    sprite: p.sprite,
    layer: p.layer ?? "object",
  }));

  const widthOf = (sprite: string): number => WIDTH_BY_SPRITE[sprite] ?? 1;
  const heightOf = (sprite: string): number => HEIGHT_BY_SPRITE[sprite] ?? 1;
  const spanOf = (p: CheckedProp): [number, number][] => {
    const cells: [number, number][] = [];
    for (let dy = 0; dy < heightOf(p.sprite); dy++) {
      for (let dx = 0; dx < widthOf(p.sprite); dx++) cells.push([p.tile[0] + dx, p.tile[1] + dy]);
    }
    return cells;
  };
  const blocking = (p: CheckedProp): boolean => p.layer === "object" && !FLOOR_DECOR[p.sprite];

  // 1. Blocking overlaps + wall/door overlap
  const tabletopProps = new Set(map.props.filter((p) => p.layer !== "wall" && p.layer !== "floor" && TABLETOP_SPRITES[p.sprite]).map((p) => p.id));
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

  // 2. Wall props on the north-wall face band or hallway faces
  for (const p of map.props) {
    if ((p.layer ?? "object") !== "wall") continue;
    if (!WALL_SPRITES[p.sprite]) {
      violations.push({ prop: p.id, tile: [p.x, p.y], rule: "wall-band", detail: `${p.sprite} is not a wall-type sprite` });
      continue;
    }
    const x = p.x;
    const y = p.y;
    const onHallwayFace = (y === 11 || y === 15) && x >= 1 && x <= 40;
    const room = roomAt(x, y);
    let band: number | null = null;
    if (room) {
      const r = map.rooms[room as keyof typeof map.rooms];
      if (r.y === 1) band = 2;
      else if (r.y === 16) band = 16;
    }
    if (band === null && !onHallwayFace) {
      violations.push({ prop: p.id, tile: [x, y], rule: "wall-band", detail: "wall prop not on a north-wall face band or hallway face" });
      continue;
    }
    if (band !== null && y !== band) {
      violations.push({ prop: p.id, tile: [x, y], rule: "wall-band", detail: `expected north-wall face band y=${band} for ${room}` });
    }
    if (at(doors, x, y) > 0) violations.push({ prop: p.id, tile: [x, y], rule: "door-overlap", detail: "wall prop over a door" });
  }

  // 3. Tabletop props on furniture tiles
  for (const p of props) {
    if (p.layer !== "object" || !TABLETOP_SPRITES[p.sprite]) continue;
    const [x, y] = p.tile;
    if (furniture.length > 0 && at(furniture, x, y) === 0) {
      violations.push({ prop: p.name, tile: [x, y], rule: "tabletop", detail: "tabletop prop with no furniture beneath" });
    }
  }

  // 4. Bookshelves flush to a wall
  for (const p of props) {
    if (p.layer !== "object" || !SHELF_SPRITES[p.sprite]) continue;
    const flush = spanOf(p).some(([x, y]) => at(walls, x - 1, y) > 0 || at(walls, x + 1, y) > 0 || at(walls, x, y - 1) > 0 || at(walls, x, y + 1) > 0);
    if (!flush) violations.push({ prop: p.name, tile: p.tile, rule: "shelf-flush", detail: "bookshelf not flush against a wall" });
  }

  // 5. Desk chairs on the seat tile, south of (facing) their desk
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

  // 6. POIs reachable
  for (const poi of map.pois) {
    if (poi.id.startsWith("door_")) {
      if (!isFloor(poi.x, poi.y)) violations.push({ prop: poi.id, tile: [poi.x, poi.y], rule: "poi-blocked", detail: "door tile is solid" });
      continue;
    }
    if (isFloor(poi.x, poi.y)) continue;
    const front = frontTileOf(poi);
    if (!isFloor(front[0], front[1])) {
      violations.push({ prop: poi.id, tile: [poi.x, poi.y], rule: "poi-blocked", detail: `standing and approach tiles (${front[0]},${front[1]}) are solid` });
    }
  }

  // 7. Clearance in front of desks, sofas, counters, machines
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

function frontTileOf(poi: MapPOI): [number, number] {
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
}
