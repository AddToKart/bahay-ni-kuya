import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanForCustomSubagents } from "../scripts/guard-no-custom-subagents";

describe("Global Rule 11 — no custom subagents guard", () => {
  it("passes on the shipped source tree", () => {
    expect(scanForCustomSubagents()).toEqual([]);
  });

  it("fails on a session create carrying a parent argument", () => {
    const root = mkdtempSync(join(tmpdir(), "guard-test-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "bad.ts"),
        `export function bad(client) { return client.createSession({ directory: ".", parentID: "ses_parent" }); }\n`,
      );
      const violations = scanForCustomSubagents(root);
      expect(violations.some((v) => v.rule === "parented-session-create")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails on a harness process spawned outside the allowed path", () => {
    const root = mkdtempSync(join(tmpdir(), "guard-test-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "helper.ts"),
        `export const p = Bun.spawn(["opencode", "run", "help me"]);\n`,
      );
      const violations = scanForCustomSubagents(root);
      expect(violations.some((v) => v.rule === "harness-process-spawn")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
