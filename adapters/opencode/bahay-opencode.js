// Bahay ni Kuya adapter for OpenCode 1.18.35+.
// Fail-silent plugin that emits real-time lifecycle, tool, subagent, and permission events to /event.

const DEFAULT_ENDPOINT = "http://127.0.0.1:4777/event";

function postEvent(payload) {
  try {
    const endpoint = (typeof process !== "undefined" && process.env?.BAHAY_NI_KUYA_URL) || DEFAULT_ENDPOINT;
    const body = JSON.stringify({ harness: "opencode", ...payload });
    if (typeof fetch === "function") {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 1500) : null;
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller?.signal,
      })
        .catch(() => {})
        .finally(() => {
          if (timer) clearTimeout(timer);
        });
    }
  } catch {
    // Fail-silent: never interrupt or crash OpenCode
  }
}

export function setupOpenCode(ctx) {
  try {
    if (!ctx || !ctx.data || typeof ctx.data.listen !== "function") return;

    ctx.data.listen(({ details } = {}) => {
      if (!details || typeof details.type !== "string") return;
      const type = details.type;
      const properties = details.properties || {};
      const sessionId = properties.sessionID || properties.id || properties.sessionId;

      if (!sessionId) return;

      if (type === "session.created") {
        postEvent({
          sessionId,
          parentSessionId: properties.parentID || null,
          type: "session_start",
          state: "idle",
          title: properties.title || "OpenCode Session",
          directory: properties.directory || (typeof process !== "undefined" ? process.cwd() : undefined),
        });
      } else if (type === "session.execution.started") {
        postEvent({
          sessionId,
          type: "task_started",
          state: "working",
        });
      } else if (type === "session.execution.succeeded" || type === "session.idle") {
        postEvent({
          sessionId,
          type: "task_completed",
          state: "idle",
        });
      } else if (type === "session.execution.failed") {
        postEvent({
          sessionId,
          type: "error",
          state: "idle",
          title: properties.error?.message || "Execution error",
        });
      } else if (type === "tool.execute.before") {
        postEvent({
          sessionId,
          type: "tool",
          tool: properties.tool || properties.name || "tool",
          state: "working",
        });
      } else if (type === "permission.asked") {
        postEvent({
          sessionId,
          type: "blocked",
          state: "blocked",
          title: "Waiting for permission",
        });
      } else if (type === "permission.replied") {
        postEvent({
          sessionId,
          type: "state",
          state: "working",
        });
      } else if (type === "session.deleted") {
        postEvent({
          sessionId,
          type: "session_end",
        });
      }
    });
  } catch {
    // Fail-silent
  }
}

export default {
  id: "bahay-opencode",
  setup: setupOpenCode,
};
