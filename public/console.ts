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
  private agentSelect: HTMLSelectElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private folderInput: HTMLInputElement | null = null;
  private housemateSelect: HTMLSelectElement | null = null;

  async init(): Promise<void> {
    this.promptEl = document.getElementById("task-prompt") as HTMLTextAreaElement | null;
    this.harnessSelect = document.getElementById("task-harness") as HTMLSelectElement | null;
    this.cwdSelect = document.getElementById("task-cwd") as HTMLSelectElement | null;
    this.submitBtn = document.getElementById("btn-submit-task") as HTMLButtonElement | null;
    this.tasksListEl = document.getElementById("tasks-list");
    this.authStatusEl = document.getElementById("auth-status");
    this.agentSelect = document.getElementById("summon-agent") as HTMLSelectElement | null;
    this.modelSelect = document.getElementById("summon-model") as HTMLSelectElement | null;
    this.folderInput = document.getElementById("summon-folder") as HTMLInputElement | null;
    this.housemateSelect = document.getElementById("housemate-key") as HTMLSelectElement | null;

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

    summonBtn?.addEventListener("click", () => void this.summonHousemate());
    evictBtn?.addEventListener("click", () => void this.evictHousemate());
    callBtn?.addEventListener("click", () => void this.callHousemate());
    summonName?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void this.summonHousemate();
    });

    void this.loadOpenCodeOptions();
    void this.refreshHousemates();
    setInterval(() => void this.refreshHousemates(), 5000);
    this.refreshTasks();
    setInterval(() => this.refreshTasks(), 2500);
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.token) await this.fetchToken();
    if (!this.token) throw new Error("Authentication token not available.");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.token}`);
    return fetch(path, { ...init, headers });
  }

  private async loadOpenCodeOptions(): Promise<void> {
    if (!this.agentSelect || !this.modelSelect) return;
    try {
      const [agentsRes, modelsRes] = await Promise.all([
        this.api("/api/opencode/agents"),
        this.api("/api/opencode/models"),
      ]);
      if (agentsRes.ok) {
        const agents = (await agentsRes.json()) as { agents?: { name: string }[] };
        this.agentSelect.innerHTML = "";
        for (const agent of agents.agents ?? []) {
          const opt = document.createElement("option");
          opt.value = agent.name;
          opt.textContent = agent.name;
          this.agentSelect.appendChild(opt);
        }
        if (this.agentSelect.querySelector('option[value="build"]')) this.agentSelect.value = "build";
      }
      if (modelsRes.ok) {
        const models = (await modelsRes.json()) as { models?: { providerID: string; modelID: string }[] };
        this.modelSelect.innerHTML = "";
        for (const model of models.models ?? []) {
          const opt = document.createElement("option");
          opt.value = `${model.providerID}/${model.modelID}`;
          opt.textContent = `${model.providerID}/${model.modelID}`;
          this.modelSelect.appendChild(opt);
        }
        const preferred = Array.from(this.modelSelect.options).find((o) => o.value.includes("flash-free"));
        if (preferred) this.modelSelect.value = preferred.value;
      }
    } catch {
      /* the summon action explains a missing agent/model list */
    }
  }

  private async summonHousemate(): Promise<void> {
    const name = (document.getElementById("summon-name") as HTMLInputElement | null)?.value.trim() ?? "";
    if (!name) return alert("Enter a name for the housemate.");
    const agent = this.agentSelect?.value ?? "";
    if (!agent) return alert("No opencode agent available. Check the managed opencode server.");
    const model = this.modelSelect?.value ?? "";
    const [providerID, modelID] = model.split("/");
    if (!providerID || !modelID) return alert("Pick a model.");
    const projectRoot = this.folderInput?.value.trim() || "";
    try {
      const res = await this.api("/api/housemates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          agent,
          model: { providerID, modelID },
          projectRoot,
          permissions: { bash: "ask" },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; housemate?: { key: string } };
      if (!res.ok) return alert(`Summon failed: ${data.error ?? res.statusText}`);
      alert(`Summoned ${name} (${data.housemate?.key ?? "?"}). They walk in shortly.`);
      if (this.folderInput) this.folderInput.value = "";
      await this.refreshHousemates();
    } catch (error) {
      alert(`Summon error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async evictHousemate(): Promise<void> {
    const key = this.housemateSelect?.value ?? "";
    if (!key) return alert("Select a housemate first.");
    if (!confirm(`Evict ${key}? The worktree and branch are kept.`)) return;
    try {
      const res = await this.api(`/api/housemates/${encodeURIComponent(key)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        worktree?: string;
        branch?: string;
        diffStat?: string;
      };
      if (!res.ok) return alert(`Evict failed: ${data.error ?? res.statusText}`);
      const detail = `Worktree kept at ${data.worktree ?? "?"} (branch ${data.branch ?? "?"}).`;
      alert(data.diffStat ? `Evicted. ${detail}\n${data.diffStat}` : `Evicted. ${detail}`);
      await this.refreshHousemates();
    } catch (error) {
      alert(`Evict error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async callHousemate(): Promise<void> {
    const key = this.housemateSelect?.value ?? "";
    if (!key) return alert("Select a housemate first.");
    const message = window.prompt("What should Kuya ask?", "Kumusta! Quick check-in.");
    if (!message?.trim()) return;
    try {
      const res = await this.api(`/api/housemates/${encodeURIComponent(key)}/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: message.trim(), when: "interrupt" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return alert(`Call failed: ${data.error ?? res.statusText}`);
      await this.refreshHousemates();
    } catch (error) {
      alert(`Call error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async refreshHousemates(): Promise<void> {
    if (!this.housemateSelect) return;
    try {
      const res = await this.api("/state");
      if (!res.ok) return;
      const state = (await res.json()) as {
        sessions?: { sessionId: string; harness: string; state: string; housemateKey?: string }[];
      };
      const current = this.housemateSelect.value;
      const rows = (state.sessions ?? []).filter((s) => s.harness === "opencode" && s.housemateKey);
      this.housemateSelect.innerHTML = `<option value="">Select housemate...</option>`;
      for (const row of rows) {
        const opt = document.createElement("option");
        opt.value = row.housemateKey!;
        opt.textContent = `${row.housemateKey} (${row.state})`;
        if (row.housemateKey === current) opt.selected = true;
        this.housemateSelect.appendChild(opt);
      }
      if (this.agentSelect && this.agentSelect.options.length === 0) void this.loadOpenCodeOptions();
    } catch {
      /* state unavailable */
    }
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
