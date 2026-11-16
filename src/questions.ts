// Confession Room queue (Phase 2).
//
// Single chair, FIFO queue. Pure data + transitions; the Store owns session-state updates
// and calls promote()/answer()/drop() from its ingest path. No timers, no I/O.
import type { QuestionKind, QuestionView } from "./types";

export const MAX_QUESTION_TEXT = 400;
export const MAX_OPTIONS = 6;
const ANSWERED_KEEP_MS = 30_000;

export interface AskInput {
  id: string;
  harness: string;
  sessionId: string;
  housemateKey?: string;
  kind: QuestionKind;
  text: string;
  options?: string[];
  now: number;
}

export interface AnswerResult {
  ok: boolean;
  question?: QuestionView;
  promoted?: QuestionView;
}

export class ConfessionQueue {
  private queue: QuestionView[] = [];
  private active: QuestionView | null = null;
  private answered: QuestionView[] = [];

  ask(input: AskInput): QuestionView {
    const question: QuestionView = {
      id: input.id,
      harness: input.harness,
      sessionId: input.sessionId,
      housemateKey: input.housemateKey,
      kind: input.kind,
      text: input.text.slice(0, MAX_QUESTION_TEXT),
      options: input.options && input.options.length > 0 ? input.options.slice(0, MAX_OPTIONS) : undefined,
      askedAt: input.now,
      status: "queued",
    };
    if (!this.active) {
      question.status = "in_confession";
      this.active = question;
    } else {
      this.queue.push(question);
    }
    return question;
  }

  /** True when this session still has an unanswered question (active or queued). */
  hasOpen(sessionId: string): boolean {
    if (this.active && this.active.sessionId === sessionId && this.active.status !== "answered") return true;
    return this.queue.some((q) => q.sessionId === sessionId);
  }

  /** Answer the active question (or a specific queued one). Returns the promoted question. */
  answer(id: string, answer: { option?: number; text?: string }, now: number): AnswerResult {
    const target = this.active?.id === id ? this.active : this.queue.find((q) => q.id === id);
    if (!target) return { ok: false };
    if (target.status === "answered") return { ok: false };

    const wasActive = this.active?.id === target.id;
    this.queue = this.queue.filter((q) => q.id !== target.id);

    target.status = "answered";
    target.answer = {
      option: typeof answer.option === "number" ? answer.option : undefined,
      text: typeof answer.text === "string" ? answer.text.slice(0, MAX_QUESTION_TEXT) : undefined,
    };
    target.answeredAt = now;
    this.answered.push(target);

    let promoted: QuestionView | undefined;
    if (wasActive) {
      this.active = null;
      promoted = this.promote();
    }
    return { ok: true, question: target, promoted };
  }

  /** Skip (re-queue) a question: active goes to the back of the queue, next one is promoted. */
  skip(id: string): QuestionView | null {
    const target = this.active?.id === id ? this.active : this.queue.find((q) => q.id === id);
    if (!target) return null;
    const wasActive = this.active?.id === target.id;
    this.queue = this.queue.filter((q) => q.id !== target.id);
    if (wasActive) this.active = null;
    target.status = "queued";
    this.queue.push(target);
    if (wasActive) return this.promote();
    return null;
  }

  /** Remove every question belonging to a dead session (and promote if the chair freed). */
  drop(sessionId: string): QuestionView | null {
    this.queue = this.queue.filter((q) => q.sessionId !== sessionId);
    if (this.active?.sessionId === sessionId) {
      this.active = null;
      return this.promote();
    }
    return null;
  }

  promote(): QuestionView | null {
    const next = this.queue.shift();
    if (!next) return null;
    next.status = "in_confession";
    this.active = next;
    return next;
  }

  activeQuestion(): QuestionView | null {
    return this.active;
  }

  get(id: string): QuestionView | undefined {
    return this.active?.id === id ? this.active : this.queue.find((q) => q.id === id);
  }

  /** Active + queued + recently answered (pruned after 30 s). */
  list(now: number): QuestionView[] {
    this.answered = this.answered.filter((q) => now - (q.answeredAt ?? 0) <= ANSWERED_KEEP_MS);
    return [...(this.active ? [this.active] : []), ...this.queue, ...this.answered];
  }

  /** Test/debug helper. */
  snapshot(): { active: QuestionView | null; queued: QuestionView[]; answered: QuestionView[] } {
    return { active: this.active, queued: [...this.queue], answered: [...this.answered] };
  }
}
