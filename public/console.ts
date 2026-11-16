// Kuya Console UI controller for task dispatch and worktree tracking

interface TaskItem {
  id: string;
  harness: string;
  prompt: string;
  cwd: string;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  exitCode: number | null;
  tail: string[];
  diffStat?: string;
  createdAt: number;
}

export class KuyaConsole {
  private token: string | null = null;
  private roots: string[] = [];
  private knownDirs = new Set<string>();
  private installedHarnesses = new Set<string>();

  private promptEl: HTMLTextAreaElement | null = null;
  private harnessSelect: HTMLSelectElement | null = null;
  private cwdSelect: HTMLSelectElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private tasksListEl: HTMLElement | null = null;
  private authStatusEl: HTMLElement | null = null;

  async init(): Promise<void> {
    this.promptEl = document.getElementById("task-prompt") as HTMLTextAreaElement | null;
    this.harnessSelect = document.getElementById("task-harness") as HTMLSelectElement | null;
    this.cwdSelect = document.getElementById("task-cwd") as HTMLSelectElement | null;
    this.submitBtn = document.getElementById("btn-submit-task") as HTMLButtonElement | null;
    this.tasksListEl = document.getElementById("tasks-list");
    this.authStatusEl = document.getElementById("auth-status");

    // Fetch same-origin token (never in query params)
    await this.fetchToken();
    await this.fetchRoots();

    if (this.submitBtn) {
      this.submitBtn.addEventListener("click", () => this.submitTask());
    }

    const summonBtn = document.getElementById("btn-summon") as HTMLButtonElement | null;
    const evictBtn = document.getElementById("btn-evict") as HTMLButtonElement | null;
    const callBtn = document.getElementById("btn-call") as HTMLButtonElement | null;
    const summonName = document.getElementById("summon-name") as HTMLInputElement | null;

    summonBtn?.addEventListener("click", () => {
      const name = summonName?.value.trim();
      if (!name) return alert("Enter a housemate key first (e.g. bea).");
      void this.simulateSummon(name);
    });
    evictBtn?.addEventListener("click", () => {
      const name = summonName?.value.trim();
      if (!name) return alert("Enter the housemate key to evict.");
      if (!confirm(`Evict ${name}? The worktree and branch are kept.`)) return;
      void this.simulateEvict(name);
    });
    callBtn?.addEventListener("click", () => {
      const name = summonName?.value.trim();
      if (!name) return alert("Enter the housemate key to call.");
      void this.simulateCall(name);
    });

    this.refreshTasks();
    setInterval(() => this.refreshTasks(), 2500);
  }

  /** Demo-only Phase 2 simulation (P4 replaces these with real control endpoints). */
  private async simulate(payload: Record<string, unknown>): Promise<void> {
    if (!this.token) await this.fetchToken();
    if (!this.token) return alert("Authentication token not available.");
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Simulate failed: ${err.error ?? res.statusText}`);
      }
    } catch (error) {
      alert(`Simulate error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async simulateSummon(name: string): Promise<void> {
    const housemateKey = `hm_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await this.simulate({ type: "housemate_summoned", housemateKey, name, harness: "opencode" });
    // Arrival is a walking animation; give it time, then mark the housemate arrived.
    setTimeout(() => void this.simulate({ type: "housemate_arrived", housemateKey, harness: "opencode" }), 9000);
  }

  private async simulateEvict(name: string): Promise<void> {
    const housemateKey = `hm_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await this.simulate({ type: "housemate_evict_started", housemateKey, harness: "opencode", reason: "kuya_evict" });
    setTimeout(() => void this.simulate({ type: "housemate_evicted", housemateKey, harness: "opencode" }), 5000);
  }

  private async simulateCall(name: string): Promise<void> {
    const housemateKey = `hm_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    await this.simulate({ type: "kuya_call", housemateKey, harness: "opencode" });
  }

  private async fetchToken(): Promise<void> {
    try {
      const res = await fetch("/api/auth/token");
      if (res.ok) {
        const data = await res.json();
        this.token = data.token;
        if (this.authStatusEl) {
          this.authStatusEl.textContent = "🔒 Authenticated";
          this.authStatusEl.style.color = "#a7f3d0";
        }
      }
    } catch {
      if (this.authStatusEl) {
        this.authStatusEl.textContent = "⚠️ Offline";
        this.authStatusEl.style.color = "#fca5a5";
      }
    }
  }

  private async fetchRoots(): Promise<void> {
    try {
      const res = await fetch("/api/roots");
      if (res.ok) {
        const data = await res.json();
        this.roots = data.roots || [];
        this.updateCwdOptions();
      }
    } catch {
      /* ignore */
    }
  }

  updateInstalled(harnesses: { name: string; installed: boolean }[]): void {
    let changed = false;
    for (const h of harnesses) {
      if (h.installed && !this.installedHarnesses.has(h.name)) {
        this.installedHarnesses.add(h.name);
        changed = true;
      }
    }
    if (changed) this.updateHarnessOptions();
  }

  recordDirectory(dir?: string): void {
    if (dir && !this.knownDirs.has(dir)) {
      this.knownDirs.add(dir);
      this.updateCwdOptions();
    }
  }

  private updateHarnessOptions(): void {
    if (!this.harnessSelect) return;
    const current = this.harnessSelect.value;
    this.harnessSelect.innerHTML = `<option value="">Select Housemate...</option>`;
    for (const name of Array.from(this.installedHarnesses).sort()) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === current) opt.selected = true;
      this.harnessSelect.appendChild(opt);
    }
  }

  private updateCwdOptions(): void {
    if (!this.cwdSelect) return;
    const current = this.cwdSelect.value;
    this.cwdSelect.innerHTML = `<option value="">Select Project Folder...</option>`;
    const allDirs = Array.from(new Set([...this.roots, ...this.knownDirs])).sort();
    for (const dir of allDirs) {
      const opt = document.createElement("option");
      opt.value = dir;
      opt.textContent = dir;
      if (dir === current) opt.selected = true;
      this.cwdSelect.appendChild(opt);
    }
  }

  private async submitTask(): Promise<void> {
    if (!this.promptEl || !this.harnessSelect || !this.cwdSelect) return;
    const prompt = this.promptEl.value.trim();
    const harness = this.harnessSelect.value;
    const cwd = this.cwdSelect.value || this.roots[0] || "";

    if (!prompt) {
      alert("Please enter a task prompt for the housemate.");
      return;
    }
    if (!harness) {
      alert("Please select an installed housemate harness.");
      return;
    }
    if (!this.token) {
      alert("Authentication token not available. Please ensure server is running.");
      return;
    }

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ harness, prompt, cwd }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to dispatch task" }));
        alert(`Dispatch failed: ${err.error || res.statusText}`);
        return;
      }

      this.promptEl.value = "";
      await this.refreshTasks();
    } catch (err: any) {
      alert(`Dispatch error: ${err.message}`);
    }
  }

  async cancelTask(id: string): Promise<void> {
    if (!this.token) return;
    try {
      await fetch(`/api/tasks/${id}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}` },
      });
      await this.refreshTasks();
    } catch {
      /* ignore */
    }
  }

  async refreshTasks(): Promise<void> {
    if (!this.tasksListEl || !this.token) return;
    try {
      const res = await fetch("/api/tasks", {
        headers: { authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) return;
      const tasks: TaskItem[] = await res.json();

      if (tasks.length === 0) {
        this.tasksListEl.innerHTML = `<p class="empty-tasks">No tasks dispatched yet.</p>`;
        return;
      }

      this.tasksListEl.innerHTML = "";
      for (const t of tasks.slice(0, 10)) {
        const item = document.createElement("div");
        item.className = "task-item";

        const info = document.createElement("div");
        info.className = "task-info";

        const badge = document.createElement("span");
        badge.className = `task-status ${t.status}`;
        badge.textContent = t.status;

        const harnessSpan = document.createElement("span");
        harnessSpan.className = "task-harness";
        harnessSpan.textContent = t.harness;

        const promptSpan = document.createElement("span");
        promptSpan.className = "task-prompt";
        promptSpan.textContent = t.prompt;
        promptSpan.title = t.prompt;

        info.append(badge, harnessSpan, promptSpan);

        item.appendChild(info);

        if (t.status === "running" || t.status === "queued") {
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "task-cancel-btn";
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", () => this.cancelTask(t.id));
          item.appendChild(cancelBtn);
        } else if (t.diffStat) {
          const diffSpan = document.createElement("span");
          diffSpan.style.fontSize = "9px";
          diffSpan.style.color = "#86efac";
          diffSpan.textContent = t.diffStat.split("\n")[0] || "";
          item.appendChild(diffSpan);
        }

        this.tasksListEl.appendChild(item);
      }
    } catch {
      /* ignore */
    }
  }
}
