// Milestone 8 Verification: MCP Wrapper, stdio tools, delegation loop guards, and installer registration

import { describe, expect, it } from "bun:test";
import { createMcpServer, getBaseUrl, getToken } from "../src/mcp";
import { Dispatcher } from "../src/dispatcher";
import { Store } from "../src/store";
import {
  mergeCodexMcp,
  stripCodexMcp,
  mergeOpenCodeMcp,
  stripOpenCodeMcp,
  mergeHermesMcp,
  stripHermesMcp,
} from "../scripts/install-adapters";

describe("Milestone 8: MCP Server & Tools", () => {
  it("initializes McpServer with required Kuya tools", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();

    // Verify tools exist on server instance
    const anyServer = server as any;
    expect(anyServer._registeredTools).toBeDefined();
    const toolNames = Object.keys(anyServer._registeredTools);
    expect(toolNames).toContain("kuya_list_housemates");
    expect(toolNames).toContain("kuya_assign_task");
    expect(toolNames).toContain("kuya_task_status");
    expect(toolNames).toContain("kuya_cancel_task");
  });

  it("resolves valid base URL and security token", () => {
    const url = getBaseUrl();
    expect(url).toBe("http://127.0.0.1:4777");

    const token = getToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBe(64);
  });

  it("guards against self-delegation loops in kuya_assign_task tool", async () => {
    const server = createMcpServer();
    const assignTool = (server as any)._registeredTools["kuya_assign_task"];
    expect(assignTool).toBeDefined();

    // Call tool targeting codex with caller_harness set to codex
    const result = await assignTool.handler(
      { harness: "codex", task: "review this code", caller_harness: "codex" },
      {},
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Delegation loop detected");
  });

  it("guards against deep delegation loops (>2 levels) in kuya_assign_task tool", async () => {
    const oldDepth = process.env.KUYA_DELEGATION_DEPTH;
    try {
      process.env.KUYA_DELEGATION_DEPTH = "2";
      const server = createMcpServer();
      const assignTool = (server as any)._registeredTools["kuya_assign_task"];

      const result = await assignTool.handler(
        { harness: "opencode", task: "format files", caller_harness: "codex" },
        {},
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Delegation depth limit exceeded");
    } finally {
      if (oldDepth !== undefined) process.env.KUYA_DELEGATION_DEPTH = oldDepth;
      else delete process.env.KUYA_DELEGATION_DEPTH;
    }
  });

  it("guards against delegation loops in Dispatcher.submitTask", () => {
    const store = new Store();
    const dispatcher = new Dispatcher(store);

    // Self-delegation should throw
    expect(() => {
      dispatcher.submitTask("codex", "do work", process.cwd(), "codex", 0);
    }).toThrow("cannot delegate tasks to itself");

    // Depth >= 2 should throw
    expect(() => {
      dispatcher.submitTask("hermes", "do research", process.cwd(), "codex", 2);
    }).toThrow("Delegation depth limit reached");

    // Valid delegation within bounds should succeed
    const valid = dispatcher.submitTask("hermes", "do research", process.cwd(), "codex", 1);
    expect(valid.id).toMatch(/^task_/);
    expect(valid.callerHarness).toBe("codex");
    expect(valid.depth).toBe(1);
  });
});

describe("Milestone 8: MCP Harness Installer & Uninstaller", () => {
  it("merges and strips Codex config.toml MCP section idempotently", () => {
    const initialToml = `model = "gpt-5.5"\n\n[features]\njs_repl = false\n`;
    const mcpPath = "d:/code_ni_kurt/pixel-office/src/mcp.ts";

    const merged = mergeCodexMcp(initialToml, mcpPath);
    expect(merged.action).toBe("appended");
    expect(merged.text).toContain("[mcp_servers.bahay_ni_kuya]");
    expect(merged.text).toContain(`args = ["run", "${mcpPath}"]`);

    // Idempotent: re-merging should result in unchanged
    const remerged = mergeCodexMcp(merged.text, mcpPath);
    expect(remerged.action).toBe("unchanged");

    // Strip should cleanly remove the block
    const stripped = stripCodexMcp(merged.text);
    expect(stripped.removed).toBe(true);
    expect(stripped.text).not.toContain("bahay_ni_kuya");
    expect(stripped.text).toContain("js_repl = false");
  });

  it("merges and strips OpenCode opencode.json MCP entry idempotently", () => {
    const initialJson = JSON.stringify({ theme: "system", provider: {} }, null, 2);
    const mcpPath = "d:/code_ni_kurt/pixel-office/src/mcp.ts";

    const merged = mergeOpenCodeMcp(initialJson, mcpPath);
    expect(merged.action).toBe("updated");
    const parsed = JSON.parse(merged.text);
    expect(parsed.mcp["bahay-ni-kuya"]).toEqual({
      type: "stdio",
      command: "bun",
      args: ["run", mcpPath],
    });

    // Idempotent: re-merging should result in unchanged
    const remerged = mergeOpenCodeMcp(merged.text, mcpPath);
    expect(remerged.action).toBe("unchanged");

    // Strip should remove the entry
    const stripped = stripOpenCodeMcp(merged.text);
    expect(stripped.removed).toBe(true);
    const parsedStripped = JSON.parse(stripped.text);
    expect(parsedStripped.mcp).toBeUndefined();
    expect(parsedStripped.theme).toBe("system");
  });

  it("merges and strips Hermes config.yaml MCP entry idempotently", () => {
    const initialYaml = `model:\n  default: mimo-v2.6-flash\nmcp_servers:\n  canva:\n    command: npx\n`;
    const mcpPath = "d:/code_ni_kurt/pixel-office/src/mcp.ts";

    const merged = mergeHermesMcp(initialYaml, mcpPath);
    expect(merged.action).toBe("appended");
    expect(merged.text).toContain("bahay_ni_kuya:");
    expect(merged.text).toContain(mcpPath);

    // Idempotent: re-merging should result in unchanged
    const remerged = mergeHermesMcp(merged.text, mcpPath);
    expect(remerged.action).toBe("unchanged");

    // Strip should cleanly remove the block
    const stripped = stripHermesMcp(merged.text);
    expect(stripped.removed).toBe(true);
    expect(stripped.text).not.toContain("bahay_ni_kuya");
    expect(stripped.text).toContain("canva:");
  });
});
