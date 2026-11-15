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
 * The baseline is generated once by `bun run structure-lock --init` and must never be edited
 * afterwards. The pure helpers live in src/structure.ts and are shared with the save endpoint.
 */
import { tiledMap } from "./generate-map.ts";
import {
  loadStructureBaseline,
  structureHash,
  structureSnapshotFromMap,
  writeStructureBaseline,
  type MapLike,
} from "../src/structure.ts";

function main(): void {
  const snapshot = structureSnapshotFromMap(tiledMap as unknown as MapLike);
  const hash = structureHash(snapshot);

  if (process.argv.includes("--init")) {
    console.log(`structure baseline written (hash ${writeStructureBaseline(snapshot)})`);
    return;
  }

  const baseline = loadStructureBaseline();
  if (hash !== baseline.hash) {
    const diffs: string[] = [];
    const base = baseline.structure;
    for (const key of ["width", "height", "tilewidth", "tileheight", "orientation"] as const) {
      if (snapshot[key] !== base[key]) diffs.push(`${key}: ${base[key]} -> ${snapshot[key]}`);
    }
    for (const [room, rect] of Object.entries(base.rooms)) {
      if (JSON.stringify(rect) !== JSON.stringify(snapshot.rooms[room])) diffs.push(`room ${room} changed`);
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
  console.log(`structure-lock OK (${hash})`);
}

if (import.meta.main) main();
