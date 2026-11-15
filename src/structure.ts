/**
 * Structure helpers shared by the structure-lock script and the layout save endpoint.
 * Pure functions only: no map generation, no fs writes.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const BASELINE_PATH = join(process.cwd(), "docs", "structure-baseline.json");

export interface RoomRect {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tint: string;
  cam: string;
}

export interface StructureSnapshot {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation: string;
  rooms: Record<string, RoomRect>;
  floors: number[];
  walls: number[];
  doors: number[];
}

export interface MapLike {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation: string;
  rooms: Record<string, RoomRect>;
  layers: Array<{ name: string; data?: number[] }>;
}

export function structureSnapshotFromMap(map: MapLike): StructureSnapshot {
  const layer = (name: string): number[] => {
    const found = map.layers.find((l) => l.name === name);
    if (!found?.data) throw new Error(`missing structural layer: ${name}`);
    return found.data;
  };
  return {
    width: map.width,
    height: map.height,
    tilewidth: map.tilewidth,
    tileheight: map.tileheight,
    orientation: map.orientation,
    rooms: map.rooms,
    floors: layer("floor"),
    walls: layer("walls"),
    doors: layer("doors"),
  };
}

export function structureHash(snapshot: StructureSnapshot): string {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(snapshot, null, 2)).digest("hex").slice(0, 16);
}

export function loadStructureBaseline(): { hash: string; structure: StructureSnapshot } {
  if (!existsSync(BASELINE_PATH)) throw new Error(`missing ${BASELINE_PATH}`);
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { hash: string; structure: StructureSnapshot };
}

export function writeStructureBaseline(snapshot: StructureSnapshot): string {
  const hash = structureHash(snapshot);
  mkdirSync(join(process.cwd(), "docs"), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify({ hash, structure: snapshot }, null, 2) + "\n", "utf8");
  return hash;
}
