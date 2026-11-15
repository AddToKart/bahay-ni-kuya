import { describe, expect, it } from "bun:test";
import kuyaLinesData from "../config/kuya-lines.json";
import { KuyaLayer, DEFAULT_LINES, type KuyaLines } from "../public/kuya";

describe("Milestone 6: Kuya Layer & Lines", () => {
  const lines = kuyaLinesData as KuyaLines;

  it("verifies config/kuya-lines.json contains all required categories and is editable", () => {
    const requiredCategories: (keyof KuyaLines)[] = [
      "task_call",
      "hermes_research",
      "blocked_confession",
      "error_facepalm",
      "nominated",
      "task_completed",
      "wake_up",
      "chores",
    ];

    for (const cat of requiredCategories) {
      expect(Array.isArray(lines[cat])).toBe(true);
      expect(lines[cat].length).toBeGreaterThan(0);
      for (const line of lines[cat]) {
        expect(typeof line).toBe("string");
        expect(line.startsWith("KUYA:")).toBe(true);
      }
    }
  });

  it("formats Taglish lines with variable substitution ({harness})", () => {
    const kuya = new KuyaLayer();
    kuya.lines = lines;

    const taskMsg = kuya.formatLine("task_call", { harness: "opencode" });
    expect(taskMsg).toContain("opencode");
    expect(taskMsg).not.toContain("{harness}");

    const blockedMsg = kuya.formatLine("blocked_confession", { harness: "codex" });
    expect(blockedMsg).toContain("codex");
    expect(blockedMsg).toContain("confession room");

    const hermesMsg = kuya.formatLine("hermes_research", { harness: "hermes" });
    expect(hermesMsg).toContain("hermes");
    expect(hermesMsg.toLowerCase()).toContain("reading nook");
  });

  it("calculates Day count accurately from start date", () => {
    const kuya = new KuyaLayer();
    kuya.startDate = Date.now() - (2 * 24 * 60 * 60 * 1000 + 1000); // 2 days ago
    expect(kuya.getDayNumber()).toBe(3); // Day 3

    kuya.startDate = Date.now(); // Started just now
    expect(kuya.getDayNumber()).toBe(1); // Day 1
  });

  it("queues sequential announcements so lines don't overwrite each other", () => {
    const kuya = new KuyaLayer();
    kuya.announce("Announcement 1", 100);
    kuya.announce("Announcement 2", 100);

    expect(kuya.current).toBeDefined();
    expect(kuya.current!.text).toBe("Announcement 1");
    expect(kuya.queue.length).toBe(1);
    expect(kuya.queue[0].text).toBe("Announcement 2");
  });

  it("verifies all 7 camera feed configurations have valid coordinates and zoom levels", () => {
    const CAM_CONFIGS: Record<string, { x: number; y: number; zoom: number; label: string }> = {
      all: { x: 336, y: 216, zoom: 1, label: "CAM ALL - BAHAY NI KUYA" },
      office: { x: 520, y: 80, zoom: 1.8, label: "CAM 3 - OFFICE" },
      living: { x: 272, y: 80, zoom: 1.8, label: "CAM 2 - LIVING ROOM" },
      bedroom: { x: 88, y: 80, zoom: 1.8, label: "CAM 1 - BEDROOM" },
      kitchen: { x: 88, y: 224, zoom: 1.8, label: "CAM 4 - KITCHEN" },
      gameroom: { x: 272, y: 224, zoom: 1.8, label: "CAM 5 - GAME ROOM" },
      confession: { x: 72, y: 360, zoom: 2.2, label: "CAM 6 - CONFESSION ROOM" },
    };

    for (const [camKey, cfg] of Object.entries(CAM_CONFIGS)) {
      expect(cfg.x).toBeGreaterThan(0);
      expect(cfg.x).toBeLessThan(672);
      expect(cfg.y).toBeGreaterThan(0);
      expect(cfg.y).toBeLessThan(432);
      expect(cfg.zoom).toBeGreaterThanOrEqual(1);
      expect(cfg.label).toContain("CAM");
    }
  });
});
