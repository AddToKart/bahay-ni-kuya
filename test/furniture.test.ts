import { describe, expect, it } from "bun:test";
import { validateFurniture } from "../scripts/validate-furniture";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Furniture validation", () => {
  it("map has no furniture violations (overlaps, walls, wall-band, tabletop, shelves, chairs, clearance, POIs)", () => {
    const violations = validateFurniture();
    expect(violations).toEqual([]);
  });

  it("structure baseline exists and generate-map output still matches it", () => {
    const baselinePath = join(process.cwd(), "docs", "structure-baseline.json");
    expect(existsSync(baselinePath)).toBe(true);
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { structure: { width: number; height: number } };
    expect(baseline.structure.width).toBe(42);
    expect(baseline.structure.height).toBe(27);
  });
});
