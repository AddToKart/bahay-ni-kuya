// Script to generate public/map/house.json (Tiled-compatible JSON map)
// 16px tiles, orthogonal, with layers: floor, walls, doors, furniture, collision, pois.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const MAP_W = 42; // tiles
const MAP_H = 27; // tiles
const TILE_SIZE = 16;

// Tile ID constants (using 1-based GIDs for Tiled compatibility)
// 0: empty
// 1-10: floors
// 11-20: walls
// 21-30: doors
// 31-80: furniture
export const TILES = {
  EMPTY: 0,
  FLOOR_BEDROOM: 1, // cool blue-slate wood
  FLOOR_LIVING: 2,  // warm golden wood
  FLOOR_OFFICE: 3,  // classic parquet office wood
  FLOOR_KITCHEN: 4, // checker white/cream tile
  FLOOR_GAME: 5,    // pink/mauve felt floor
  FLOOR_CONFESSION: 6, // dark obsidian floor
  FLOOR_HALLWAY_1: 7, // checkered black
  FLOOR_HALLWAY_2: 8, // checkered white
  FLOOR_GYM: 9,     // green garden rubber/grass

  WALL_TOP: 11,
  WALL_SIDE: 12,
  WALL_CORNER: 13,
  WALL_INNER: 14,

  DOOR: 21,

  // Furniture items
  BED_BUNK_TOP: 31,
  BED_BUNK_BOTTOM: 32,
  NIGHTSTAND: 33,

  SOFA_LEFT: 34,
  SOFA_MID: 35,
  SOFA_RIGHT: 36,
  COFFEE_TABLE: 37,
  TV_CONSOLE: 38,
  LIVING_LAMP: 39,

  DESK: 40,
  DESK_MONITOR: 41,
  OFFICE_CHAIR: 42,
  SUBAGENT_DESK: 43,

  FRIDGE: 44,
  STOVE: 45,
  SINK: 46,
  WATER_COOLER: 47,
  DINING_TABLE: 48,
  DINING_CHAIR: 49,

  POOL_TABLE: 50,
  ARCADE_1: 51,
  ARCADE_2: 52,

  TREADMILL: 53,
  PLANT_POT: 54,
  WHITEBOARD: 55,

  CONFESSION_CHAIR: 56,
  VENDING_MACHINE: 57,
};

export interface MapPOI {
  id: string;
  name: string;
  room: "bedroom" | "living" | "office" | "kitchen" | "gameroom" | "gym" | "confession" | "hallway";
  x: number; // tile x
  y: number; // tile y
  facing: "up" | "down" | "left" | "right";
  action: string;
  capacity?: number;
  tags?: string[];
}

// Initialize flat arrays
const floorLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const wallsLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const doorsLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const furnitureLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const collisionLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const pois: MapPOI[] = [];

function idx(x: number, y: number): number {
  return y * MAP_W + x;
}

function fillRect(layer: number[], x1: number, y1: number, w: number, h: number, val: number): void {
  for (let y = y1; y < y1 + h; y++) {
    for (let x = x1; x < x1 + w; x++) {
      if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
        layer[idx(x, y)] = val;
      }
    }
  }
}

// 1. Build Room Floors
// Bedroom (x: 1..11, y: 1..10)
fillRect(floorLayer, 1, 1, 11, 10, TILES.FLOOR_BEDROOM);
// Living Room (x: 13..23, y: 1..10)
fillRect(floorLayer, 13, 1, 11, 10, TILES.FLOOR_LIVING);
// Office (x: 25..40, y: 1..10)
fillRect(floorLayer, 25, 1, 16, 10, TILES.FLOOR_OFFICE);

// Hallway (x: 1..40, y: 12..14) with checkered tiles
for (let y = 12; y <= 14; y++) {
  for (let x = 1; x <= 40; x++) {
    floorLayer[idx(x, y)] = (x + y) % 2 === 0 ? TILES.FLOOR_HALLWAY_1 : TILES.FLOOR_HALLWAY_2;
  }
}

// Confession Room (x: 1..8, y: 16..25)
fillRect(floorLayer, 1, 16, 8, 10, TILES.FLOOR_CONFESSION);
// Kitchen (x: 10..22, y: 16..25)
fillRect(floorLayer, 10, 16, 13, 10, TILES.FLOOR_KITCHEN);
// Game Room (x: 24..34, y: 16..25)
fillRect(floorLayer, 24, 16, 11, 10, TILES.FLOOR_GAME);
// Gym / Garden (x: 35..40, y: 16..25)
fillRect(floorLayer, 35, 16, 6, 10, TILES.FLOOR_GYM);

// 2. Build Walls & Collisions
// Outer boundary
for (let x = 0; x < MAP_W; x++) {
  wallsLayer[idx(x, 0)] = TILES.WALL_TOP;
  wallsLayer[idx(x, 26)] = TILES.WALL_TOP;
  collisionLayer[idx(x, 0)] = 1;
  collisionLayer[idx(x, 26)] = 1;
}
for (let y = 0; y < MAP_H; y++) {
  wallsLayer[idx(0, y)] = TILES.WALL_SIDE;
  wallsLayer[idx(41, y)] = TILES.WALL_SIDE;
  collisionLayer[idx(0, y)] = 1;
  collisionLayer[idx(41, y)] = 1;
}

// Horizontal dividers above & below hallway (y = 11 and y = 15)
for (let x = 0; x < MAP_W; x++) {
  wallsLayer[idx(x, 11)] = TILES.WALL_TOP;
  wallsLayer[idx(x, 15)] = TILES.WALL_TOP;
  collisionLayer[idx(x, 11)] = 1;
  collisionLayer[idx(x, 15)] = 1;
}

// Vertical partitions between top rooms:
// Between Bedroom & Living Room: x = 12, y: 1..10
for (let y = 1; y <= 10; y++) {
  wallsLayer[idx(12, y)] = TILES.WALL_SIDE;
  collisionLayer[idx(12, y)] = 1;
}
// Between Living Room & Office: x = 24, y: 1..10
for (let y = 1; y <= 10; y++) {
  wallsLayer[idx(24, y)] = TILES.WALL_SIDE;
  collisionLayer[idx(24, y)] = 1;
}

// Vertical partitions between bottom rooms:
// Between Confession & Kitchen: x = 9, y: 16..25
for (let y = 16; y <= 25; y++) {
  wallsLayer[idx(9, y)] = TILES.WALL_SIDE;
  collisionLayer[idx(9, y)] = 1;
}
// Between Kitchen & Game Room: x = 23, y: 16..25
for (let y = 16; y <= 25; y++) {
  wallsLayer[idx(23, y)] = TILES.WALL_SIDE;
  collisionLayer[idx(23, y)] = 1;
}
// Low divider between Game Room & Gym: x = 34, y: 18..25
for (let y = 18; y <= 25; y++) {
  wallsLayer[idx(34, y)] = TILES.WALL_SIDE;
  collisionLayer[idx(34, y)] = 1;
}

// 3. Doors (Walkable openings in the walls)
function makeDoor(x: number, y: number, name: string): void {
  doorsLayer[idx(x, y)] = TILES.DOOR;
  wallsLayer[idx(x, y)] = 0;
  collisionLayer[idx(x, y)] = 0; // Walkable!
  pois.push({
    id: `door_${name}`,
    name: `Door to ${name}`,
    room: "hallway",
    x,
    y,
    facing: y === 11 ? "up" : "down",
    action: "walk",
  });
}

// Top room doors connecting into hallway (at y = 11)
makeDoor(6, 11, "bedroom");
makeDoor(18, 11, "living");
makeDoor(32, 11, "office");

// Bottom room doors connecting into hallway (at y = 15)
makeDoor(5, 15, "confession");
makeDoor(16, 15, "kitchen");
makeDoor(28, 15, "gameroom");
makeDoor(37, 15, "gym");

// 4. Place Furniture & POIs

// --- BEDROOM ---
// 4 Bunk Beds (x: 2, 8, y: 2, 6)
for (let i = 0; i < 4; i++) {
  const bx = i % 2 === 0 ? 2 : 7;
  const by = i < 2 ? 3 : 7;
  furnitureLayer[idx(bx, by)] = TILES.BED_BUNK_TOP;
  furnitureLayer[idx(bx, by + 1)] = TILES.BED_BUNK_BOTTOM;
  collisionLayer[idx(bx, by)] = 1;
  collisionLayer[idx(bx, by + 1)] = 1;
  pois.push({
    id: `bed_${i + 1}`,
    name: `Bunk Bed ${i + 1}`,
    room: "bedroom",
    x: bx + 1,
    y: by + 1,
    facing: "left",
    action: "sleep",
    tags: ["sleep", "rest"],
  });
}
furnitureLayer[idx(5, 2)] = TILES.NIGHTSTAND;
collisionLayer[idx(5, 2)] = 1;

// --- LIVING ROOM ---
// Large sectional sofa (x: 15..19, y: 5)
furnitureLayer[idx(15, 5)] = TILES.SOFA_LEFT;
furnitureLayer[idx(16, 5)] = TILES.SOFA_MID;
furnitureLayer[idx(17, 5)] = TILES.SOFA_MID;
furnitureLayer[idx(18, 5)] = TILES.SOFA_RIGHT;
for (let x = 15; x <= 18; x++) {
  collisionLayer[idx(x, 5)] = 1;
  pois.push({
    id: `sofa_${x - 14}`,
    name: `Sofa Seat ${x - 14}`,
    room: "living",
    x,
    y: 6,
    facing: "up",
    action: "sit",
    tags: ["relax", "chill", "tv"],
  });
}
// TV Console at top wall (x: 16..17, y: 2)
furnitureLayer[idx(16, 2)] = TILES.TV_CONSOLE;
furnitureLayer[idx(17, 2)] = TILES.TV_CONSOLE;
collisionLayer[idx(16, 2)] = 1;
collisionLayer[idx(17, 2)] = 1;
pois.push({
    id: "tv_screen",
    name: "Living Room TV",
    room: "living",
    x: 17,
    y: 3,
    facing: "up",
    action: "tv",
    tags: ["tv", "entertainment"],
});
furnitureLayer[idx(21, 2)] = TILES.LIVING_LAMP;
collisionLayer[idx(21, 2)] = 1;

// --- OFFICE ---
// 8 Primary desks (two rows of 4 desks) + 4 Subagent desks
// Primary Row 1 (y: 3, x: 26, 29, 32, 35)
// Primary Row 2 (y: 6, x: 26, 29, 32, 35)
// Subagent Row (y: 9, x: 26, 29, 32, 35)
let deskNum = 1;
for (const dy of [3, 6]) {
  for (const dx of [26, 29, 32, 35]) {
    furnitureLayer[idx(dx, dy)] = TILES.DESK_MONITOR;
    collisionLayer[idx(dx, dy)] = 1;
    pois.push({
      id: `office_desk_${deskNum}`,
      name: `Office Desk ${deskNum}`,
      room: "office",
      x: dx,
      y: dy + 1,
      facing: "up",
      action: "type",
      tags: ["work", "desk", "primary"],
    });
    deskNum++;
  }
}
// 4 Subagent desks
let subNum = 1;
for (const dx of [26, 29, 32, 35]) {
  furnitureLayer[idx(dx, 9)] = TILES.SUBAGENT_DESK;
  collisionLayer[idx(dx, 9)] = 1;
  pois.push({
    id: `subagent_desk_${subNum}`,
    name: `Subagent Desk ${subNum}`,
    room: "office",
    x: dx,
    y: 10,
    facing: "up",
    action: "type",
    tags: ["work", "desk", "subagent"],
  });
  subNum++;
}

// --- CONFESSION ROOM ---
// Dark, solitary chair in spotlight at center (x: 4, y: 20)
furnitureLayer[idx(4, 20)] = TILES.CONFESSION_CHAIR;
collisionLayer[idx(4, 20)] = 1;
pois.push({
  id: "confession_seat",
  name: "Confession Chair",
  room: "confession",
  x: 4,
  y: 21,
  facing: "up",
  action: "sit",
  tags: ["confession", "blocked", "spotlight"],
});
furnitureLayer[idx(4, 19)] = TILES.SPOTLIGHT_MARKER;

// --- KITCHEN ---
// Fridge, Stove, Sink along top wall (y: 17, x: 11, 13, 15)
furnitureLayer[idx(11, 17)] = TILES.FRIDGE;
collisionLayer[idx(11, 17)] = 1;
pois.push({ id: "fridge", name: "Refrigerator", room: "kitchen", x: 11, y: 18, facing: "up", action: "cook", tags: ["kitchen", "food"] });

furnitureLayer[idx(13, 17)] = TILES.STOVE;
collisionLayer[idx(13, 17)] = 1;
pois.push({ id: "stove", name: "Kitchen Stove", room: "kitchen", x: 13, y: 18, facing: "up", action: "cook", tags: ["kitchen", "cook"] });

furnitureLayer[idx(15, 17)] = TILES.SINK;
collisionLayer[idx(15, 17)] = 1;
pois.push({ id: "sink", name: "Kitchen Sink", room: "kitchen", x: 15, y: 18, facing: "up", action: "wash", tags: ["kitchen", "wash"] });

furnitureLayer[idx(17, 17)] = TILES.WATER_COOLER;
collisionLayer[idx(17, 17)] = 1;

furnitureLayer[idx(19, 17)] = TILES.VENDING_MACHINE;
collisionLayer[idx(19, 17)] = 1;

// Dining Table & Chairs (x: 18..19, y: 21..22)
furnitureLayer[idx(18, 21)] = TILES.DINING_TABLE;
furnitureLayer[idx(19, 21)] = TILES.DINING_TABLE;
furnitureLayer[idx(18, 22)] = TILES.DINING_TABLE;
furnitureLayer[idx(19, 22)] = TILES.DINING_TABLE;
for (let y = 21; y <= 22; y++) {
  for (let x = 18; x <= 19; x++) collisionLayer[idx(x, y)] = 1;
}
pois.push({ id: "dining_1", name: "Dining Chair 1", room: "kitchen", x: 17, y: 21, facing: "right", action: "sit", tags: ["eat", "social"] });
pois.push({ id: "dining_2", name: "Dining Chair 2", room: "kitchen", x: 20, y: 21, facing: "left", action: "sit", tags: ["eat", "social"] });
pois.push({ id: "dining_3", name: "Dining Chair 3", room: "kitchen", x: 18, y: 23, facing: "up", action: "sit", tags: ["eat", "social"] });
pois.push({ id: "dining_4", name: "Dining Chair 4", room: "kitchen", x: 19, y: 23, facing: "up", action: "sit", tags: ["eat", "social"] });

// --- GAME ROOM ---
// Pool Table (x: 27..28, y: 20..21)
furnitureLayer[idx(27, 20)] = TILES.POOL_TABLE;
furnitureLayer[idx(28, 20)] = TILES.POOL_TABLE;
furnitureLayer[idx(27, 21)] = TILES.POOL_TABLE;
furnitureLayer[idx(28, 21)] = TILES.POOL_TABLE;
for (let y = 20; y <= 21; y++) {
  for (let x = 27; x <= 28; x++) collisionLayer[idx(x, y)] = 1;
}
pois.push({ id: "pool_table", name: "Billiards / Pool Table", room: "gameroom", x: 26, y: 20, facing: "right", action: "pool", tags: ["game", "play"] });

// Arcade Machines (x: 31, 32, y: 17)
furnitureLayer[idx(31, 17)] = TILES.ARCADE_1;
furnitureLayer[idx(32, 17)] = TILES.ARCADE_2;
collisionLayer[idx(31, 17)] = 1;
collisionLayer[idx(32, 17)] = 1;
pois.push({ id: "arcade_1", name: "Retro Arcade 1", room: "gameroom", x: 31, y: 18, facing: "up", action: "arcade", tags: ["game", "arcade"] });
pois.push({ id: "arcade_2", name: "Retro Arcade 2", room: "gameroom", x: 32, y: 18, facing: "up", action: "arcade", tags: ["game", "arcade"] });

// --- GYM & GARDEN ---
// Treadmill (x: 37, y: 20)
furnitureLayer[idx(37, 20)] = TILES.TREADMILL;
collisionLayer[idx(37, 20)] = 1;
pois.push({ id: "treadmill", name: "Gym Treadmill", room: "gym", x: 37, y: 21, facing: "up", action: "exercise", tags: ["gym", "exercise"] });

// Plants
furnitureLayer[idx(36, 17)] = TILES.PLANT_POT;
furnitureLayer[idx(39, 17)] = TILES.PLANT_POT;
furnitureLayer[idx(39, 24)] = TILES.PLANT_POT;
collisionLayer[idx(36, 17)] = 1;
collisionLayer[idx(39, 17)] = 1;
collisionLayer[idx(39, 24)] = 1;
pois.push({ id: "plants_garden", name: "House Plants", room: "gym", x: 38, y: 18, facing: "up", action: "water", tags: ["garden", "plants"] });

// Assemble Tiled JSON structure
export const tiledMap = {
  compressionlevel: -1,
  width: MAP_W,
  height: MAP_H,
  tilewidth: TILE_SIZE,
  tileheight: TILE_SIZE,
  infinite: false,
  orientation: "orthogonal",
  renderorder: "right-down",
  tiledversion: "1.10.2",
  version: "1.10",
  type: "map",
  rooms: {
    bedroom: { label: "BEDROOM", x: 1, y: 1, w: 11, h: 10, tint: "rgba(30, 45, 70, 0.25)", cam: "CAM 1 - BEDROOM" },
    living: { label: "LIVING ROOM", x: 13, y: 1, w: 11, h: 10, tint: "rgba(70, 50, 20, 0.15)", cam: "CAM 2 - LIVING ROOM" },
    office: { label: "OFFICE", x: 25, y: 1, w: 16, h: 10, tint: "rgba(40, 60, 45, 0.15)", cam: "CAM 3 - OFFICE" },
    hallway: { label: "HALLWAY", x: 1, y: 12, w: 40, h: 3, tint: "rgba(20, 20, 25, 0.10)", cam: "CAM 4 - HALLWAY" },
    confession: { label: "CONFESSION ROOM", x: 1, y: 16, w: 8, h: 10, tint: "rgba(10, 10, 15, 0.65)", cam: "CAM 5 - CONFESSION" },
    kitchen: { label: "KITCHEN", x: 10, y: 16, w: 13, h: 10, tint: "rgba(60, 50, 30, 0.15)", cam: "CAM 6 - KITCHEN" },
    gameroom: { label: "GAME ROOM", x: 24, y: 16, w: 11, h: 10, tint: "rgba(70, 30, 60, 0.15)", cam: "CAM 7 - GAME ROOM" },
    gym: { label: "GARDEN & GYM", x: 35, y: 16, w: 6, h: 10, tint: "rgba(25, 55, 35, 0.15)", cam: "CAM 8 - GYM" },
  },
  layers: [
    { id: 1, name: "floor", type: "tilelayer", visible: true, opacity: 1, x: 0, y: 0, width: MAP_W, height: MAP_H, data: floorLayer },
    { id: 2, name: "walls", type: "tilelayer", visible: true, opacity: 1, x: 0, y: 0, width: MAP_W, height: MAP_H, data: wallsLayer },
    { id: 3, name: "doors", type: "tilelayer", visible: true, opacity: 1, x: 0, y: 0, width: MAP_W, height: MAP_H, data: doorsLayer },
    { id: 4, name: "furniture", type: "tilelayer", visible: true, opacity: 1, x: 0, y: 0, width: MAP_W, height: MAP_H, data: furnitureLayer },
    { id: 5, name: "collision", type: "tilelayer", visible: false, opacity: 0.5, x: 0, y: 0, width: MAP_W, height: MAP_H, data: collisionLayer },
    {
      id: 6,
      name: "pois",
      type: "objectgroup",
      visible: true,
      opacity: 1,
      objects: pois.map((p, idx) => ({
        id: idx + 1,
        name: p.id,
        type: "poi",
        x: p.x * TILE_SIZE,
        y: p.y * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
        properties: [
          { name: "room", type: "string", value: p.room },
          { name: "action", type: "string", value: p.action },
          { name: "facing", type: "string", value: p.facing },
          { name: "label", type: "string", value: p.name },
          { name: "tags", type: "string", value: (p.tags ?? []).join(",") },
        ],
      })),
    },
  ],
};

export function generateMapFile(): string {
  const targetDir = join(process.cwd(), "public", "map");
  mkdirSync(targetDir, { recursive: true });
  const targetFile = join(targetDir, "house.json");
  const jsonStr = JSON.stringify(tiledMap, null, 2);
  writeFileSync(targetFile, jsonStr, "utf8");
  console.log(`Generated Tiled map: ${targetFile} (${MAP_W}x${MAP_H} tiles, ${pois.length} POIs)`);
  return targetFile;
}

if (import.meta.main) {
  generateMapFile();
}
