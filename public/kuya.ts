// Kuya announcement ticker, queue, day counter, and optional TTS for Bahay ni Kuya

export interface KuyaLines {
  task_call: string[];
  hermes_research: string[];
  blocked_confession: string[];
  error_facepalm: string[];
  nominated: string[];
  task_completed: string[];
  wake_up: string[];
  chores: string[];
}

export const DEFAULT_LINES: KuyaLines = {
  task_call: ["KUYA: {harness}, pumunta po kayo sa office. May task po kayo."],
  hermes_research: ["KUYA: hermes, pumunta po kayo sa library reading nook. May research task po kayo."],
  blocked_confession: ["KUYA: {harness}, pumunta po kayo sa confession room para sa inyong desisyon."],
  error_facepalm: ["KUYA: Mukhang nagka-aberya si {harness}. Ayusin po natin 'yan."],
  nominated: ["KUYA: {harness}, dahil sa sunod-sunod na error, NOMINATED po kayo ngayong linggo."],
  task_completed: ["KUYA: Salamat, {harness}. Tapos na ang task. Magpahinga po muna kayo."],
  wake_up: ["KUYA: Magandang umaga, mga housemates! Gising na po para sa araw na ito."],
  chores: ["KUYA: Napakasipag naman ng mga housemates."],
};

export class KuyaLayer {
  lines: KuyaLines = DEFAULT_LINES;
  queue: { text: string; durationMs: number }[] = [];
  current: { text: string; durationMs: number } | null = null;
  displayTimer: number | null = null;
  ttsEnabled = false;
  bannerEl: HTMLElement | null = null;
  textEl: HTMLElement | null = null;
  dayEl: HTMLElement | null = null;
  ttsBtn: HTMLButtonElement | null = null;
  startDate: number;

  constructor() {
    // Persistent day start timestamp in localStorage or fallback
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("bahay_day_start") : null;
    if (stored) {
      this.startDate = Number(stored);
    } else {
      this.startDate = Date.now();
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("bahay_day_start", String(this.startDate));
        } catch {
          /* ignore */
        }
      }
    }
  }

  async loadLines(): Promise<void> {
    try {
      const res = await fetch("/kuya-lines.json");
      if (res.ok) {
        this.lines = await res.json();
      }
    } catch {
      // Fallback to DEFAULT_LINES
    }
  }

  formatLine(category: keyof KuyaLines, vars: Record<string, string> = {}): string {
    const list = this.lines[category] || DEFAULT_LINES[category] || [];
    if (list.length === 0) return "KUYA: Housemates, magtipon po sa living room.";
    const template = list[Math.floor(Math.random() * list.length)];
    let res = template;
    for (const [k, v] of Object.entries(vars)) {
      res = res.replaceAll(`{${k}}`, v);
    }
    return res;
  }

  initDOM(): void {
    this.bannerEl = document.getElementById("kuya-banner");
    this.textEl = document.getElementById("kuya-msg");
    this.dayEl = document.getElementById("day-counter");
    this.ttsBtn = document.getElementById("btn-tts") as HTMLButtonElement | null;

    if (this.ttsBtn) {
      this.ttsBtn.addEventListener("click", () => {
        this.ttsEnabled = !this.ttsEnabled;
        this.ttsBtn!.textContent = this.ttsEnabled ? "🔊 TTS: ON" : "🔇 TTS: OFF";
        this.ttsBtn!.classList.toggle("active", this.ttsEnabled);
      });
    }

    this.updateDay();
  }

  getDayNumber(): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - this.startDate;
    return Math.max(1, Math.floor(elapsed / msPerDay) + 1);
  }

  updateDay(): void {
    if (this.dayEl) {
      this.dayEl.textContent = `Day ${this.getDayNumber()} in the House`;
    }
  }

  announce(text: string, durationMs = 4500): void {
    this.queue.push({ text, durationMs });
    if (!this.current) {
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      this.current = null;
      if (this.bannerEl) this.bannerEl.hidden = true;
      return;
    }

    this.current = this.queue.shift()!;
    if (this.textEl) this.textEl.textContent = this.current.text;
    if (this.bannerEl) this.bannerEl.hidden = false;

    // Optional TTS speech
    if (this.ttsEnabled && typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(this.current.text.replace(/^KUYA:\s*/i, ""));
        utter.rate = 1.0;
        utter.pitch = 0.95;
        window.speechSynthesis.speak(utter);
      } catch {
        /* fail-silent */
      }
    }

    if (this.displayTimer !== null) clearTimeout(this.displayTimer);
    this.displayTimer = setTimeout(() => {
      this.displayTimer = null;
      this.processQueue();
    }, this.current.durationMs) as unknown as number;
  }
}
