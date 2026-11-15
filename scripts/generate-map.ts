// Script to generate public/map/house.json (Tiled-compatible JSON map)
// 16px tiles, orthogonal, with layers: floor, walls, doors, furniture, collision, pois, props.
// Designed with clean room layouts, zero overlapping furniture, and no trees inside the house.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const MAP_W = 42; // tiles
const MAP_H = 27; // tiles
const TILE_SIZE = 16;

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
  SPOTLIGHT_MARKER: 58,
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

export interface MapProp {
  id: string;
  sprite: string;
  frame?: string;
  variant?: string;
  x: number;
  y: number;
  layer?: "floor" | "wall" | "object" | "overlay";
  flip?: boolean;
  zbias?: number;
}

// Flat layers
const floorLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const wallsLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const doorsLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const furnitureLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const collisionLayer = new Array<number>(MAP_W * MAP_H).fill(0);
const pois: MapPOI[] = [];
const propsList: MapProp[] = [];

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
// Outer boundary walls of the house
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
// Divider between Game Room & Gym: x = 34, y: 16..25
for (let y = 16; y <= 25; y++) {
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

// Helper to register props
function addProp(prop: MapProp): void {
  propsList.push(prop);
}

// 4. Place Furniture, Props & POIs

// ==========================================
// --- BEDROOM (x: 1..11, y: 1..10) ---
// ==========================================
// 4 Bunk beds neatly placed in 2 columns (x: 2..3 and x: 8..9), leaving a wide 4-tile central aisle (x: 4..7)
for (let i = 0; i < 4; i++) {
  const bx = i % 2 === 0 ? 2 : 8;
  const by = i < 2 ? 3 : 7;
  furnitureLayer[idx(bx, by)] = TILES.BED_BUNK_TOP;
  furnitureLayer[idx(bx, by + 1)] = TILES.BED_BUNK_BOTTOM;
  collisionLayer[idx(bx, by)] = 1;
  collisionLayer[idx(bx, by + 1)] = 1;
  collisionLayer[idx(bx + 1, by)] = 1;
  collisionLayer[idx(bx + 1, by + 1)] = 1;

  addProp({ id: `bunk_${i + 1}`, sprite: "bed-bunk", x: bx, y: by });
  pois.push({
    id: `bed_${i + 1}`,
    name: `Bunk Bed ${i + 1}`,
    room: "bedroom",
    x: bx + (i % 2 === 0 ? 2 : -1),
    y: by + 1,
    facing: i % 2 === 0 ? "left" : "right",
    action: "sleep",
    tags: ["sleep", "rest"],
  });
}

// 1-tile nightstands with reading lamps centered on walls (no overlap with bunks!)
furnitureLayer[idx(5, 3)] = TILES.NIGHTSTAND;
collisionLayer[idx(5, 3)] = 1;
addProp({ id: "bedroom_nightstand_1", sprite: "library-side-table", x: 5, y: 3 });
addProp({ id: "bedroom_lamp_1", sprite: "desk-lamp", x: 5, y: 3 });

furnitureLayer[idx(5, 7)] = TILES.NIGHTSTAND;
collisionLayer[idx(5, 7)] = 1;
addProp({ id: "bedroom_nightstand_2", sprite: "library-side-table", x: 5, y: 7 });
addProp({ id: "bedroom_lamp_2", sprite: "desk-lamp", x: 5, y: 7 });

// Bookshelf & wardrobe against perimeter walls (cabinet uses its side-wall profile)
addProp({ id: "bedroom_bookshelf", sprite: "bookshelf", x: 1, y: 5 });
collisionLayer[idx(1, 5)] = 1;
collisionLayer[idx(2, 5)] = 1;
addProp({ id: "bedroom_cabinet", sprite: "filing-cabinet", x: 11, y: 5, frame: "side" });
collisionLayer[idx(11, 5)] = 1;

// Central runner rugs
addProp({ id: "bedroom_rug", sprite: "rug", x: 5, y: 5, layer: "floor" });

// Corner plant & wall decor
addProp({ id: "bedroom_plant", sprite: "plant-tall", x: 1, y: 9 });
collisionLayer[idx(1, 9)] = 1;
addProp({ id: "bedroom_clock", sprite: "wall-clock", x: 6, y: 2, layer: "wall" });
addProp({ id: "bedroom_art_1", sprite: "art-frame", x: 3, y: 2, layer: "wall" });
addProp({ id: "bedroom_art_2", sprite: "art-frame", x: 9, y: 2, layer: "wall" });


// ==========================================
// --- LIVING ROOM / LOUNGE (x: 13..23, y: 1..10) ---
// ==========================================
// TV Console centered on the north wall (x: 17..18, y: 2)
furnitureLayer[idx(17, 2)] = TILES.TV_CONSOLE;
furnitureLayer[idx(18, 2)] = TILES.TV_CONSOLE;
collisionLayer[idx(17, 2)] = 1;
collisionLayer[idx(18, 2)] = 1;
addProp({ id: "living_tv", sprite: "tv-unit", x: 17, y: 2 });
pois.push({
  id: "tv_screen",
  name: "Living Room TV",
  room: "living",
  x: 17,
  y: 4,
  facing: "up",
  action: "tv",
  tags: ["tv", "entertainment"],
});

// Large Sectional Sofa centered facing the TV (x: 16..18, y: 5..6)
furnitureLayer[idx(16, 5)] = TILES.SOFA_LEFT;
furnitureLayer[idx(17, 5)] = TILES.SOFA_MID;
furnitureLayer[idx(18, 5)] = TILES.SOFA_RIGHT;
for (let x = 16; x <= 18; x++) {
  collisionLayer[idx(x, 5)] = 1;
  pois.push({
    id: `sofa_${x - 15}`,
    name: `Sofa Seat ${x - 15}`,
    room: "living",
    x,
    y: 6,
    facing: "up",
    action: "sit",
    tags: ["relax", "chill", "tv"],
  });
}
addProp({ id: "living_sofa", sprite: "couch-sectional", x: 16, y: 5 });

// Low Coffee table in front of sofa (x: 17, y: 7)
furnitureLayer[idx(17, 7)] = TILES.COFFEE_TABLE;
collisionLayer[idx(17, 7)] = 1;
addProp({ id: "living_coffee_table", sprite: "break-coffee-table", x: 17, y: 7 });

// Two armchairs facing the TV, symmetric around the sofa group (2-tile gaps each side)
furnitureLayer[idx(14, 6)] = TILES.OFFICE_CHAIR;
collisionLayer[idx(14, 6)] = 1;
addProp({ id: "living_armchair_1", sprite: "library-armchair", x: 14, y: 6 });

furnitureLayer[idx(20, 6)] = TILES.OFFICE_CHAIR;
collisionLayer[idx(20, 6)] = 1;
addProp({ id: "living_armchair_2", sprite: "library-armchair", x: 20, y: 6 });

// Large Persian accent rug centered under the seating group (x14..20, y5..7)
addProp({ id: "living_rug", sprite: "library-rug", x: 15, y: 5, layer: "floor" });

// Bookshelf flush against the east partition, inside the room (x22..23), clear of the door column
addProp({ id: "living_bookshelf", sprite: "library-shelf", x: 22, y: 3 });
collisionLayer[idx(22, 3)] = 1;
collisionLayer[idx(23, 3)] = 1;
furnitureLayer[idx(14, 3)] = TILES.LIVING_LAMP;
collisionLayer[idx(14, 3)] = 1;
addProp({ id: "living_lamp", sprite: "floor-lamp", x: 13, y: 3 });
collisionLayer[idx(13, 3)] = 1;

// Potted foliage & framed art
addProp({ id: "living_plant_1", sprite: "lobby-plant-big", x: 13, y: 2 });
collisionLayer[idx(13, 2)] = 1;
addProp({ id: "living_plant_2", sprite: "plant-fern", x: 23, y: 8 });
collisionLayer[idx(23, 8)] = 1;
addProp({ id: "living_art_1", sprite: "art-frame", x: 15, y: 2, layer: "wall" });
addProp({ id: "living_art_2", sprite: "art-frame", x: 20, y: 2, layer: "wall" });


// ==========================================
// --- OFFICE (x: 25..40, y: 1..10) ---
// ==========================================
// 8 Primary desks (2 rows of 4 desks, with a generous 3-tile central walkway at x: 31..32)
// Row 1 (y: 3): x = 26, 29, 33, 36
// Row 2 (y: 6): x = 26, 29, 33, 36
// Row 3 (y: 9): 4 Subagent desks at x = 26, 29, 33, 36
const deskXCoords = [26, 29, 33, 36];
let deskNum = 1;

for (const dy of [3, 6]) {
  for (const dx of deskXCoords) {
    furnitureLayer[idx(dx, dy)] = TILES.DESK_MONITOR;
    collisionLayer[idx(dx, dy)] = 1;
    // Desk is 2 tiles wide
    collisionLayer[idx(dx + 1, dy)] = 1;

    addProp({
      id: `office_desk_prop_${deskNum}`,
      sprite: "desk",
      variant: deskNum % 2 === 1 ? "walnut" : "ash",
      x: dx,
      y: dy,
    });
    // Chair placed neatly behind desk at (dx, dy + 1)
    addProp({
      id: `desk_chair_${deskNum}`,
      sprite: "chair",
      variant: dy === 3 ? "rust" : "sage",
      x: dx,
      y: dy + 1,
    });

    pois.push({
      id: `office_desk_${deskNum}`,
      name: `Office Desk ${deskNum}`,
      room: "office",
      x: dx,
      y: dy + 1,
      facing: "down",
      action: "type",
      tags: ["work", "desk", "primary"],
    });
    deskNum++;
  }
}

// 4 Subagent desks in Row 3 (y: 9)
let subNum = 1;
for (const dx of deskXCoords) {
  furnitureLayer[idx(dx, 9)] = TILES.SUBAGENT_DESK;
  collisionLayer[idx(dx, 9)] = 1;
  collisionLayer[idx(dx + 1, 9)] = 1;

  addProp({
    id: `subagent_desk_prop_${subNum}`,
    sprite: "desk",
    variant: "ash",
    x: dx,
    y: 9,
  });
  addProp({
    id: `subagent_chair_${subNum}`,
    sprite: "chair",
    variant: "teal",
    x: dx,
    y: 10,
  });

  pois.push({
    id: `subagent_desk_${subNum}`,
    name: `Subagent Desk ${subNum}`,
    room: "office",
    x: dx,
    y: 10,
    facing: "down",
    action: "type",
    tags: ["work", "desk", "subagent"],
  });
  subNum++;
}

// Center whiteboard at north wall centered on the 3-tile walkway
addProp({ id: "office_whiteboard", sprite: "whiteboard", x: 31, y: 2, layer: "wall" });
addProp({ id: "office_clock", sprite: "wall-clock", x: 35, y: 2, layer: "wall" });

// Perimeter office amenities
addProp({ id: "office_cooler", sprite: "kitchen-cooler", x: 40, y: 3 });
collisionLayer[idx(40, 3)] = 1;
addProp({ id: "office_cabinet_1", sprite: "filing-cabinet", x: 40, y: 5 });
collisionLayer[idx(40, 5)] = 1;
addProp({ id: "office_cabinet_2", sprite: "filing-cabinet", x: 40, y: 7 });
collisionLayer[idx(40, 7)] = 1;

addProp({ id: "office_bookshelf_1", sprite: "bookshelf", x: 25, y: 1 });
collisionLayer[idx(25, 1)] = 1;
collisionLayer[idx(26, 1)] = 1;
addProp({ id: "office_bin_1", sprite: "bin", x: 25, y: 6 });
collisionLayer[idx(25, 6)] = 1;

// Plants in corners
addProp({ id: "office_plant_1", sprite: "lobby-plant-big", x: 25, y: 2 });
collisionLayer[idx(25, 2)] = 1;
collisionLayer[idx(26, 2)] = 1;
addProp({ id: "office_plant_2", sprite: "lobby-plant-big", x: 39, y: 9 });
collisionLayer[idx(39, 9)] = 1;
collisionLayer[idx(40, 9)] = 1;


// ==========================================
// --- HALLWAY (x: 1..40, y: 12..14) ---
// ==========================================
// Backlit Gold Wall Sign "BAHAY NI KUYA" centered on north wall
addProp({ id: "hallway_sign", sprite: "house-sign", x: 19, y: 11, layer: "wall" });

// Wall sconces at regular intervals along hallway walls
for (const hx of [3, 9, 15, 21, 25, 30, 35, 39]) {
  addProp({ id: `hallway_sconce_${hx}`, sprite: "street-sconce", x: hx, y: 11, layer: "wall" });
}
addProp({ id: "hallway_plant_1", sprite: "plant-tall", x: 1, y: 13 });
collisionLayer[idx(1, 13)] = 1;
addProp({ id: "hallway_plant_2", sprite: "plant-tall", x: 40, y: 13 });
collisionLayer[idx(40, 13)] = 1;
addProp({ id: "hallway_clock", sprite: "wall-clock", x: 20, y: 15, layer: "wall" });


// ==========================================
// --- CONFESSION ROOM (x: 1..8, y: 16..25) ---
// ==========================================
// Solitary crimson confessional armchair centered at (4, 20)
furnitureLayer[idx(4, 20)] = TILES.CONFESSION_CHAIR;
collisionLayer[idx(4, 20)] = 1;
addProp({ id: "confession_chair_prop", sprite: "confession-chair", x: 4, y: 20 });
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

// Spotlight fixture on the north wall face band, above the chair axis
furnitureLayer[idx(4, 19)] = TILES.SPOTLIGHT_MARKER;
addProp({ id: "confession_spotlight_prop", sprite: "confession-spotlight", x: 4, y: 16, layer: "wall" });


// ==========================================
// --- KITCHEN & DINING (x: 10..22, y: 16..25) ---
// ==========================================
// Straight, neat kitchen line along north wall (y: 17), contiguous x11..17, bin in the corner
// Fridge -> Counter with Microwave -> Stove -> Counter with Sink -> Counter-end with Coffee -> Cooler -> Vending -> Bin
furnitureLayer[idx(11, 17)] = TILES.FRIDGE;
collisionLayer[idx(11, 17)] = 1;
addProp({ id: "kitchen_fridge_prop", sprite: "kitchen-fridge", x: 11, y: 17 });
pois.push({ id: "fridge", name: "Refrigerator", room: "kitchen", x: 11, y: 18, facing: "up", action: "cook", tags: ["kitchen", "food"] });

furnitureLayer[idx(12, 17)] = TILES.SINK;
collisionLayer[idx(12, 17)] = 1;
addProp({ id: "kitchen_counter_1", sprite: "kitchen-counter", x: 12, y: 17 });
addProp({ id: "kitchen_microwave_prop", sprite: "kitchen-microwave", x: 12, y: 17 });

furnitureLayer[idx(13, 17)] = TILES.STOVE;
collisionLayer[idx(13, 17)] = 1;
addProp({ id: "kitchen_stove_prop", sprite: "kitchen-stove", x: 13, y: 17 });
pois.push({ id: "stove", name: "Kitchen Stove", room: "kitchen", x: 13, y: 18, facing: "up", action: "cook", tags: ["kitchen", "cook"] });

furnitureLayer[idx(14, 17)] = TILES.SINK;
collisionLayer[idx(14, 17)] = 1;
addProp({ id: "kitchen_sink_prop", sprite: "kitchen-counter-sink", x: 14, y: 17 });
pois.push({ id: "sink", name: "Kitchen Sink", room: "kitchen", x: 14, y: 18, facing: "up", action: "wash", tags: ["kitchen", "wash"] });

furnitureLayer[idx(15, 17)] = TILES.SINK;
collisionLayer[idx(15, 17)] = 1;
addProp({ id: "kitchen_counter_end_prop", sprite: "kitchen-counter-end", x: 15, y: 17, flip: true });
addProp({ id: "kitchen_coffee_prop", sprite: "kitchen-coffee", x: 15, y: 17 });

furnitureLayer[idx(16, 17)] = TILES.WATER_COOLER;
collisionLayer[idx(16, 17)] = 1;
addProp({ id: "kitchen_cooler_prop", sprite: "kitchen-cooler", x: 16, y: 17 });

furnitureLayer[idx(17, 17)] = TILES.VENDING_MACHINE;
collisionLayer[idx(17, 17)] = 1;
collisionLayer[idx(18, 17)] = 1;
addProp({ id: "kitchen_vending_prop", sprite: "break-vending", x: 17, y: 17 });

addProp({ id: "kitchen_bin_prop", sprite: "bin", x: 22, y: 17 });
collisionLayer[idx(22, 17)] = 1;

// Wall shelf & clock (clear of window columns 14/21 and the door column 16)
addProp({ id: "kitchen_shelf_prop", sprite: "kitchen-shelf", x: 11, y: 16, layer: "wall" });
addProp({ id: "kitchen_clock", sprite: "wall-clock", x: 19, y: 16, layer: "wall" });

// Kitchen floor mat under the stove/sink stations
addProp({ id: "kitchen_mat_prop", sprite: "kitchen-mat", x: 13, y: 18, layer: "floor" });

// Dining Table (x: 16..17, y: 21) & 4 Chairs neatly placed adjacent to table
furnitureLayer[idx(16, 21)] = TILES.DINING_TABLE;
furnitureLayer[idx(17, 21)] = TILES.DINING_TABLE;
collisionLayer[idx(16, 21)] = 1;
collisionLayer[idx(17, 21)] = 1;
addProp({ id: "kitchen_table_prop", sprite: "kitchen-table", x: 16, y: 21 });

// Chairs adjacent to table
addProp({ id: "kitchen_chair_1", sprite: "kitchen-chair", x: 15, y: 21, flip: true });
addProp({ id: "kitchen_chair_2", sprite: "kitchen-chair", x: 18, y: 21 });
addProp({ id: "kitchen_chair_3", sprite: "kitchen-chair", x: 16, y: 22 });
addProp({ id: "kitchen_chair_4", sprite: "kitchen-chair", x: 17, y: 22 });

pois.push({ id: "dining_1", name: "Dining Chair 1", room: "kitchen", x: 15, y: 21, facing: "right", action: "sit", tags: ["eat", "social"] });
pois.push({ id: "dining_2", name: "Dining Chair 2", room: "kitchen", x: 18, y: 21, facing: "left", action: "sit", tags: ["eat", "social"] });
pois.push({ id: "dining_3", name: "Dining Chair 3", room: "kitchen", x: 16, y: 22, facing: "up", action: "sit", tags: ["eat", "social"] });
pois.push({ id: "dining_4", name: "Dining Chair 4", room: "kitchen", x: 17, y: 22, facing: "up", action: "sit", tags: ["eat", "social"] });

// Potted corner plants
addProp({ id: "kitchen_plant_1", sprite: "plant-tall", x: 10, y: 24 });
collisionLayer[idx(10, 24)] = 1;
addProp({ id: "kitchen_plant_2", sprite: "plant-tall", x: 22, y: 24 });
collisionLayer[idx(22, 24)] = 1;


// ==========================================
// --- GAME ROOM (x: 24..34, y: 16..25) ---
// ==========================================
// Regulation Billiards Table centered at (27, 20) with wide 2-tile clearance all around
furnitureLayer[idx(27, 20)] = TILES.POOL_TABLE;
furnitureLayer[idx(28, 20)] = TILES.POOL_TABLE;
furnitureLayer[idx(27, 21)] = TILES.POOL_TABLE;
furnitureLayer[idx(28, 21)] = TILES.POOL_TABLE;
collisionLayer[idx(27, 20)] = 1;
collisionLayer[idx(28, 20)] = 1;
collisionLayer[idx(27, 21)] = 1;
collisionLayer[idx(28, 21)] = 1;
addProp({ id: "gameroom_pool_prop", sprite: "pool-table", x: 27, y: 20 });
pois.push({ id: "pool_table", name: "Billiards / Pool Table", room: "gameroom", x: 26, y: 20, facing: "right", action: "pool", tags: ["game", "play"] });

// 2 Retro arcade cabinets along north wall, evenly spaced
furnitureLayer[idx(30, 17)] = TILES.ARCADE_1;
collisionLayer[idx(30, 17)] = 1;
addProp({ id: "arcade_prop_1", sprite: "arcade-cabinet", x: 30, y: 17 });
pois.push({ id: "arcade_1", name: "Retro Arcade 1", room: "gameroom", x: 30, y: 18, facing: "up", action: "arcade", tags: ["game", "arcade"] });

furnitureLayer[idx(31, 17)] = TILES.ARCADE_2;
collisionLayer[idx(31, 17)] = 1;
addProp({ id: "arcade_prop_2", sprite: "break-arcade", x: 31, y: 17 });
pois.push({ id: "arcade_2", name: "Retro Arcade 2", room: "gameroom", x: 31, y: 18, facing: "up", action: "arcade", tags: ["game", "arcade"] });

// Wall decorations (clear of the door column 28 and window column 27)
addProp({ id: "game_dartboard", sprite: "break-dartboard", x: 25, y: 16, layer: "wall" });
addProp({ id: "game_poster", sprite: "break-poster", x: 26, y: 16, layer: "wall" });

// Corner beanbag & plant; bin tucked against the north wall east of the arcades
addProp({ id: "game_beanbag", sprite: "break-beanbag", x: 33, y: 23 });
collisionLayer[idx(33, 23)] = 1;
addProp({ id: "game_bin", sprite: "bin", x: 33, y: 17 });
collisionLayer[idx(33, 17)] = 1;
addProp({ id: "game_plant", sprite: "plant-fern", x: 24, y: 24 });
collisionLayer[idx(24, 24)] = 1;


// ==========================================
// --- GYM & GARDEN CORNER (x: 35..40, y: 16..25) ---
// ==========================================
// Cardio & Fitness Equipment lined on the rubber gym floor (x: 36), evenly spaced rows
furnitureLayer[idx(36, 17)] = TILES.TREADMILL;
collisionLayer[idx(36, 17)] = 1;
addProp({ id: "gym_treadmill_prop", sprite: "treadmill", x: 36, y: 17 });
pois.push({ id: "treadmill", name: "Gym Treadmill", room: "gym", x: 36, y: 18, facing: "up", action: "exercise", tags: ["gym", "exercise"] });

addProp({ id: "gym_bike_prop", sprite: "gym-bike", x: 36, y: 20 });
collisionLayer[idx(36, 20)] = 1;
collisionLayer[idx(37, 20)] = 1;

addProp({ id: "gym_weights_prop", sprite: "weights-rack", x: 36, y: 23 });
collisionLayer[idx(36, 23)] = 1;
collisionLayer[idx(37, 23)] = 1;

addProp({ id: "gym_mirror_prop", sprite: "gym-mirror", x: 36, y: 16, layer: "wall" });

// Garden greenery on outdoor grass (x: 39)
furnitureLayer[idx(39, 18)] = TILES.PLANT_POT;
collisionLayer[idx(39, 18)] = 1;
addProp({ id: "garden_tree", sprite: "lobby-plant-big", x: 39, y: 18 });

furnitureLayer[idx(39, 21)] = TILES.PLANT_POT;
collisionLayer[idx(39, 21)] = 1;
addProp({ id: "garden_flowers", sprite: "park-flowers", x: 39, y: 21 });

furnitureLayer[idx(39, 24)] = TILES.PLANT_POT;
collisionLayer[idx(39, 24)] = 1;
addProp({ id: "garden_fern", sprite: "park-fern", x: 39, y: 24 });

pois.push({ id: "plants_garden", name: "House Plants", room: "gym", x: 38, y: 19, facing: "right", action: "water", tags: ["garden", "plants"] });

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
  props: propsList,
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
    {
      id: 7,
      name: "props",
      type: "objectgroup",
      visible: true,
      opacity: 1,
      objects: propsList.map((p, idx) => ({
        id: 1000 + idx + 1,
        name: p.id,
        type: "prop",
        x: p.x * TILE_SIZE,
        y: p.y * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
        properties: [
          { name: "sprite", type: "string", value: p.sprite },
          { name: "frame", type: "string", value: p.frame || "default" },
          { name: "variant", type: "string", value: p.variant || "" },
          { name: "layer", type: "string", value: p.layer || "object" },
          { name: "flip", type: "bool", value: !!p.flip },
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
  console.log(`Generated Tiled map: ${targetFile} (${MAP_W}x${MAP_H} tiles, ${pois.length} POIs, ${propsList.length} props)`);
  return targetFile;
}

if (import.meta.main) {
  generateMapFile();
}
