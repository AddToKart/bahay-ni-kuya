// Diary-room panel controller (Phase 2).
//
// Polls /state for questions + chat (the WS snapshot is owned by main.ts; polling keeps this
// module independent and testable), renders the Confession Room panel, and submits answers
// through the Bearer-gated /api/confession/answer endpoint.
import type { ChatLine, QuestionView } from "../src/types.js";

interface StateLike {
  questions?: QuestionView[];
  chat?: ChatLine[];
}

const POLL_MS = 3000;

export class DiaryRoom {
  private token: string | null = null;
  private questions: QuestionView[] = [];
  private chat: ChatLine[] = [];
  private panel: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private questionEl: HTMLElement | null = null;
  private optionsEl: HTMLElement | null = null;
  private textEl: HTMLTextAreaElement | null = null;
  private queueEl: HTMLElement | null = null;
  private chatEl: HTMLElement | null = null;
  private submitEl: HTMLButtonElement | null = null;
  private doneEl: HTMLButtonElement | null = null;
  private closeEl: HTMLButtonElement | null = null;
  private closeAnswer: (() => void) | null = null;
  private chatMode = false;
  private visible = false;
  private isPolling = false;
  private currentSessionId: string | null = null;
  private currentHousemateKey: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isHousemateTyping = false;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    this.panel = document.getElementById("diary-panel");
    this.headerEl = document.getElementById("diary-header");
    this.questionEl = document.getElementById("diary-question");
    this.optionsEl = document.getElementById("diary-options");
    this.textEl = document.getElementById("diary-text") as HTMLTextAreaElement | null;
    this.queueEl = document.getElementById("diary-queue");
    this.chatEl = document.getElementById("diary-chat");
    this.submitEl = document.getElementById("diary-submit") as HTMLButtonElement | null;
    this.doneEl = document.getElementById("diary-done") as HTMLButtonElement | null;
    this.closeEl = document.getElementById("diary-close") as HTMLButtonElement | null;
    await this.fetchToken();
    this.submitEl?.addEventListener("click", () => void this.submit());
    this.doneEl?.addEventListener("click", () => void this.dismiss());
    this.closeEl?.addEventListener("click", () => {
      if (this.chatMode) {
        void this.dismiss();
      } else {
        this.hide();
      }
    });
    this.textEl?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void this.submit();
      }
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.visible) {
        if (this.chatMode) {
          void this.dismiss();
        } else {
          this.hide();
        }
      }
    });
    this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
    await this.poll();
  }

  private async fetchToken(): Promise<void> {
    try {
      const res = await fetch("/api/auth/token");
      if (res.ok) {
        const data = (await res.json()) as { token?: string };
        this.token = data.token ?? null;
      }
    } catch {
      this.token = null;
    }
  }

  /** Let main.ts push snapshots it already receives, avoiding a second polling loop. */
  update(state: StateLike): void {
    if (Array.isArray(state.questions)) this.questions = state.questions;
    if (Array.isArray(state.chat)) {
      this.chat = state.chat;
      if (this.isHousemateTyping) {
        const lines = this.currentSessionId
          ? this.chat.filter((line) => line.sessionId === this.currentSessionId)
          : this.chat;
        const last = lines[lines.length - 1];
        if (last && last.role === "housemate") {
          this.isHousemateTyping = false;
          if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
          }
        }
      }
    }
    this.render();
  }

  private async poll(): Promise<void> {
    if (this.isPolling || document.hidden) return;
    this.isPolling = true;
    try {
      const res = await fetch("/state", { signal: AbortSignal.timeout(3000) });
      if (res.ok) this.update((await res.json()) as StateLike);
    } catch {
      /* server offline: keep last state */
    } finally {
      this.isPolling = false;
    }
  }

  private activeQuestion(): QuestionView | null {
    return this.questions.find((q) => q.status === "in_confession") ?? null;
  }

  private queuedCount(): number {
    return this.questions.filter((q) => q.status === "queued").length;
  }

  private render(): void {
    if (!this.panel || !this.headerEl || !this.questionEl || !this.optionsEl || !this.queueEl || !this.chatEl) {
      return;
    }
    const question = this.activeQuestion();

    if (!question) {
      if (this.visible && this.chatMode) {
        this.questionEl.textContent = "Kausap si Kuya sa Confession Room…";
        this.optionsEl.innerHTML = "";
        this.queueEl.textContent = "";
        if (this.doneEl) this.doneEl.style.display = "inline-block";
        this.renderChat(this.currentSessionId);
        return;
      }
      if (this.visible) this.hide();
      return;
    }

    if (this.doneEl) this.doneEl.style.display = "none";
    this.show();
    const meta = question.housemateKey ? `${question.kind} • ${question.housemateKey}` : question.kind;
    this.headerEl.textContent = `ON AIR — ${meta}`;
    this.questionEl.textContent = question.text;
    this.optionsEl.innerHTML = "";

    if (question.options && question.options.length > 0) {
      question.options.forEach((label, index) => {
        const button = document.createElement("button");
        button.className = "diary-option";
        button.textContent = label;
        button.addEventListener("click", () => void this.answer({ option: index }));
        this.optionsEl!.appendChild(button);
      });
      if (this.textEl) this.textEl.style.display = "none";
      if (this.submitEl) this.submitEl.style.display = "none";
    } else {
      if (this.textEl) this.textEl.style.display = "block";
      if (this.submitEl) this.submitEl.style.display = "inline-block";
    }

    const queued = this.queuedCount();
    this.queueEl.textContent = queued > 0 ? `Pila sa labas: ${queued}` : "Walang pila";
    this.renderChat(question.sessionId);
  }

  private renderChat(sessionId: string | null): void {
    if (!this.chatEl) return;
    const lines = sessionId ? this.chat.filter((line) => line.sessionId === sessionId) : this.chat.slice(-20);
    this.chatEl.innerHTML = "";
    for (const line of lines.slice(-20)) {
      const row = document.createElement("div");
      row.className = `diary-line ${line.role}`;
      row.textContent = `${line.role === "kuya" ? "KUYA" : "HOUSEMATE"}: ${line.text}`;
      this.chatEl.appendChild(row);
    }

    if (this.isHousemateTyping) {
      const typingRow = document.createElement("div");
      typingRow.className = "diary-line housemate diary-typing";
      typingRow.style.display = "inline-flex";
      typingRow.style.alignItems = "center";
      typingRow.style.gap = "8px";
      typingRow.style.padding = "6px 12px";
      typingRow.style.background = "rgba(167, 139, 250, 0.12)";
      typingRow.style.borderLeft = "3px solid #a78bfa";
      typingRow.style.borderRadius = "4px";
      typingRow.style.margin = "6px 0";

      const txt = document.createElement("span");
      txt.style.fontStyle = "italic";
      txt.style.color = "#c4b5fd";
      txt.style.fontSize = "11.5px";
      txt.textContent = "✍️ HOUSEMATE is thinking & typing";

      const dots = document.createElement("span");
      dots.className = "typing-indicator-dots";
      dots.innerHTML = `<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>`;

      typingRow.append(txt, dots);
      this.chatEl.appendChild(typingRow);
    }

    this.chatEl.scrollTop = this.chatEl.scrollHeight;
  }

  private async answer(answer: { option?: number; text?: string }): Promise<void> {
    const question = this.activeQuestion();
    if (!question) return;
    if (!this.token) await this.fetchToken();
    if (!this.token) return;
    this.isHousemateTyping = true;
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.isHousemateTyping = false;
      this.render();
    }, 45000);
    try {
      const isReal = Boolean(question.housemateKey);
      const url = isReal ? `/api/housemates/${encodeURIComponent(question.housemateKey!)}/answer` : "/api/confession/answer";
      const payload = isReal
        ? {
            questionId: question.id,
            text:
              answer.text ??
              (question.kind === "permission"
                ? answer.option === 0
                  ? "once"
                  : "reject"
                : (question.options?.[answer.option ?? -1] ?? "")),
          }
        : { questionId: question.id, ...answer };
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (this.currentHousemateKey) {
        this.chatMode = true;
        if (this.questionEl) this.questionEl.textContent = "Kausap si Kuya sa Confession Room…";
        if (this.optionsEl) this.optionsEl.innerHTML = "";
        if (this.doneEl) this.doneEl.style.display = "inline-block";
        if (this.textEl) {
          this.textEl.style.display = "block";
          this.textEl.value = "";
        }
        if (this.submitEl) this.submitEl.style.display = "inline-block";
        this.renderChat(this.currentSessionId);
      } else {
        if (this.textEl) this.textEl.value = "";
        this.chatMode = false;
        this.hide();
      }
      await this.poll();
    } catch (error) {
      this.isHousemateTyping = false;
      if (this.queueEl) {
        this.queueEl.textContent = `answer failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }

  private async submit(): Promise<void> {
    const text = this.textEl?.value.trim() ?? "";
    if (!text) return;
    if (this.chatMode && this.currentHousemateKey) {
      if (!this.token) await this.fetchToken();
      if (!this.token) return;
      this.chat.push({ sessionId: this.currentSessionId || "", role: "kuya", text, ts: Date.now() });
      this.isHousemateTyping = true;
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.isHousemateTyping = false;
        this.render();
      }, 45000);
      this.renderChat(this.currentSessionId);
      if (this.textEl) this.textEl.value = "";
      try {
        await fetch(`/api/housemates/${encodeURIComponent(this.currentHousemateKey)}/call`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
          body: JSON.stringify({ message: text, when: "interrupt" }),
        });
        await this.poll();
      } catch {}
      return;
    }
    await this.answer({ text });
  }

  /** Open the panel in chat mode for a Kuya call. */
  openChat(sessionId: string, housemateKey?: string, title?: string): void {
    if (this.visible && this.chatMode && this.currentSessionId === sessionId) {
      return;
    }
    this.chatMode = true;
    this.currentSessionId = sessionId;
    if (housemateKey) this.currentHousemateKey = housemateKey;
    this.show();
    if (this.headerEl) this.headerEl.textContent = `ON AIR — ${title || housemateKey || "Confession Room"}`;
    if (this.questionEl) this.questionEl.textContent = "Speaking with Kuya in the Confession Room…";
    if (this.optionsEl) this.optionsEl.innerHTML = "";
    if (this.textEl) {
      this.textEl.style.display = "block";
      this.textEl.placeholder = "Message for housemate (or follow-up question)…";
    }
    if (this.submitEl) {
      this.submitEl.style.display = "inline-block";
      this.submitEl.textContent = "Send";
    }
    if (this.doneEl) {
      this.doneEl.style.display = "inline-block";
      this.doneEl.textContent = "Done / Return to House";
    }
    if (this.queueEl) this.queueEl.textContent = "";
    this.renderChat(sessionId);
  }

  async dismiss(): Promise<void> {
    if (this.currentHousemateKey) {
      if (!this.token) await this.fetchToken();
      try {
        await fetch(`/api/housemates/${encodeURIComponent(this.currentHousemateKey)}/dismiss`, {
          method: "POST",
          headers: { authorization: `Bearer ${this.token}` },
        });
      } catch {}
    }
    this.chatMode = false;
    this.isHousemateTyping = false;
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    this.currentHousemateKey = null;
    this.currentSessionId = null;
    if (this.doneEl) this.doneEl.style.display = "none";
    this.hide();
    await this.poll();
  }

  closeChat(): void {
    void this.dismiss();
  }

  private show(): void {
    if (!this.panel) return;
    this.visible = true;
    this.panel.hidden = false;
    document.body.classList.add("diary-open");
  }

  private hide(): void {
    if (!this.panel) return;
    this.visible = false;
    this.panel.hidden = true;
    document.body.classList.remove("diary-open");
  }
}
