import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tiledMap } from "../scripts/generate-map";

describe("Milestone 2: Map and Renderer", () => {
  it("verifies public/map/house.json exists and conforms to Tiled JSON format", () => {
    const mapPath = join(process.cwd(), "public", "map", "house.json");
    expect(existsSync(mapPath)).toBe(true);

    const content = JSON.parse(readFileSync(mapPath, "utf8"));
    expect(content.type).toBe("map");
    expect(content.orientation).toBe("orthogonal");
    expect(content.tilewidth).toBe(16);
    expect(content.tileheight).toBe(16);
    expect(content.width).toBeGreaterThanOrEqual(40);
    expect(content.height).toBeGreaterThanOrEqual(25);

    const layerNames = content.layers.map((l: { name: string }) => l.name);
    expect(layerNames).toContain("floor");
    expect(layerNames).toContain("walls");
    expect(layerNames).toContain("doors");
    expect(layerNames).toContain("furniture");
    expect(layerNames).toContain("collision");
    expect(layerNames).toContain("pois");
  });

  it("verifies all required rooms exist in the house layout", () => {
    const rooms = tiledMap.rooms;
    expect(rooms.bedroom).toBeDefined();
    expect(rooms.living).toBeDefined();
    expect(rooms.office).toBeDefined();
    expect(rooms.kitchen).toBeDefined();
    expect(rooms.gameroom).toBeDefined();
    expect(rooms.gym).toBeDefined();
    expect(rooms.confession).toBeDefined();
    expect(rooms.hallway).toBeDefined();
  });

  it("verifies office contains 8 primary desks and 4 subagent desks (12 desks total)", () => {
    const poisLayer = tiledMap.layers.find((l) => l.name === "pois")!;
    expect(poisLayer).toBeDefined();

    const deskPois = poisLayer.objects.filter((o) =>
      o.properties?.some((p) => p.name === "room" && p.value === "office") &&
      o.properties?.some((p) => p.name === "tags" && p.value.includes("desk")),
    );
    expect(deskPois.length).toBe(12);

    const subagentDesks = deskPois.filter((o) =>
      o.properties?.some((p) => p.name === "tags" && p.value.includes("subagent")),
    );
    expect(subagentDesks.length).toBe(4);
  });

  it("verifies confession room has single chair and spotlight marker", () => {
    const poisLayer = tiledMap.layers.find((l) => l.name === "pois")!;
    const confessionPoi = poisLayer.objects.find((o) =>
      o.properties?.some((p) => p.name === "room" && p.value === "confession"),
    );
    expect(confessionPoi).toBeDefined();
    expect(confessionPoi?.name).toBe("confession_seat");
  });

  it("verifies kitchen and game room POIs exist", () => {
    const poisLayer = tiledMap.layers.find((l) => l.name === "pois")!;
    const kitchenPoi = poisLayer.objects.find((o) =>
      o.properties?.some((p) => p.name === "room" && p.value === "kitchen"),
    );
    expect(kitchenPoi).toBeDefined();

    const poolTable = poisLayer.objects.find((o) => o.name === "pool_table");
    expect(poolTable).toBeDefined();
  });
});
