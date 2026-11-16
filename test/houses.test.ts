import { describe, expect, it } from "bun:test";
import { Houses, GLOBAL_HOUSE } from "../src/houses";
import { Store } from "../src/store";
import { validateCwd } from "../src/security";

describe("Houses — multi-house manager", () => {
  it("always lists the global house as the first house", () => {
    const houses = new Houses();
    const list = houses.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]).toEqual(GLOBAL_HOUSE);
    expect(houses.get("global")).toEqual(GLOBAL_HOUSE);
  });

  it("creates a house for a valid directory, retrieves it, and closes it", () => {
    const houses = new Houses();
    const cwd = process.cwd().replace(/\\/g, "/");

    // Close any previous instance if leftover
    const existing = houses.list().find((h) => h.root.toLowerCase() === cwd.toLowerCase());
    if (existing && existing.id !== "global") {
      houses.close(existing.id);
    }

    const created = houses.create(cwd);
    expect(created.id).toMatch(/^house_[0-9a-f]{8}$/);
    expect(created.root.toLowerCase()).toBe(cwd.toLowerCase());
    expect(created.label).toBeDefined();

    // Verify in list
    expect(houses.list().some((h) => h.id === created.id)).toBe(true);
    expect(houses.get(created.id)?.root.toLowerCase()).toBe(cwd.toLowerCase());

    // Throws on duplicate
    expect(() => houses.create(cwd)).toThrow(/already exists/i);

    // Closes house
    const closed = houses.close(created.id);
    expect(closed).toBe(true);
    expect(houses.get(created.id)).toBeUndefined();
    expect(houses.list().some((h) => h.id === created.id)).toBe(false);
  });

  it("throws when creating a house for a non-existent directory", () => {
    const houses = new Houses();
    expect(() => houses.create("Z:/path/to/nonexistent/project/xyz123")).toThrow(/does not exist/i);
  });

  it("rejects non-allowlisted directories using validateCwd", () => {
    const check = validateCwd("C:/Windows/System32");
    expect(check.ok).toBe(false);
  });
});

describe("Store — houseId tagging and session scoping", () => {
  it("tags sessions with houseId upon ingest and exposes it in snapshots", () => {
    const store = new Store();
    const houseId = "house_abc12345";

    store.ingest({
      harness: "opencode",
      sessionId: "session_global_1",
      type: "session_start",
      state: "idle",
    });

    store.ingest({
      harness: "opencode",
      sessionId: "session_project_1",
      housemateKey: "hm_kurt",
      type: "housemate_summoned",
      name: "Kurt",
      houseId,
    });

    const snap = store.snapshot();
    const globalSession = snap.sessions.find((s) => s.sessionId === "session_global_1");
    const projectSession = snap.sessions.find((s) => s.sessionId === "session_project_1" || s.sessionId === "hm_kurt");

    expect(globalSession).toBeDefined();
    expect(globalSession?.houseId).toBeUndefined();

    expect(projectSession).toBeDefined();
    expect(projectSession?.houseId).toBe(houseId);
  });
});
