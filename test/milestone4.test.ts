import { describe, expect, it } from "bun:test";
import poisData from "../config/pois.json";
import { HouseLifeManager, type POI } from "../public/life";

describe("Milestone 4: House Life autonomous POI scheduler", () => {
  const pois = poisData as POI[];

  it("conforms to the POI JSON schema: {id, room, x, y, facing, action, minSec, maxSec, capacity, tags}", () => {
    expect(pois.length).toBeGreaterThan(15);
    for (const p of pois) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.room).toBe("string");
      expect(typeof p.x).toBe("number");
      expect(typeof p.y).toBe("number");
      expect(["up", "down", "left", "right"]).toContain(p.facing);
      expect(typeof p.action).toBe("string");
      expect(typeof p.minSec).toBe("number");
      expect(typeof p.maxSec).toBe("number");
      expect(p.maxSec).toBeGreaterThanOrEqual(p.minSec);
      expect(typeof p.capacity).toBe("number");
      expect(p.capacity).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(p.tags)).toBe(true);
    }
  });

  it("assigns sleeping housemates to bedroom bunks, and wakes them up when process starts", () => {
    const manager = new HouseLifeManager(pois);

    // 1. Sleeping housemate
    const bed = manager.pickBedPOI("harness:opencode");
    expect(bed).toBeDefined();
    expect(bed!.room).toBe("bedroom");
    expect(bed!.action).toBe("sleep");
    expect(manager.getOccupants(bed!.id)).toContain("harness:opencode");

    // 2. Process starts: wakes up and leaves bedroom
    const idlePoi = manager.pickIdlePOI("harness:opencode", 1000);
    expect(idlePoi).toBeDefined();
    expect(idlePoi!.room).not.toBe("bedroom");
    expect(idlePoi!.room).not.toBe("office");
    // Bed is now vacated
    expect(manager.getOccupants(bed!.id)).not.toContain("harness:opencode");
  });

  it("simulates 5 minutes of fake idle housemates: respects capacity, prevents immediate repeats, and uses every room without pileups", () => {
    const manager = new HouseLifeManager(pois);
    const housemates = ["opencode", "codex", "pi", "omp", "hermes"];

    const visitedRooms = new Set<string>();
    const roomCounts: Record<string, number> = {
      kitchen: 0,
      gameroom: 0,
      gym: 0,
      living: 0,
    };

    let simulatedTimeMs = 0;
    // 5 minutes = 300 seconds. With activities averaging 10-20s, ~20 transitions per housemate (100 total picks).
    const TOTAL_STEPS = 120;

    for (let step = 0; step < TOTAL_STEPS; step++) {
      const charKey = housemates[step % housemates.length];
      const previousPoi = manager.states.get(charKey)?.currentPoiId;

      simulatedTimeMs += 3000;
      const picked = manager.pickIdlePOI(charKey, simulatedTimeMs);

      expect(picked).not.toBeNull();
      if (!picked) continue;

      // 1. No immediate repeat
      if (previousPoi) {
        expect(picked.id).not.toBe(previousPoi);
      }

      // 2. Capacity must NEVER be exceeded
      const currentOccupants = manager.getOccupants(picked.id);
      expect(currentOccupants.length).toBeLessThanOrEqual(picked.capacity);

      // 3. Track visited rooms
      visitedRooms.add(picked.room);
      roomCounts[picked.room] = (roomCounts[picked.room] || 0) + 1;
    }

    // Check that EVERY non-office room was used
    expect(visitedRooms.has("kitchen")).toBe(true);
    expect(visitedRooms.has("gameroom")).toBe(true);
    expect(visitedRooms.has("gym")).toBe(true);
    expect(visitedRooms.has("living")).toBe(true);

    // Verify housemates do NOT pile up in the living room
    // Living room count should not monopolize the simulation (should be reasonably distributed)
    const livingRatio = roomCounts.living / TOTAL_STEPS;
    expect(livingRatio).toBeLessThan(0.5); // Less than 50% in living room, ensuring strong room variety

    // Kitchen, Game Room, Gym each have significant representation
    expect(roomCounts.kitchen).toBeGreaterThan(10);
    expect(roomCounts.gameroom).toBeGreaterThan(10);
    expect(roomCounts.gym).toBeGreaterThan(10);
  });
});
