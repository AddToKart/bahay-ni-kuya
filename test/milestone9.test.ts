// Milestone 9 Verification: Polish, Asset Manifest, Performance Benchmarking (20 characters), and Licensing

import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HouseLifeManager, type POI } from "../public/life";
import { NavGrid } from "../public/nav";
import { HARNESSES, type Harness } from "../src/types";

describe("Milestone 9: Asset Manifest & License", () => {
  it("verifies assets/MANIFEST.md exists and documents all species and CC0 terms", () => {
    const manifestPath = join(process.cwd(), "assets", "MANIFEST.md");
    expect(existsSync(manifestPath)).toBe(true);

    const content = readFileSync(manifestPath, "utf8");
    expect(content).toContain("CC0 1.0 Universal");
    expect(content).toContain("Beaver");
    expect(content).toContain("Octopus");
    expect(content).toContain("Hamster");
    expect(content).toContain("Raccoon");
    expect(content).toContain("Owl");
    expect(content).toContain("No Trademarked Assets");
  });

  it("verifies root LICENSE file exists with MIT license terms", () => {
    const licensePath = join(process.cwd(), "LICENSE");
    expect(existsSync(licensePath)).toBe(true);

    const content = readFileSync(licensePath, "utf8");
    expect(content).toContain("MIT License");
    expect(content).toContain("AddToKart & Bahay ni Kuya Contributors");
  });

  it("verifies README.md documents architecture, quick start, non-goals, and license", () => {
    const readmePath = join(process.cwd(), "README.md");
    const content = readFileSync(readmePath, "utf8");

    expect(content).toContain("Bahay ni Kuya");
    expect(content).toContain("Quick Start");
    expect(content).toContain("bun run start");
    expect(content).toContain("bun run mcp");
    expect(content).toContain("Non-Goals");
    expect(content).toContain("MIT License");
  });
});

describe("Milestone 9: Performance Benchmark with 20 Characters", () => {
  it("simulates 20 simultaneous active characters with A* pathfinding and autonomous life under 5ms per tick", () => {
    const manager = new HouseLifeManager();
    const poisData = JSON.parse(readFileSync(join(process.cwd(), "config", "pois.json"), "utf8")) as POI[];
    manager.setPOIs(poisData);

    // Initialize 20 distinct characters across 5 harnesses (4 instances each)
    const characters: Array<{
      id: string;
      harness: Harness;
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      currentPoiId: string | null;
    }> = [];

    let count = 0;
    for (let inst = 0; inst < 4; inst++) {
      for (const h of HARNESSES) {
        characters.push({
          id: `char_${h}_${inst}`,
          harness: h,
          x: 2 + (count % 38),
          y: 2 + Math.floor(count / 2),
          targetX: 20,
          targetY: 10,
          currentPoiId: null,
        });
        count++;
      }
    }
    expect(characters.length).toBe(20);

    // Create a 42x27 navigation grid with sample obstacles
    const grid = new NavGrid(42, 27);
    // Add door walkability
    grid.setWalkable(6, 11, true);
    grid.setWalkable(32, 11, true);

    const TICKS = 500;
    const start = performance.now();

    let nowSim = 10000;
    for (let tick = 0; tick < TICKS; tick++) {
      nowSim += 200;

      for (const c of characters) {
        // 1. Autonomous POI check
        const state = manager.getOrCreateState(c.id, c.harness);
        if (nowSim >= state.activityUntil) {
          const poi = manager.pickIdlePOI(c.id, nowSim);
          if (poi) {
            c.currentPoiId = poi.id;
            c.targetX = poi.x;
            c.targetY = poi.y;

            // 2. Compute A* navigation path
            const path = grid.findPath(c.x, c.y, c.targetX, c.targetY);
            if (path.length > 0) {
              c.x = path[0].x;
              c.y = path[0].y;
            }
          }
        } else {
          // Move towards target
          if (c.x < c.targetX) c.x++;
          else if (c.x > c.targetX) c.x--;
          if (c.y < c.targetY) c.y++;
          else if (c.y > c.targetY) c.y--;
        }
      }
    }

    const elapsed = performance.now() - start;
    const msPerTick = elapsed / TICKS;

    // Must be well below 5ms per tick to sustain effortless 60 fps
    expect(msPerTick).toBeLessThan(5.0);
    console.log(`\n  20-Character Benchmark: ${TICKS} ticks completed in ${elapsed.toFixed(1)}ms (${msPerTick.toFixed(3)}ms/tick). Target: <5.0ms.`);
  });
});
