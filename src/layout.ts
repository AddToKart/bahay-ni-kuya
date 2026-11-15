/**
 * Layout save: the ONLY write path for furniture layers.
 *
 * Accepts the prop list from the dev editor, rebuilds the props objectgroup (and the
 * mirrored top-level props array), regenerates the collision layer from prop footprints,
 * refuses the write when the structural hash would change, backs up the current map to
 * docs/layout-backups/, and writes atomically. Pois/furniture tile layers are not touched.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadStructureBaseline,
  structureHash,
  structureSnapshotFromMap,
} from "./structure.ts";

const MAP_PATH = join(process.cwd(), "public", "map", "house.json");
const META_PATH = join(process.cwd(), "public", "atlas", "meta.json");
const BACKUP_DIR = join(process.cwd(), "docs", "layout-backups");

const T = 16;

export interface LayoutProp {
  id: string;
  sprite: string;
  x: number;
  y: number;
  variant?: string;
  frame?: string;
  layer?: "object" | "floor" | "wall";
  flip?: boolean;
}

interface MetaSprite {
  width: number;
  height: number;
  footprint: [number, number];
  walkable: boolean;
  layer?: string;
  variants?: string[];
}

interface MapFile {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation: string;
  rooms: Record<string, { label: string; x: number; y: number; w: number; h: number; tint: string; cam: string }>;
  props: Array<{ id: string; sprite: string; x: number; y: number; variant?: string; frame?: string; layer?: string; flip?: boolean }>;
  layers: Array<{ name: string; type: string; data?: number[]; objects?: Array<Record<string, unknown>> }>;
}

export interface SaveResult {
  ok: true;
  backup: string;
  props: number;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function isLayoutProp(value: unknown): value is LayoutProp {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.sprite === "string" &&
    typeof p.x === "number" &&
    typeof p.y === "number" &&
    Number.isInteger(p.x) &&
    Number.isInteger(p.y)
  );
}

/** Rebuild collision: walls solid, doors walkable, non-walkable object prop footprints solid. */
function buildCollision(map: MapFile, props: LayoutProp[], meta: Record<string, MetaSprite>): number[] {
  const W = map.width;
  const H = map.height;
  const collision = new Array<number>(W * H).fill(0);
  const layer = (name: string): number[] =>
    map.layers.find((l) => l.name === name)?.data ?? new Array(W * H).fill(0);
  const walls = layer("walls");
  const doors = layer("doors");

  for (let i = 0; i < collision.length; i++) {
    if (doors[i] > 0) collision[i] = 0;
    else if (walls[i] > 0) collision[i] = 1;
  }
  for (const p of props) {
    if ((p.layer ?? "object") !== "object") continue;
    const m = meta[p.sprite];
    if (!m || m.walkable) continue;
    for (let dy = 0; dy < m.footprint[1]; dy++) {
      for (let dx = 0; dx < m.footprint[0]; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < H) collision[y * W + x] = 1;
      }
    }
  }
  return collision;
}

export function saveLayout(rawProps: unknown): SaveResult {
  if (!existsSync(MAP_PATH)) throw new Error("map file missing");
  const map = readJson<MapFile>(MAP_PATH);
  const meta = readJson<{ sprites: Record<string, MetaSprite> }>(META_PATH).sprites;

  if (!Array.isArray(rawProps) || rawProps.length === 0) throw new Error("props array required");
  if (rawProps.length > 400) throw new Error("too many props");
  const props: LayoutProp[] = [];
  const seen = new Set<string>();
  for (const raw of rawProps) {
    if (!isLayoutProp(raw)) throw new Error("invalid prop entry");
    if (!meta[raw.sprite]) throw new Error(`unknown sprite: ${raw.sprite}`);
    if (seen.has(raw.id)) throw new Error(`duplicate prop id: ${raw.id}`);
    if (raw.x < 0 || raw.y < 0 || raw.x >= map.width || raw.y >= map.height) throw new Error(`prop out of bounds: ${raw.id}`);
    if (raw.layer && !["object", "floor", "wall"].includes(raw.layer)) throw new Error(`bad layer: ${raw.id}`);
    seen.add(raw.id);
    props.push(raw);
  }

  const collision = buildCollision(map, props, meta);
  const next: MapFile = {
    ...map,
    props: props.map((p) => ({
      id: p.id,
      sprite: p.sprite,
      x: p.x,
      y: p.y,
      ...(p.variant ? { variant: p.variant } : {}),
      ...(p.frame ? { frame: p.frame } : {}),
      ...(p.layer ? { layer: p.layer } : {}),
      ...(p.flip ? { flip: true } : {}),
    })),
    layers: map.layers.map((layer) => {
      if (layer.name === "collision") return { ...layer, data: collision };
      if (layer.name === "props") {
        return {
          ...layer,
          objects: props.map((p, idx) => ({
            id: 1000 + idx + 1,
            name: p.id,
            type: "prop",
            x: p.x * T,
            y: p.y * T,
            width: T,
            height: T,
            properties: [
              { name: "sprite", type: "string", value: p.sprite },
              { name: "frame", type: "string", value: p.frame || "default" },
              { name: "variant", type: "string", value: p.variant || "" },
              { name: "layer", type: "string", value: p.layer || "object" },
              { name: "flip", type: "bool", value: !!p.flip },
            ],
          })),
        };
      }
      return layer;
    }),
  };

  // Structure must be byte-identical to the baseline: only furniture layers are writable.
  const baseline = loadStructureBaseline();
  const nextHash = structureHash(structureSnapshotFromMap(next));
  if (nextHash !== baseline.hash) throw new Error("structural hash mismatch - refusing to save");

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(BACKUP_DIR, `house-${stamp}.json`);
  copyFileSync(MAP_PATH, backup);

  const tmp = `${MAP_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, MAP_PATH);

  return { ok: true, backup, props: props.length };
}
