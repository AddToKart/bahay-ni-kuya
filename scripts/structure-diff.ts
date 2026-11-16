// Tile-level structure diff: live map generation vs docs/structure-baseline.json.
// Used to prove an approved structural change is exactly what was approved, before the
// baseline is regenerated with `bun run structure-lock --init`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tiledMap } from "./generate-map.ts";
import { loadStructureBaseline, structureSnapshotFromMap, type MapLike } from "../src/structure.ts";

interface TileDiff {
  layer: string;
  x: number;
  y: number;
  before: number;
  after: number;
}

export function structureDiff(): { diffs: TileDiff[]; beforeHash: string } {
  const baseline = loadStructureBaseline();
  const snapshot = structureSnapshotFromMap(tiledMap as unknown as MapLike);
  const diffs: TileDiff[] = [];
  const layers = ["floors", "walls", "doors"] as const;
  for (const layer of layers) {
    const before = baseline.structure[layer];
    const after = snapshot[layer];
    const width = snapshot.width;
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      if (before[i] !== after[i]) {
        diffs.push({ layer, x: i % width, y: Math.floor(i / width), before: before[i] ?? -1, after: after[i] ?? -1 });
      }
    }
  }
  return { diffs, beforeHash: baseline.hash };
}

function main(): void {
  const { diffs, beforeHash } = structureDiff();
  if (diffs.length === 0) {
    console.log(`structure-diff: none (baseline ${beforeHash})`);
    return;
  }
  console.log(`structure-diff: ${diffs.length} tile(s) differ from baseline ${beforeHash}`);
  for (const d of diffs) console.log(`  ${d.layer} (${d.x},${d.y}): ${d.before} -> ${d.after}`);
}

if (import.meta.main) main();

// Local helper kept for ad-hoc inspection.
export function readBaselineText(): string {
  return readFileSync(join(process.cwd(), "docs", "structure-baseline.json"), "utf8");
}
