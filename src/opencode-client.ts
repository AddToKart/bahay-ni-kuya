// Typed HTTP client for the opencode headless server (verified routes, P3 findings).
//
// Verified against opencode 1.18.35:
//   POST /session?directory=…            create session {title?, agent?, model{id,providerID,variant?}, parentID?}
//   POST /session/{id}/message           prompt (blocking) {model{providerID,modelID}, agent, variant, parts[]}
//   POST /session/{id}/prompt_async      prompt (non-blocking)
//   POST /session/{id}/abort
//   GET  /event                          SSE stream
//   GET  /permission                     pending permission requests
//   POST /permission/{id}/reply          {reply: once|always|reject, message?}
//   GET  /question                       pending question requests
//   POST /question/{id}/reply            {answers: [[labels]]}
//   GET  /agent, /provider, /session, /session/{id}/children
//
// The client NEVER sends parentID (Rule 11).

export interface OpenCodeTokens {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
  total?: number;
}

export interface OpenCodeSession {
  id: string;
  parentID?: string | null;
  title: string;
  agent?: string;
  model?: { id: string; providerID: string; variant?: string };
  directory?: string;
  cost: number;
  tokens: OpenCodeTokens;
  time?: { created: number; updated: number };
}

export interface OpenCodeModelOption {
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
}

export interface OpenCodeEvent {
  id: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface PromptInput {
  message: string;
  agent?: string;
  model?: { providerID: string; modelID: string; variant?: string };
}

const USERNAME = "opencode";

export class OpenCodeClient {
  readonly baseUrl: string;
  private password?: string;

  constructor(port: number, password?: string) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.password = password;
  }

  private headers(json = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (json) headers["content-type"] = "application/json";
    if (this.password) {
      headers.authorization = `Basic ${btoa(`${USERNAME}:${this.password}`)}`;
    }
    return headers;
  }

  private url(path: string, directory?: string): string {
    const base = `${this.baseUrl}${path}`;
    if (!directory) return base;
    return `${base}?directory=${encodeURIComponent(directory)}`;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/global/health`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async createSession(input: {
    directory: string;
    title: string;
    agent?: string;
    model?: { id: string; providerID: string; variant?: string };
    permission?: Array<{ permission: string; pattern: string; action: "ask" | "allow" | "deny" }>;
  }): Promise<OpenCodeSession> {
    const res = await fetch(this.url("/session", input.directory), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        title: input.title,
        ...(input.agent ? { agent: input.agent } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.permission ? { permission: input.permission } : {}),
      }),
    });
    if (!res.ok) throw new Error(`session create failed: HTTP ${res.status} ${await res.text()}`);
    return (await res.json()) as OpenCodeSession;
  }

  async promptAsync(sessionId: string, directory: string, input: PromptInput): Promise<void> {
    const res = await fetch(this.url(`/session/${sessionId}/prompt_async`, directory), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        ...(input.agent ? { agent: input.agent } : {}),
        ...(input.model ? { model: { providerID: input.model.providerID, modelID: input.model.modelID } } : {}),
        ...(input.model?.variant ? { variant: input.model.variant } : {}),
        parts: [{ type: "text", text: input.message }],
      }),
    });
    if (!res.ok) throw new Error(`prompt failed: HTTP ${res.status} ${await res.text()}`);
  }

  /** Blocking prompt: resolves when the turn completes. */
  async prompt(sessionId: string, directory: string, input: PromptInput): Promise<unknown> {
    const res = await fetch(this.url(`/session/${sessionId}/message`, directory), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({
        ...(input.agent ? { agent: input.agent } : {}),
        ...(input.model ? { model: { providerID: input.model.providerID, modelID: input.model.modelID } } : {}),
        ...(input.model?.variant ? { variant: input.model.variant } : {}),
        parts: [{ type: "text", text: input.message }],
      }),
    });
    if (!res.ok) throw new Error(`prompt failed: HTTP ${res.status} ${await res.text()}`);
    return res.json();
  }

  async abort(sessionId: string, directory: string): Promise<boolean> {
    const res = await fetch(this.url(`/session/${sessionId}/abort`, directory), {
      method: "POST",
      headers: this.headers(true),
      body: "{}",
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  }

  async replyPermission(requestId: string, reply: "once" | "always" | "reject", directory?: string): Promise<boolean> {
    const res = await fetch(this.url(`/permission/${requestId}/reply`, directory), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ reply }),
    });
    return res.ok;
  }

  async replyQuestion(requestId: string, answers: string[][], directory?: string): Promise<boolean> {
    const res = await fetch(this.url(`/question/${requestId}/reply`, directory), {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ answers }),
    });
    return res.ok;
  }

  async getSession(sessionId: string, directory: string): Promise<OpenCodeSession | null> {
    try {
      const res = await fetch(this.url(`/session/${sessionId}`, directory), { headers: this.headers() });
      if (!res.ok) return null;
      return (await res.json()) as OpenCodeSession;
    } catch {
      return null;
    }
  }

  async messages(sessionId: string, directory: string): Promise<any[]> {
    try {
      const res = await fetch(this.url(`/session/${sessionId}/message`, directory), { headers: this.headers() });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch {
      return [];
    }
  }

  async children(sessionId: string, directory: string): Promise<OpenCodeSession[]> {
    try {
      const res = await fetch(this.url(`/session/${sessionId}/children`, directory), { headers: this.headers() });
      if (!res.ok) return [];
      return (await res.json()) as OpenCodeSession[];
    } catch {
      return [];
    }
  }

  async agents(directory?: string): Promise<Array<{ name: string; mode: string; native: boolean }>> {
    const res = await fetch(this.url("/agent", directory), { headers: this.headers() });
    if (!res.ok) throw new Error(`agents failed: HTTP ${res.status}`);
    const all = (await res.json()) as Array<{ name: string; mode: string; native: boolean }>;
    return all.map((a) => ({ name: a.name, mode: a.mode, native: a.native }));
  }

  async models(): Promise<OpenCodeModelOption[]> {
    const res = await fetch(this.url("/provider"), { headers: this.headers() });
    if (!res.ok) throw new Error(`providers failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      connected?: string[];
      all?: Array<{ id: string; name?: string; models: Record<string, { name?: string }> }>;
    };
    const connected = new Set(data.connected ?? []);
    const out: OpenCodeModelOption[] = [];
    for (const provider of data.all ?? []) {
      if (!connected.has(provider.id)) continue;
      for (const [modelID, model] of Object.entries(provider.models ?? {})) {
        out.push({
          providerID: provider.id,
          providerName: provider.name ?? provider.id,
          modelID,
          modelName: model.name ?? modelID,
        });
      }
    }
    return out;
  }

  /** Stream all events; reconnects with backoff until the signal aborts. */
  async streamEvents(onEvent: (event: OpenCodeEvent) => void, signal: AbortSignal): Promise<void> {
    let backoff = 1000;
    while (!signal.aborted) {
      try {
        const res = await fetch(`${this.baseUrl}/global/event`, { headers: this.headers(), signal });
        if (!res.ok || !res.body) throw new Error(`event stream HTTP ${res.status}`);
        backoff = 1000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const parsed = JSON.parse(dataLine.slice(6)) as {
                payload?: OpenCodeEvent;
                type?: string;
              };
              const event = parsed.payload && typeof parsed.payload.type === "string" ? parsed.payload : (parsed as OpenCodeEvent);
              onEvent(event);
            } catch {
              /* malformed event: ignore */
            }
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, backoff);
      await promise;
      backoff = Math.min(backoff * 2, 10_000);
    }
  }
}
