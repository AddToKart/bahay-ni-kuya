/**
 * Structure lock for Bahay ni Kuya.
 *
 * Verifies that everything structural in the map matches docs/structure-baseline.json:
 * room rectangles, the exterior wall, hallway and building footprint, all wall/door/floor
 * tile layers (data + camera framing), and the outdoor tile layout. Furniture, decor, props,
 * collision and POIs are intentionally EXCLUDED - they are the editable surface.
 *
 * Run: bun run structure-lock
 * Exit 0 = structure unchanged. Exit 1 = structure changed (fix the map, never the baseline).
 *
 * The baseline is generated once by `bun run structure-lock --init` from
 * scripts/generate-map.ts output and must never be edited afterwards.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tiledMap } from "./generate-map.ts";

const BASELINE_PATH = join(process.cwd(), "docs", "structure-baseline.json");

type Room = { label: string; x: number; y: number; w: number; h: number; tint: string; cam: string };

function structureSnapshot() {
  const layer = (name: string) => {
    const found = (tiledMap.layers as Array<{ name: string; data?: number[] }>).find((l) => l.name === name);
    if (!found) throw new Error(`missing structural layer: ${name}`);
    return found.data;
  };
  return {
    width: tiledMap.width,
    height: tiledMap.height,
    tilewidth: tiledMap.tilewidth,
    tileheight: tiledMap.tileheight,
    orientation: tiledMap.orientation,
    rooms: tiledMap.rooms as Record<string, Room>,
    floors: layer("floor"),
    walls: layer("walls"),
    doors: layer("doors"),
  };
}

function serialize(snapshot: ReturnType<typeof structureSnapshot>): string {
  return JSON.stringify(snapshot, null, 2);
}

function hash(snapshot: ReturnType<typeof structureSnapshot>): string {
  return new Bun.CryptoHasher("sha256").update(serialize(snapshot)).digest("hex").slice(0, 16);
}

function main(): void {
  const snapshot = structureSnapshot();
  const init = process.argv.includes("--init");

  if (init) {
    mkdirSync(join(process.cwd(), "docs"), { recursive: true });
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify({ hash: hash(snapshot), structure: snapshot }, null, 2) + "\n",
      "utf8",
    );
    console.log(`structure baseline written: ${BASELINE_PATH} (hash ${hash(snapshot)})`);
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(`FAIL: ${BASELINE_PATH} missing. Run "bun run structure-lock --init" once, then never edit it.`);
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as { hash: string; structure: ReturnType<typeof structureSnapshot> };
  const current = hash(snapshot);
  if (current !== baseline.hash) {
    const diffs: string[] = [];
    const base = baseline.structure;
    for (const key of ["width", "height", "tilewidth", "tileheight", "orientation"] as const) {
      if ((snapshot as never)[key] !== base[key]) diffs.push(`${key}: ${base[key]} -> ${(snapshot as never)[key]}`);
    }
    for (const [room, rect] of Object.entries(base.rooms)) {
      if (JSON.stringify(rect) !== JSON.stringify((snapshot.rooms as Record<string, Room>)[room])) diffs.push(`room ${room} changed`);
    }
    for (const layerName of ["floors", "walls", "doors"] as const) {
      if (JSON.stringify(base[layerName]) !== JSON.stringify(snapshot[layerName])) diffs.push(`layer ${layerName} changed`);
    }
    console.error("FAIL: structural data changed:");
    for (const diff of diffs) console.error(`  - ${diff}`);
    console.error("Revert the structural change (or regenerate from generate-map.ts with structure intact).");
    console.error("Never edit docs/structure-baseline.json to make this pass.");
    process.exit(1);
  }
  console.log(`structure-lock OK (${current})`);
}

main();
