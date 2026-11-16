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

const POLL_MS = 1000;

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
  private closeEl: HTMLButtonElement | null = null;
  private closeAnswer: (() => void) | null = null;
  private chatMode = false;
  private visible = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async init(): Promise<void> {
    this.panel = document.getElementById("diary-panel");
    this.headerEl = document.getElementById("diary-header");
    this.questionEl = document.getElementById("diary-question");
    this.optionsEl = document.getElementById("diary-options");
    this.textEl = document.getElementById("diary-text") as HTMLTextAreaElement | null;
    this.queueEl = document.getElementById("diary-queue");
    this.chatEl = document.getElementById("diary-chat");
    this.submitEl = document.getElementById("diary-submit") as HTMLButtonElement | null;
    this.closeEl = document.getElementById("diary-close") as HTMLButtonElement | null;
    await this.fetchToken();
    this.submitEl?.addEventListener("click", () => void this.submit());
    this.closeEl?.addEventListener("click", () => {
      // Closing NEVER answers: it only hides the panel; the question stays queued.
      this.hide();
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
    if (Array.isArray(state.chat)) this.chat = state.chat;
    this.render();
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch("/state");
      if (res.ok) this.update((await res.json()) as StateLike);
    } catch {
      /* server offline: keep last state */
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
        // Keep the chat panel open for a called housemate even with no question.
        this.questionEl.textContent = "Nakikipag-usap si Kuya…";
        this.optionsEl.innerHTML = "";
        this.queueEl.textContent = "";
        this.renderChat(null);
        return;
      }
      if (this.visible) this.hide();
      return;
    }

    this.show();
    const meta = question.housemateKey ? `${question.kind} • ${question.housemateKey}` : question.kind;
    this.headerEl.textContent = `ON AIR — ${meta}`;
    this.questionEl.textContent = question.text;
    this.optionsEl.innerHTML = "";

    if (question.kind === "choice" && question.options && question.options.length > 0) {
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
  }

  private async answer(answer: { option?: number; text?: string }): Promise<void> {
    const question = this.activeQuestion();
    if (!question) return;
    if (!this.token) await this.fetchToken();
    if (!this.token) return;
    try {
      const res = await fetch("/api/confession/answer", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ questionId: question.id, ...answer }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (this.textEl) this.textEl.value = "";
      this.chatMode = false;
      this.hide();
      await this.poll();
    } catch (error) {
      if (this.queueEl) {
        this.queueEl.textContent = `answer failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }

  private async submit(): Promise<void> {
    const text = this.textEl?.value.trim() ?? "";
    if (!text) return;
    await this.answer({ text });
  }

  /** Open the panel in chat mode for a Kuya call. */
  openChat(sessionId: string): void {
    this.chatMode = true;
    this.show();
    if (this.headerEl) this.headerEl.textContent = "ON AIR — chat";
    if (this.questionEl) this.questionEl.textContent = "Nakikipag-usap si Kuya…";
    if (this.optionsEl) this.optionsEl.innerHTML = "";
    if (this.textEl) this.textEl.style.display = "block";
    if (this.submitEl) this.submitEl.style.display = "inline-block";
    if (this.queueEl) this.queueEl.textContent = "";
    this.renderChat(sessionId);
  }

  closeChat(): void {
    this.chatMode = false;
    this.hide();
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
