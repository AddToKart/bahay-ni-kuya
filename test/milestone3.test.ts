import { describe, expect, it } from "bun:test";
import { NavGrid } from "../public/nav";
import { tiledMap } from "../scripts/generate-map";
import { EMOTE_GLYPHS, HARNESS_SPECIES, type Action, type Facing, type Emote } from "../public/anim";

describe("Milestone 3: Navigation and Animation", () => {
  const collisionLayer = tiledMap.layers.find((l) => l.name === "collision")!.data;
  const navGrid = new NavGrid(tiledMap.width, tiledMap.height, collisionLayer);

  it("verifies bedroom door and office door are walkable", () => {
    // Bedroom door is at (6, 11)
    expect(navGrid.isWalkable(6, 11)).toBe(true);
    // Office door is at (32, 11)
    expect(navGrid.isWalkable(32, 11)).toBe(true);
    // Dividing walls are solid
    expect(navGrid.isWalkable(12, 5)).toBe(false); // Wall between bedroom & living
    expect(navGrid.isWalkable(24, 5)).toBe(false); // Wall between living & office
  });

  it("navigates from Bedroom to Office through hallway doors without clipping walls", () => {
    // Start inside Bedroom (tile x: 4, y: 5)
    // Goal inside Office (tile x: 26, y: 4 - next to Desk 1)
    const path = navGrid.findPath(4, 5, 26, 4);

    expect(path.length).toBeGreaterThan(0);
    expect(path[0]).toEqual({ x: 4, y: 5 });

    // Verify EVERY tile in path is strictly walkable (no wall clipping)
    for (const step of path) {
      expect(navGrid.isWalkable(step.x, step.y)).toBe(true);
    }

    // Verify path passes through the bedroom door (6, 11)
    const usedBedroomDoor = path.some((p) => p.x === 6 && p.y === 11);
    expect(usedBedroomDoor).toBe(true);

    // Verify path passes through the hallway (y between 12 and 14)
    const usedHallway = path.some((p) => p.y >= 12 && p.y <= 14);
    expect(usedHallway).toBe(true);

    // Verify path enters through the office door (32, 11)
    const usedOfficeDoor = path.some((p) => p.x === 32 && p.y === 11);
    expect(usedOfficeDoor).toBe(true);
  });

  it("snaps to adjacent walkable neighbor if goal tile is solid (e.g. furniture)", () => {
    // Tile (26, 2) is a solid desk monitor in the office (desk rows moved up in furniture-fix-2)
    expect(navGrid.isWalkable(26, 2)).toBe(false);
    // Pathfinding to (26, 2) should find a walkable neighbor e.g. (26, 3)
    const path = navGrid.findPath(26, 5, 26, 2);
    expect(path.length).toBeGreaterThan(0);
    const end = path[path.length - 1];
    expect(navGrid.isWalkable(end.x, end.y)).toBe(true);
  });

  it("verifies all required emote glyphs and harness species icons are defined", () => {
    const requiredEmotes: Emote[] = ["thumbs_up", "facepalm", "question", "exclamation", "sweat", "heart"];
    for (const e of requiredEmotes) {
      expect(EMOTE_GLYPHS[e!]).toBeDefined();
    }
    const harnesses = ["opencode", "codex", "pi", "omp", "hermes"];
    for (const h of harnesses) {
      expect(HARNESS_SPECIES[h]).toBeDefined();
    }
  });
});
