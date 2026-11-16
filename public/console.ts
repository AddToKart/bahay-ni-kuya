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

export interface HouseRecord {
  id: string;
  label: string;
  root: string;
  createdAt: number;
}

export class HouseManager {
  private token: string | null = null;
  private houses: HouseRecord[] = [];
  private activeHouseId = "global";
  private onHouseChange: (houseId: string, house?: HouseRecord) => void;
  private tabsContainer: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private folderInput: HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;
  private rootsHint: HTMLElement | null = null;

  constructor(onHouseChange: (houseId: string, house?: HouseRecord) => void) {
    this.onHouseChange = onHouseChange;
  }

  async init(): Promise<void> {
    this.tabsContainer = document.getElementById("house-tabs");
    this.modal = document.getElementById("new-house-modal");
    this.folderInput = document.getElementById("new-house-folder") as HTMLInputElement | null;
    this.errorEl = document.getElementById("new-house-error");
    this.rootsHint = document.getElementById("new-house-roots-hint");

    document.getElementById("new-house-close")?.addEventListener("click", () => this.closeNewHouseModal());
    document.getElementById("new-house-cancel")?.addEventListener("click", () => this.closeNewHouseModal());
    document.getElementById("new-house-submit")?.addEventListener("click", () => void this.createHouse());
    this.folderInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.createHouse();
    });
    this.modal?.addEventListener("click", (e) => {
      if (e.target === this.modal) this.closeNewHouseModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.modal && !this.modal.hasAttribute("hidden")) {
        this.closeNewHouseModal();
      }
    });

    await this.fetchToken();
    await this.fetchRootsHint();
    await this.fetchHouses();
  }

  private async fetchToken(): Promise<void> {
    try {
      const res = await fetch("/api/auth/token");
      if (res.ok) {
        const data = (await res.json()) as { token?: string };
        this.token = data.token ?? null;
      }
    } catch {
      /* ignore */
    }
  }

  private async fetchRootsHint(): Promise<void> {
    if (!this.rootsHint) return;
    try {
      const res = await fetch("/api/roots");
      if (res.ok) {
        const data = (await res.json()) as { roots?: string[] };
        const roots = data.roots ?? [];
        if (roots.length > 0) {
          this.rootsHint.innerHTML = `Allowlisted roots: ${roots.map((r) => `<code>${r}</code>`).join(", ")}`;
        }
      }
    } catch {
      /* ignore */
    }
  }

  async fetchHouses(): Promise<void> {
    try {
      const res = await fetch("/api/houses");
      if (res.ok) {
        const data = (await res.json()) as { houses?: HouseRecord[] };
        if (Array.isArray(data.houses)) {
          this.setHouses(data.houses);
        }
      }
    } catch {
      /* ignore */
    }
  }

  setHouses(houses: HouseRecord[]): void {
    this.houses = houses;
    if (!this.houses.some((h) => h.id === this.activeHouseId)) {
      this.activeHouseId = "global";
      this.onHouseChange(this.activeHouseId, this.getActiveHouse());
    }
    this.renderTabs();
  }

  getActiveHouseId(): string {
    return this.activeHouseId;
  }

  getActiveHouse(): HouseRecord | undefined {
    return this.houses.find((h) => h.id === this.activeHouseId);
  }

  renderTabs(): void {
    if (!this.tabsContainer) return;
    this.tabsContainer.innerHTML = "";

    for (const house of this.houses) {
      const tab = document.createElement("button");
      tab.className = `house-tab${house.id === this.activeHouseId ? " active" : ""}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(house.id === this.activeHouseId));

      const icon = house.id === "global" ? "🌐" : "📁";
      const label = document.createElement("span");
      label.textContent = `${icon} ${house.label}`;
      tab.appendChild(label);

      if (house.id !== "global") {
        const closeBtn = document.createElement("button");
        closeBtn.className = "house-tab-close";
        closeBtn.innerHTML = "&times;";
        closeBtn.title = `Close ${house.label}`;
        closeBtn.setAttribute("aria-label", `Close ${house.label}`);
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.closeHouse(house.id, house.label);
        });
        tab.appendChild(closeBtn);
      }

      tab.addEventListener("click", () => {
        if (this.activeHouseId !== house.id) {
          this.switchTo(house.id);
        }
      });

      this.tabsContainer.appendChild(tab);
    }

    const addBtn = document.createElement("button");
    addBtn.className = "house-tab house-tab-add";
    addBtn.id = "btn-new-house";
    addBtn.textContent = "➕ New House";
    addBtn.title = "Create a new project house";
    addBtn.addEventListener("click", () => this.openNewHouseModal());
    this.tabsContainer.appendChild(addBtn);
  }

  switchTo(id: string): void {
    this.activeHouseId = id;
    this.renderTabs();
    this.onHouseChange(id, this.getActiveHouse());
  }

  openNewHouseModal(): void {
    if (!this.modal) return;
    this.modal.removeAttribute("hidden");
    if (this.errorEl) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = "";
    }
    if (this.folderInput) {
      this.folderInput.value = "";
      setTimeout(() => this.folderInput?.focus(), 0);
    }
  }

  closeNewHouseModal(): void {
    this.modal?.setAttribute("hidden", "");
    if (this.errorEl) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = "";
    }
  }

  private showError(msg: string): void {
    if (!this.errorEl) return;
    this.errorEl.textContent = msg;
    this.errorEl.hidden = false;
  }

  private async createHouse(): Promise<void> {
    const root = this.folderInput?.value.trim() ?? "";
    if (!root) {
      return this.showError("Enter a project folder path.");
    }
    if (!this.token) await this.fetchToken();
    const submitBtn = document.getElementById("new-house-submit") as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch("/api/houses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ root }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        house?: HouseRecord;
      };
      if (!res.ok) {
        return this.showError(data.error ?? `Failed to create house: ${res.statusText}`);
      }
      this.closeNewHouseModal();
      await this.fetchHouses();
      if (data.house?.id) {
        this.switchTo(data.house.id);
      }
    } catch (err) {
      this.showError(`Error creating house: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  private async closeHouse(id: string, label: string): Promise<void> {
    if (!confirm(`Close house "${label}"?`)) return;
    if (!this.token) await this.fetchToken();

    try {
      const res = await fetch(`/api/houses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${this.token}`,
        },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(`Failed to close house: ${data.error ?? res.statusText}`);
        return;
      }
      if (this.activeHouseId === id) {
        this.activeHouseId = "global";
      }
      await this.fetchHouses();
      this.onHouseChange(this.activeHouseId, this.getActiveHouse());
    } catch (err) {
      alert(`Error closing house: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function promptKuyaCall(key: string, name?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.getElementById("call-modal");
    const desc = document.getElementById("call-target-desc");
    const input = document.getElementById("call-message-input") as HTMLInputElement | null;
    const submit = document.getElementById("call-submit");
    const cancel = document.getElementById("call-cancel");
    const close = document.getElementById("call-close");
    const errorEl = document.getElementById("call-error");

    if (!modal || !input) {
      try {
        resolve(window.prompt(`What should Kuya ask ${name || key}?`, "Kumusta! Quick check-in."));
      } catch {
        resolve(null);
      }
      return;
    }

    if (desc) {
      desc.textContent = `Kuya will call ${name || key} into the Confession Room for a 1-on-1 check-in.`;
    }
    input.value = "Kumusta! Quick check-in.";
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    modal.removeAttribute("hidden");
    modal.hidden = false;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);

    const cleanup = () => {
      modal.setAttribute("hidden", "");
      modal.hidden = true;
      submit?.removeEventListener("click", onConfirm);
      cancel?.removeEventListener("click", onCancel);
      close?.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
    };

    const onConfirm = () => {
      const msg = input.value.trim();
      if (!msg) {
        if (errorEl) {
          errorEl.textContent = "Please enter a message for Kuya to say.";
          errorEl.hidden = false;
        }
        return;
      }
      cleanup();
      resolve(msg);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onBackdrop = (e: MouseEvent) => {
      if (e.target === modal) onCancel();
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && document.activeElement === input) onConfirm();
    };

    submit?.addEventListener("click", onConfirm);
    cancel?.addEventListener("click", onCancel);
    close?.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

export class KuyaConsole {
  private token: string | null = null;
  private houseManager: HouseManager | null = null;
  private roots: string[] = [];

  setHouseManager(hm: HouseManager): void {
    this.houseManager = hm;
  }
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
  private summonModal: HTMLElement | null = null;
  private summonError: HTMLElement | null = null;
  private modelFilter: HTMLInputElement | null = null;
  private allModels: { providerID: string; modelID: string }[] = [];

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
    this.summonModal = document.getElementById("summon-modal");
    this.summonError = document.getElementById("summon-error");
    this.modelFilter = document.getElementById("summon-model-filter") as HTMLInputElement | null;

    if (this.submitBtn) {
      this.submitBtn.addEventListener("click", () => this.submitTask());
    }

    const summonBtn = document.getElementById("btn-summon") as HTMLButtonElement | null;
    const evictBtn = document.getElementById("btn-evict") as HTMLButtonElement | null;
    const callBtn = document.getElementById("btn-call") as HTMLButtonElement | null;
    const summonName = document.getElementById("summon-name") as HTMLInputElement | null;

    summonBtn?.addEventListener("click", () => this.openSummon());
    document.getElementById("empty-house-summon")?.addEventListener("click", () => this.openSummon());
    evictBtn?.addEventListener("click", () => void this.evictHousemate());
    callBtn?.addEventListener("click", () => void this.callHousemate());
    document.getElementById("summon-close")?.addEventListener("click", () => this.closeSummon());
    document.getElementById("summon-cancel")?.addEventListener("click", () => this.closeSummon());
    document.getElementById("summon-submit")?.addEventListener("click", () => void this.summonHousemate());
    summonName?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") void this.summonHousemate();
    });
    this.modelFilter?.addEventListener("input", () => this.applyModelFilter());
    this.summonModal?.addEventListener("click", (event) => {
      if (event.target === this.summonModal) this.closeSummon();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.summonModal && !this.summonModal.hasAttribute("hidden")) this.closeSummon();
    });

    await this.fetchToken();
    await this.fetchRoots();

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
        const models = (await modelsRes.json()) as {
          models?: { providerID: string; modelID: string }[];
        };
        this.allModels = models.models ?? [];
        this.applyModelFilter();
      }
    } catch {
      /* the summon action explains a missing agent/model list */
    }
  }

  openSummon(): void {
    if (!this.summonModal) {
      this.summonModal = document.getElementById("summon-modal");
    }
    if (!this.folderInput) {
      this.folderInput = document.getElementById("summon-folder") as HTMLInputElement | null;
    }
    const activeHouse = this.houseManager?.getActiveHouse();
    if (activeHouse && activeHouse.id !== "global" && this.folderInput) {
      this.folderInput.value = activeHouse.root;
    }
    if (this.allModels.length === 0) {
      void this.loadOpenCodeOptions();
    }
    const worktreeToggle = document.getElementById("summon-worktree") as HTMLInputElement | null;
    const noteEl = document.getElementById("summon-note");
    const updateNote = () => {
      if (noteEl) {
        noteEl.textContent = worktreeToggle?.checked
          ? "Runs in a git worktree; your main tree is untouched. Permissions: bash asks first."
          : "Runs directly in the selected project folder (no worktree isolation). Permissions: bash asks first.";
      }
    };
    if (worktreeToggle) {
      const saved = localStorage.getItem("kuya_use_worktree");
      if (saved !== null) {
        worktreeToggle.checked = saved === "true";
      }
      updateNote();
      worktreeToggle.onchange = () => {
        localStorage.setItem("kuya_use_worktree", String(worktreeToggle.checked));
        updateNote();
      };
    }
    if (this.summonModal) {
      this.summonModal.removeAttribute("hidden");
      this.summonModal.hidden = false;
    }
    if (this.summonError) {
      this.summonError.hidden = true;
      this.summonError.textContent = "";
    }
    this.applyModelFilter();
    setTimeout(() => (document.getElementById("summon-name") as HTMLInputElement | null)?.focus(), 0);
  }

  private closeSummon(): void {
    if (this.summonModal) {
      this.summonModal.setAttribute("hidden", "");
      this.summonModal.hidden = true;
    }
    if (this.summonError) {
      this.summonError.hidden = true;
      this.summonError.textContent = "";
    }
  }

  private showSummonError(message: string): void {
    if (!this.summonError) return;
    this.summonError.textContent = message;
    this.summonError.hidden = false;
  }

  private applyModelFilter(): void {
    if (!this.modelSelect) return;
    const query = (this.modelFilter?.value ?? "").trim().toLowerCase();
    const current = this.modelSelect.value;
    const models = this.allModels.filter(
      (model) => !query || `${model.providerID}/${model.modelID}`.toLowerCase().includes(query),
    );
    this.modelSelect.innerHTML = "";
    for (const model of models) {
      const opt = document.createElement("option");
      opt.value = `${model.providerID}/${model.modelID}`;
      opt.textContent = `${model.providerID}/${model.modelID}`;
      this.modelSelect.appendChild(opt);
    }
    const keep = models.find((model) => `${model.providerID}/${model.modelID}` === current);
    const preferred = models.find((model) => model.modelID.includes("flash-free"));
    const chosen = keep ?? preferred ?? models[0];
    if (chosen) this.modelSelect.value = `${chosen.providerID}/${chosen.modelID}`;
  }

  private async summonHousemate(): Promise<void> {
    const activeHouseId = this.houseManager?.getActiveHouseId() ?? "global";
    if (activeHouseId === "global") {
      return this.showSummonError("Cannot summon in Global House. Please create or switch to a Project House first.");
    }
    const name = (document.getElementById("summon-name") as HTMLInputElement | null)?.value.trim() ?? "";
    if (!name) return this.showSummonError("Enter a name for the housemate.");
    const agent = this.agentSelect?.value ?? "";
    if (!agent) return this.showSummonError("No opencode agent available. Check the managed opencode server.");
    const model = this.modelSelect?.value ?? "";
    const [providerID, modelID] = model.split("/");
    if (!providerID || !modelID) return this.showSummonError("Pick a model.");
    const activeHouse = this.houseManager?.getActiveHouse();
    const projectRoot = this.folderInput?.value.trim() || activeHouse?.root || "";
    const worktreeToggle = document.getElementById("summon-worktree") as HTMLInputElement | null;
    const useWorktree = worktreeToggle ? worktreeToggle.checked : true;
    const submit = document.getElementById("summon-submit") as HTMLButtonElement | null;
    if (submit) submit.disabled = true;
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
          houseId: activeHouseId,
          useWorktree,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; housemate?: { key: string } };
      if (!res.ok) {
        let errMsg = data.error ?? res.statusText;
        if (/not a git repository/i.test(errMsg) && useWorktree) {
          errMsg += " — Uncheck 'Isolate in git worktree' to run directly in this folder.";
        }
        return this.showSummonError(`Summon failed: ${errMsg}`);
      }
      if (this.folderInput) this.folderInput.value = activeHouse?.root ?? "";
      this.closeSummon();
      await this.refreshHousemates();
    } catch (error) {
      this.showSummonError(`Summon error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (submit) submit.disabled = false;
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
    const message = await promptKuyaCall(key);
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
