// Model Context Protocol (MCP) stdio server for Bahay ni Kuya
// Allows AI coding harnesses (Codex, OpenCode, Hermes, etc.) to query housemates,
// assign tasks, check task status, and cancel tasks via standard MCP tools.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getOrCreateToken } from "./security";

export function getBaseUrl(): string {
  const envUrl = process.env.BAHAY_NI_KUYA_BASE_URL || process.env.BAHAY_NI_KUYA_URL;
  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      /* ignore */
    }
  }
  return "http://127.0.0.1:4777";
}

export function getToken(): string {
  if (process.env.BAHAY_NI_KUYA_TOKEN) return process.env.BAHAY_NI_KUYA_TOKEN;
  return getOrCreateToken();
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "bahay-ni-kuya",
    version: "1.0.0",
  });

  // Tool 1: kuya_list_housemates
  server.tool(
    "kuya_list_housemates",
    "List all housemates in Bahay ni Kuya, including installed coding harnesses, live activity states, and recent tasks.",
    {},
    async () => {
      const baseUrl = getBaseUrl();
      const token = getToken();

      try {
        const stateRes = await fetch(`${baseUrl}/state`, {
          headers: { host: "127.0.0.1:4777" },
        });
        const stateData = stateRes.ok ? await stateRes.json() : null;

        const tasksRes = await fetch(`${baseUrl}/api/tasks`, {
          headers: {
            host: "127.0.0.1:4777",
            authorization: `Bearer ${token}`,
          },
        });
        const tasksData = tasksRes.ok ? await tasksRes.json() : [];

        const installed = (stateData as any)?.installed ?? {};
        const sessions = (stateData as any)?.sessions ?? {};

        const housemateLines = Object.entries(installed).map(([harness, isInst]) => {
          const session = (sessions as Record<string, any>)[harness];
          const state = session?.state ?? "not_running";
          const room = session?.room ?? (state === "working" ? "office" : "bedroom");
          const tool = session?.tool ? ` (tool: ${session.tool})` : "";
          const installedStr = isInst ? "installed" : "not installed";
          return `- **${harness}**: ${installedStr} | state: ${state} | room: ${room}${tool}`;
        });

        const activeTasks = (tasksData as any[])
          .slice(0, 5)
          .map((t) => `- [${t.status.toUpperCase()}] ${t.id} (${t.harness}): "${t.prompt.slice(0, 60)}"`);

        const output = [
          "### 🏠 Bahay ni Kuya Housemates",
          ...housemateLines,
          "",
          "### 📋 Recent Tasks",
          activeTasks.length > 0 ? activeTasks.join("\n") : "No active or recent tasks.",
        ].join("\n");

        return {
          content: [{ type: "text", text: output }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error fetching housemates: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // Tool 2: kuya_assign_task
  server.tool(
    "kuya_assign_task",
    "Assign a coding or research task to a housemate in Bahay ni Kuya. Kuya calls the housemate to the Office, where it works in an isolated worktree.",
    {
      harness: z.enum(["opencode", "codex", "pi", "omp", "hermes"]).describe("Target housemate to perform the task"),
      task: z.string().min(1).describe("The instructions, prompt, or task to perform"),
      cwd: z.string().optional().describe("Working directory root. Defaults to current directory"),
      caller_harness: z.string().optional().describe("Calling harness delegating this task (used for delegation loop prevention)"),
    },
    async ({ harness, task, cwd, caller_harness }) => {
      const caller = caller_harness || process.env.KUYA_CALLER_HARNESS;
      const depth = process.env.KUYA_DELEGATION_DEPTH ? parseInt(process.env.KUYA_DELEGATION_DEPTH, 10) : 0;

      // Delegation loop guards
      if (caller && caller.toLowerCase() === harness.toLowerCase()) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Delegation loop detected. Harness '${caller}' cannot assign tasks to itself.`,
            },
          ],
          isError: true,
        };
      }

      if (depth >= 2) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Delegation depth limit exceeded. Maximum allowed delegation depth is 2 levels (current depth is ${depth}).`,
            },
          ],
          isError: true,
        };
      }

      const baseUrl = getBaseUrl();
      const token = getToken();
      const taskCwd = cwd || process.cwd();

      try {
        const res = await fetch(`${baseUrl}/api/tasks`, {
          method: "POST",
          headers: {
            host: "127.0.0.1:4777",
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            harness,
            prompt: task,
            cwd: taskCwd,
            callerHarness: caller,
            depth,
          }),
        });

        const data: any = await res.json();
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Error submitting task: ${data.error || res.statusText}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Task ${data.id} submitted successfully to ${data.harness}!\nStatus: ${data.status}\nPrompt: "${data.prompt}"\nWorking Directory: ${data.cwd}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error calling Bahay ni Kuya API: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // Tool 3: kuya_task_status
  server.tool(
    "kuya_task_status",
    "Check status, recent console output tail, exit code, and git changes for a Bahay ni Kuya task.",
    {
      id: z.string().min(1).describe("Task ID (e.g. task_1700000000000_1)"),
    },
    async ({ id }) => {
      const baseUrl = getBaseUrl();
      const token = getToken();

      try {
        const res = await fetch(`${baseUrl}/api/tasks/${id}`, {
          headers: {
            host: "127.0.0.1:4777",
            authorization: `Bearer ${token}`,
          },
        });

        const data: any = await res.json();
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Error fetching task: ${data.error || res.statusText}` }],
            isError: true,
          };
        }

        const lines = [
          `### Task Status: ${data.id}`,
          `- **Harness**: ${data.harness}`,
          `- **Status**: ${data.status.toUpperCase()}`,
          `- **Prompt**: "${data.prompt}"`,
          `- **Exit Code**: ${data.exitCode !== null ? data.exitCode : "running/pending"}`,
          `- **Working Directory**: ${data.cwd}`,
        ];

        if (data.diffStat) {
          lines.push("", "### Git Changes:", "```", data.diffStat, "```");
        }

        if (data.tail && data.tail.length > 0) {
          lines.push("", "### Console Output (tail):", "```", data.tail.slice(-20).join("\n"), "```");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error querying task status: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // Tool 4: kuya_cancel_task
  server.tool(
    "kuya_cancel_task",
    "Cancel a running or queued task in Bahay ni Kuya.",
    {
      id: z.string().min(1).describe("Task ID to cancel"),
    },
    async ({ id }) => {
      const baseUrl = getBaseUrl();
      const token = getToken();

      try {
        const res = await fetch(`${baseUrl}/api/tasks/${id}/cancel`, {
          method: "POST",
          headers: {
            host: "127.0.0.1:4777",
            authorization: `Bearer ${token}`,
          },
        });

        const data: any = await res.json();
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Error canceling task: ${data.error || res.statusText}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: data.ok
                ? `🛑 Task ${id} was canceled successfully.`
                : `Task ${id} could not be canceled (it may have already completed).`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error calling cancel endpoint: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

// When executed directly as `bun run src/mcp.ts`
if (import.meta.main) {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Bahay ni Kuya MCP Server running on stdio");
}
