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
  private isRefreshingHousemates = false;
  private isRefreshingTasks = false;

  private collabModal: HTMLElement | null = null;
  private collabGoal: HTMLTextAreaElement | null = null;
  private collabFolder: HTMLSelectElement | null = null;
  private collabMembersList: HTMLElement | null = null;
  private collabMaxAttempts: HTMLInputElement | null = null;
  private collabError: HTMLElement | null = null;

  private hamonDetailsModal: HTMLElement | null = null;
  private activeHamonDetailsId: string | null = null;
  private hamonPollTimer: ReturnType<typeof setInterval> | null = null;
  private isPollingHamon = false;
  private currentHamonActiveKey: string | null = null;

  private agentInspectorModal: HTMLElement | null = null;
  private activeInspectorKey: string | null = null;
  private inspectorPollTimer: ReturnType<typeof setInterval> | null = null;
  private isPollingInspector = false;
  private activeInspectorTab: "thought" | "files" | "feed" = "thought";

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

    this.collabModal = document.getElementById("collab-modal");
    this.collabGoal = document.getElementById("collab-goal") as HTMLTextAreaElement | null;
    this.collabFolder = document.getElementById("collab-folder") as HTMLSelectElement | null;
    this.collabMembersList = document.getElementById("collab-members-list");
    this.collabMaxAttempts = document.getElementById("collab-max-attempts") as HTMLInputElement | null;
    this.collabError = document.getElementById("collab-error");

    const collabBtn = document.getElementById("btn-collab") as HTMLButtonElement | null;
    collabBtn?.addEventListener("click", () => void this.openCollab());
    document.getElementById("collab-close")?.addEventListener("click", () => this.closeCollab());
    document.getElementById("collab-cancel")?.addEventListener("click", () => this.closeCollab());
    document.getElementById("collab-submit")?.addEventListener("click", () => void this.submitCollab());
    this.collabModal?.addEventListener("click", (event) => {
      if (event.target === this.collabModal) this.closeCollab();
    });

    this.hamonDetailsModal = document.getElementById("hamon-details-modal");
    document.getElementById("hamon-details-close")?.addEventListener("click", () => this.closeHamonDetails());
    document.getElementById("hamon-modal-close-btn")?.addEventListener("click", () => this.closeHamonDetails());
    this.hamonDetailsModal?.addEventListener("click", (event) => {
      if (event.target === this.hamonDetailsModal) this.closeHamonDetails();
    });
    document.getElementById("hamon-modal-call-active")?.addEventListener("click", () => {
      if (this.currentHamonActiveKey) {
        this.closeHamonDetails();
        void this.callHousemateByKey(this.currentHamonActiveKey);
      } else {
        alert("Walang aktibong housemate sa ngayon.");
      }
    });
    document.getElementById("hamon-modal-cancel-task")?.addEventListener("click", () => {
      if (this.activeHamonDetailsId) {
        if (confirm("Kanselahin ang Lingguhang Hamon na ito?")) {
          void this.cancelCollabTask(this.activeHamonDetailsId);
        }
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.hamonDetailsModal && !this.hamonDetailsModal.hasAttribute("hidden")) {
        this.closeHamonDetails();
      }
    });

    this.agentInspectorModal = document.getElementById("agent-inspector-modal");
    document.getElementById("agent-inspector-close")?.addEventListener("click", () => this.closeAgentInspector());
    document.getElementById("agent-inspector-close-btn")?.addEventListener("click", () => this.closeAgentInspector());
    this.agentInspectorModal?.addEventListener("click", (event) => {
      if (event.target === this.agentInspectorModal) this.closeAgentInspector();
    });
    document.getElementById("tab-inspector-thought")?.addEventListener("click", () => this.switchInspectorTab("thought"));
    document.getElementById("tab-inspector-files")?.addEventListener("click", () => this.switchInspectorTab("files"));
    document.getElementById("tab-inspector-feed")?.addEventListener("click", () => this.switchInspectorTab("feed"));
    document.getElementById("inspector-call-btn")?.addEventListener("click", () => {
      if (this.activeInspectorKey) {
        this.closeAgentInspector();
        void this.callHousemateByKey(this.activeInspectorKey);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.agentInspectorModal && !this.agentInspectorModal.hasAttribute("hidden")) {
        this.closeAgentInspector();
      }
    });

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
    const autoApproveToggle = document.getElementById("summon-auto-approve") as HTMLInputElement | null;
    const noteEl = document.getElementById("summon-note");
    const updateNote = () => {
      if (noteEl) {
        const wtPart = worktreeToggle?.checked
          ? "Runs in a git worktree; your main tree is untouched."
          : "Runs directly in the selected project folder (no worktree isolation).";
        const aaPart = autoApproveToggle?.checked
          ? "Permissions: auto-approved (no popups)."
          : "Permissions: bash & edits ask first.";
        noteEl.textContent = `${wtPart} ${aaPart}`;
      }
    };
    if (worktreeToggle) {
      const saved = localStorage.getItem("kuya_use_worktree");
      if (saved !== null) {
        worktreeToggle.checked = saved === "true";
      }
      worktreeToggle.onchange = () => {
        localStorage.setItem("kuya_use_worktree", String(worktreeToggle.checked));
        updateNote();
      };
    }
    if (autoApproveToggle) {
      const saved = localStorage.getItem("kuya_auto_approve");
      if (saved !== null) {
        autoApproveToggle.checked = saved === "true";
      }
      autoApproveToggle.onchange = () => {
        localStorage.setItem("kuya_auto_approve", String(autoApproveToggle.checked));
        updateNote();
      };
    }
    updateNote();
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
    const autoApproveToggle = document.getElementById("summon-auto-approve") as HTMLInputElement | null;
    const useWorktree = worktreeToggle ? worktreeToggle.checked : true;
    const autoApprove = autoApproveToggle ? autoApproveToggle.checked : true;
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
          permissions: autoApprove
            ? { "*": "allow", bash: "allow", edit: "allow", read: "allow", glob: "allow" }
            : { bash: "ask", edit: "ask" },
          autoApprove,
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
    await this.callHousemateByKey(key);
  }

  private async callHousemateByKey(key: string): Promise<void> {
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
      (window as any).selectCamera?.("confession");
      await this.refreshHousemates();
    } catch (error) {
      alert(`Call error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async refreshHousemates(): Promise<void> {
    if (!this.housemateSelect || this.isRefreshingHousemates || document.hidden) return;
    this.isRefreshingHousemates = true;
    try {
      const res = await this.api("/state", { signal: AbortSignal.timeout(3000) });
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
      if (this.harnessSelect) {
        const taskCurrent = this.harnessSelect.value;
        this.harnessSelect.innerHTML = `<option value="">Select Housemate to assign...</option>`;
        for (const row of rows) {
          const opt = document.createElement("option");
          opt.value = row.housemateKey!;
          opt.textContent = `${row.housemateKey} (${row.state})`;
          if (row.housemateKey === taskCurrent) opt.selected = true;
          this.harnessSelect.appendChild(opt);
        }
      }
      if (this.agentSelect && this.agentSelect.options.length === 0) void this.loadOpenCodeOptions();
    } catch {
      /* state unavailable */
    } finally {
      this.isRefreshingHousemates = false;
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
    for (const h of harnesses) {
      if (h.name === "opencode" && h.installed) {
        this.installedHarnesses.add("opencode");
      }
    }
  }

  recordDirectory(dir?: string): void {
    if (dir && !this.knownDirs.has(dir)) {
      this.knownDirs.add(dir);
      this.updateCwdOptions();
    }
  }

  private updateHarnessOptions(): void {
    if (!this.harnessSelect) return;
    if (this.harnessSelect.options.length <= 1) {
      this.harnessSelect.innerHTML = `<option value="">Select Housemate to assign...</option>`;
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
    const housemateKey = this.harnessSelect.value;
    const cwd = this.cwdSelect.value || this.roots[0] || "";

    if (!prompt) {
      alert("Please enter a task prompt for the housemate.");
      return;
    }
    if (!housemateKey) {
      alert("Please select a housemate to assign this task to. (Summon a housemate first if none exists)");
      return;
    }
    if (!this.token) {
      alert("Authentication token not available. Please ensure server is running.");
      return;
    }

    try {
      const res = await this.api(`/api/housemates/${encodeURIComponent(housemateKey)}/task`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ prompt, cwd }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to dispatch task" }));
        alert(`Dispatch failed: ${err.error || res.statusText}`);
        return;
      }

      this.promptEl.value = "";
      (window as any).selectCamera?.("office");
      await this.refreshTasks();
      await this.refreshHousemates();
    } catch (err: any) {
      alert(`Dispatch error: ${err.message}`);
    }
  }

  private async openCollab(): Promise<void> {
    if (!this.collabModal || !this.collabMembersList) return;
    if (this.collabError) this.collabError.hidden = true;

    // Populate project folders
    if (this.collabFolder) {
      this.collabFolder.innerHTML = "";
      const allDirs = Array.from(new Set([...this.roots, ...this.knownDirs])).sort();
      for (const dir of allDirs) {
        const opt = document.createElement("option");
        opt.value = dir;
        opt.textContent = dir;
        this.collabFolder.appendChild(opt);
      }
    }

    // Fetch housemates with their actual OpenCode agents
    let housemates: Array<{ key: string; name: string; model: string; agent: string }> = [];
    try {
      const res = await this.api("/api/housemates");
      if (res.ok) {
        const data = await res.json();
        housemates = (data.housemates ?? []).map((h: any) => ({
          key: h.key,
          name: h.name,
          model: h.model,
          agent: h.agent || "build",
        }));
      }
    } catch {}

    if (housemates.length < 2) {
      alert("Lingguhang Hamon requires at least 2 summoned housemates. Summon more housemates first!");
      return;
    }

    this.collabMembersList.innerHTML = "";
    housemates.forEach((h, idx) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "8px";
      row.style.padding = "4px 0";

      const left = document.createElement("label");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "6px";
      left.style.cursor = "pointer";
      left.style.fontSize = "12px";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "collab-member-check";
      checkbox.value = h.key;
      checkbox.dataset.name = h.name;
      checkbox.checked = idx < 4; // Check up to 4

      const isVerifier = /test|qa|review|eval|check|audit/i.test(h.agent || "");
      const nameSpan = document.createElement("span");
      nameSpan.innerHTML = `<strong>🦫 ${h.name}</strong> <span style="opacity:0.75; font-size:11px;">[agent: <code>${h.agent}</code>]</span>`;

      left.append(checkbox, nameSpan);

      const roleSelect = document.createElement("select");
      roleSelect.className = "collab-member-role";
      roleSelect.dataset.key = h.key;
      roleSelect.innerHTML = `
        <option value="builder" ${!isVerifier ? "selected" : ""}>🔨 Builder (${h.agent})</option>
        <option value="verifier" ${isVerifier ? "selected" : ""}>🔍 Verifier (${h.agent})</option>
      `;
      roleSelect.style.fontSize = "11px";
      roleSelect.style.padding = "2px 6px";

      row.append(left, roleSelect);
      this.collabMembersList!.appendChild(row);
    });

    this.collabModal.hidden = false;
  }

  private closeCollab(): void {
    if (this.collabModal) this.collabModal.hidden = true;
  }

  private async submitCollab(): Promise<void> {
    if (!this.collabGoal || !this.collabMembersList) return;
    const goal = this.collabGoal.value.trim();
    if (!goal) {
      if (this.collabError) {
        this.collabError.textContent = "Please enter a mission goal / prompt.";
        this.collabError.hidden = false;
      }
      return;
    }

    const checks = Array.from(this.collabMembersList.querySelectorAll<HTMLInputElement>(".collab-member-check:checked"));
    if (checks.length < 2) {
      if (this.collabError) {
        this.collabError.textContent = "Please select at least 2 housemates for collaboration.";
        this.collabError.hidden = false;
      }
      return;
    }
    if (checks.length > 4) {
      if (this.collabError) {
        this.collabError.textContent = "Maximum 4 housemates can participate in a collaboration task.";
        this.collabError.hidden = false;
      }
      return;
    }

    const members = checks.map((c) => {
      const key = c.value;
      const roleSel = this.collabMembersList!.querySelector<HTMLSelectElement>(`.collab-member-role[data-key="${key}"]`);
      return {
        key,
        isVerifier: roleSel?.value === "verifier",
      };
    });

    const cwd = this.collabFolder?.value || "";
    const maxAttempts = parseInt(this.collabMaxAttempts?.value || "3", 10) || 3;

    try {
      const res = await this.api("/api/collab/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal, cwd, members, maxAttempts }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to start collaboration task" }));
        if (this.collabError) {
          this.collabError.textContent = err.error || res.statusText;
          this.collabError.hidden = false;
        }
        return;
      }

      this.collabGoal.value = "";
      this.closeCollab();
      (window as any).selectCamera?.("office");
      await this.refreshTasks();
    } catch (err: any) {
      if (this.collabError) {
        this.collabError.textContent = err.message || "Network error";
        this.collabError.hidden = false;
      }
    }
  }

  async cancelCollabTask(id: string): Promise<void> {
    if (!this.token) return;
    try {
      await fetch(`/api/collab/tasks/${id}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.token}` },
      });
      await this.refreshTasks();
    } catch {}
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
    if (!this.tasksListEl || !this.token || this.isRefreshingTasks || document.hidden) return;
    this.isRefreshingTasks = true;
    try {
      const res = await fetch("/api/tasks", {
        headers: { authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(3000),
      });
      const tasks: TaskItem[] = res.ok ? await res.json() : [];

      let collabTasks: any[] = [];
      try {
        const cRes = await fetch("/api/collab/tasks", {
          headers: { authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(3000),
        });
        if (cRes.ok) collabTasks = await cRes.json();
      } catch {}

      if (tasks.length === 0 && collabTasks.length === 0) {
        this.tasksListEl.innerHTML = `<p class="empty-tasks">No tasks dispatched yet.</p>`;
        return;
      }

      this.tasksListEl.innerHTML = "";

      // 1. Render active or recent Collab tasks first
      for (const ct of collabTasks.slice(0, 3)) {
        const item = document.createElement("div");
        item.className = "task-item";
        item.style.borderLeft = "3px solid #8b5cf6";
        item.style.background = "rgba(139, 92, 246, 0.08)";
        item.style.cursor = "pointer";
        item.title = "Click to inspect live conversation and progress";
        item.addEventListener("click", () => this.openHamonDetails(ct.id));

        const info = document.createElement("div");
        info.className = "task-info";

        const badge = document.createElement("span");
        badge.className = `task-status ${ct.status}`;
        badge.style.background = "#7c3aed";
        badge.style.color = "#ffffff";
        badge.textContent = `👥 HAMON: ${ct.status.toUpperCase()}`;

        const teamSpan = document.createElement("span");
        teamSpan.className = "task-harness";
        teamSpan.textContent = `Team: ${ct.members.map((m: any) => `${m.name} [${m.agent || m.role || "agent"}]`).join(", ")}`;

        const promptSpan = document.createElement("span");
        promptSpan.className = "task-prompt";
        promptSpan.textContent = `[Step: ${ct.currentStep} | Try ${ct.attempt}/${ct.maxAttempts}] ${ct.goal}`;
        promptSpan.title = ct.goal;

        info.append(badge, teamSpan, promptSpan);
        item.appendChild(info);

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "6px";
        actions.style.alignItems = "center";

        const inspectBtn = document.createElement("button");
        inspectBtn.className = "task-cancel-btn";
        inspectBtn.style.borderColor = "#8b5cf6";
        inspectBtn.style.color = "#c4b5fd";
        inspectBtn.style.background = "rgba(139, 92, 246, 0.15)";
        inspectBtn.textContent = "🔍 View";
        inspectBtn.title = "View live discussion and conversation";
        inspectBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.openHamonDetails(ct.id);
        });
        actions.appendChild(inspectBtn);

        if (ct.status === "running") {
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "task-cancel-btn";
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.cancelCollabTask(ct.id);
          });
          actions.appendChild(cancelBtn);
        }

        item.appendChild(actions);
        this.tasksListEl.appendChild(item);
      }

      // 2. Render individual tasks
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
        harnessSpan.textContent = (t as any).housemateName ? `🦫 ${(t as any).housemateName}` : t.harness;

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
    } finally {
      this.isRefreshingTasks = false;
    }
  }

  openHamonDetails(taskId: string): void {
    this.activeHamonDetailsId = taskId;
    if (this.hamonDetailsModal) this.hamonDetailsModal.removeAttribute("hidden");
    void this.pollHamonDetails();
    if (this.hamonPollTimer) clearInterval(this.hamonPollTimer);
    this.hamonPollTimer = setInterval(() => void this.pollHamonDetails(), 1500);
  }

  closeHamonDetails(): void {
    this.activeHamonDetailsId = null;
    this.currentHamonActiveKey = null;
    if (this.hamonPollTimer) {
      clearInterval(this.hamonPollTimer);
      this.hamonPollTimer = null;
    }
    if (this.hamonDetailsModal) this.hamonDetailsModal.setAttribute("hidden", "true");
  }

  private async pollHamonDetails(): Promise<void> {
    if (!this.activeHamonDetailsId || this.isPollingHamon || document.hidden) return;
    this.isPollingHamon = true;
    try {
      const res = await fetch(`/api/collab/tasks/${encodeURIComponent(this.activeHamonDetailsId)}`, {
        headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;
      const task = await res.json();
      this.renderHamonDetails(task);
    } catch {
      /* ignore */
    } finally {
      this.isPollingHamon = false;
    }
  }

  private renderHamonDetails(task: any): void {
    if (!this.hamonDetailsModal) return;
    this.currentHamonActiveKey = task.activeMemberKey || null;

    const statusBadge = document.getElementById("hamon-modal-status-badge");
    if (statusBadge) {
      statusBadge.textContent = `HAMON: ${String(task.status).toUpperCase()}`;
      if (task.status === "done") {
        statusBadge.style.background = "#059669";
      } else if (task.status === "failed" || task.status === "canceled") {
        statusBadge.style.background = "#dc2626";
      } else if (task.status === "blocked") {
        statusBadge.style.background = "#d97706";
      } else {
        statusBadge.style.background = "#7c3aed";
      }
    }

    const stepBadge = document.getElementById("hamon-modal-step-badge");
    if (stepBadge) {
      stepBadge.textContent = `Step: ${task.currentStep} | Attempt ${task.attempt}/${task.maxAttempts}`;
    }

    const goalEl = document.getElementById("hamon-modal-goal");
    if (goalEl) {
      goalEl.textContent = `🎯 Mission Goal: ${task.goal}`;
    }

    const rosterEl = document.getElementById("hamon-modal-roster");
    if (rosterEl && Array.isArray(task.members)) {
      rosterEl.innerHTML = "";
      for (const m of task.members) {
        const pill = document.createElement("div");
        pill.style.display = "flex";
        pill.style.alignItems = "center";
        pill.style.gap = "6px";
        pill.style.padding = "3px 8px";
        pill.style.borderRadius = "4px";
        pill.style.background = "rgba(255, 255, 255, 0.05)";
        pill.style.border = "1px solid rgba(255, 255, 255, 0.1)";

        const nameSpan = document.createElement("span");
        nameSpan.style.fontWeight = "600";
        nameSpan.style.color = "#f8fafc";
        nameSpan.textContent = `🦫 ${m.name}`;

        const agentSpan = document.createElement("span");
        agentSpan.style.color = "#94a3b8";
        agentSpan.style.fontSize = "10px";
        agentSpan.textContent = `[${m.agent}]`;

        const stateSpan = document.createElement("span");
        stateSpan.style.fontSize = "9px";
        stateSpan.style.padding = "1px 5px";
        stateSpan.style.borderRadius = "2px";
        stateSpan.style.fontWeight = "700";
        stateSpan.style.textTransform = "uppercase";

        if (m.state === "working") {
          stateSpan.style.background = "#059669";
          stateSpan.style.color = "#ffffff";
          stateSpan.textContent = "⚡ WORKING";
        } else if (m.state === "standby") {
          stateSpan.style.background = "#7c3aed";
          stateSpan.style.color = "#ffffff";
          stateSpan.textContent = "⏳ STANDBY";
        } else if (m.state === "blocked") {
          stateSpan.style.background = "#dc2626";
          stateSpan.style.color = "#ffffff";
          stateSpan.textContent = "🛑 BLOCKED";
        } else {
          stateSpan.style.background = "#475569";
          stateSpan.style.color = "#cbd5e1";
          stateSpan.textContent = String(m.state).toUpperCase();
        }

        pill.style.cursor = "pointer";
        pill.title = `Click to inspect ${m.name}'s live OpenCode instance`;
        pill.addEventListener("click", () => this.openAgentInspector(m.key));

        const inspectBadge = document.createElement("span");
        inspectBadge.style.fontSize = "9px";
        inspectBadge.style.color = "#818cf8";
        inspectBadge.style.marginLeft = "2px";
        inspectBadge.textContent = "🔍";

        pill.append(nameSpan, agentSpan, stateSpan, inspectBadge);
        rosterEl.appendChild(pill);
      }
    }

    const logEl = document.getElementById("hamon-details-log");
    if (logEl && Array.isArray(task.log)) {
      const isAtBottom = logEl.scrollHeight - logEl.scrollTop <= logEl.clientHeight + 60;
      logEl.innerHTML = "";

      if (task.log.length === 0) {
        logEl.innerHTML = `<div style="color:#64748b; font-style:italic;">Initializing task conversation...</div>`;
      } else {
        for (const entry of task.log) {
          const entryEl = document.createElement("div");
          entryEl.style.padding = "8px 10px";
          entryEl.style.borderRadius = "4px";

          const header = document.createElement("div");
          header.style.display = "flex";
          header.style.justifyContent = "space-between";
          header.style.marginBottom = "4px";
          header.style.fontSize = "10px";
          header.style.fontWeight = "600";

          const timeStr = new Date(entry.ts).toLocaleTimeString();
          const timeSpan = document.createElement("span");
          timeSpan.style.color = "#64748b";
          timeSpan.textContent = timeStr;

          const speakerSpan = document.createElement("span");

          if (entry.agent === "kuya") {
            entryEl.style.background = "rgba(240, 163, 58, 0.08)";
            entryEl.style.borderLeft = "3px solid #f0a33a";
            speakerSpan.style.color = "#f0a33a";
            speakerSpan.textContent = `🎙️ KUYA`;
          } else {
            entryEl.style.background = "rgba(30, 41, 59, 0.5)";
            entryEl.style.borderLeft = "3px solid #818cf8";
            speakerSpan.style.color = "#818cf8";
            speakerSpan.textContent = `🦫 ${entry.name} [agent: ${entry.agent}]`;
          }

          header.append(speakerSpan, timeSpan);

          const body = document.createElement("div");
          body.style.whiteSpace = "pre-wrap";
          body.style.wordBreak = "break-word";
          body.style.color = "#cbd5e1";
          body.textContent = entry.text;

          // Highlight verification pass / fail
          if (entry.text.includes("VERIFICATION_PASSED")) {
            entryEl.style.borderLeft = "3px solid #10b981";
            entryEl.style.background = "rgba(16, 185, 129, 0.1)";
          } else if (entry.text.includes("VERIFICATION_FAILED")) {
            entryEl.style.borderLeft = "3px solid #ef4444";
            entryEl.style.background = "rgba(239, 68, 68, 0.1)";
          }

          entryEl.append(header, body);
          logEl.appendChild(entryEl);
        }
      }

      if (isAtBottom) {
        logEl.scrollTop = logEl.scrollHeight;
      }
    }
  }

  openAgentInspector(housemateKey: string): void {
    this.activeInspectorKey = housemateKey;
    if (this.agentInspectorModal) this.agentInspectorModal.removeAttribute("hidden");
    this.switchInspectorTab("thought");
    void this.pollAgentInspector();
    if (this.inspectorPollTimer) clearInterval(this.inspectorPollTimer);
    this.inspectorPollTimer = setInterval(() => void this.pollAgentInspector(), 1500);
  }

  closeAgentInspector(): void {
    this.activeInspectorKey = null;
    if (this.inspectorPollTimer) {
      clearInterval(this.inspectorPollTimer);
      this.inspectorPollTimer = null;
    }
    if (this.agentInspectorModal) this.agentInspectorModal.setAttribute("hidden", "true");
  }

  switchInspectorTab(tab: "thought" | "files" | "feed"): void {
    this.activeInspectorTab = tab;
    const btnThought = document.getElementById("tab-inspector-thought");
    const btnFiles = document.getElementById("tab-inspector-files");
    const btnFeed = document.getElementById("tab-inspector-feed");
    const viewThought = document.getElementById("inspector-view-thought");
    const viewFiles = document.getElementById("inspector-view-files");
    const viewFeed = document.getElementById("inspector-view-feed");

    btnThought?.classList.toggle("active", tab === "thought");
    btnFiles?.classList.toggle("active", tab === "files");
    btnFeed?.classList.toggle("active", tab === "feed");

    if (viewThought) viewThought.style.display = tab === "thought" ? "flex" : "none";
    if (viewFiles) viewFiles.style.display = tab === "files" ? "flex" : "none";
    if (viewFeed) viewFeed.style.display = tab === "feed" ? "flex" : "none";
  }

  private async pollAgentInspector(): Promise<void> {
    if (!this.activeInspectorKey || this.isPollingInspector || document.hidden) return;
    this.isPollingInspector = true;
    try {
      const res = await fetch(`/api/housemates/${encodeURIComponent(this.activeInspectorKey)}/inspect`, {
        headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return;
      const data = await res.json();
      this.renderAgentInspector(data);
    } catch {
      /* ignore */
    } finally {
      this.isPollingInspector = false;
    }
  }

  private renderAgentInspector(data: any): void {
    if (!this.agentInspectorModal || !data) return;

    const titleEl = document.getElementById("inspector-title");
    if (titleEl) titleEl.textContent = `${data.name} — Live OpenCode Instance`;

    const subheadEl = document.getElementById("inspector-subhead");
    if (subheadEl) subheadEl.textContent = `OpenCode Session ID: ${data.sessionId || "—"}`;

    const nameBadge = document.getElementById("inspector-name-badge");
    if (nameBadge) nameBadge.textContent = `🦫 ${data.name}`;

    const roleBadge = document.getElementById("inspector-role-badge");
    if (roleBadge) roleBadge.textContent = data.agent || "custom";

    const stateBadge = document.getElementById("inspector-state-badge");
    if (stateBadge) {
      stateBadge.textContent = String(data.state).toUpperCase();
      if (data.state === "working") stateBadge.style.background = "#059669";
      else if (data.state === "standby") stateBadge.style.background = "#7c3aed";
      else if (data.state === "called") stateBadge.style.background = "#f59e0b";
      else if (data.state === "blocked") stateBadge.style.background = "#dc2626";
      else stateBadge.style.background = "#475569";
    }

    const modelEl = document.getElementById("inspector-model");
    if (modelEl) modelEl.textContent = data.model || "—";

    const actionEl = document.getElementById("inspector-action");
    if (actionEl) actionEl.textContent = data.currentAction || (data.state === "working" ? "Working on task" : data.state);

    const dirEl = document.getElementById("inspector-dir");
    if (dirEl) dirEl.textContent = data.directory || "—";

    // 1. Thought Process View
    const thoughtEl = document.getElementById("inspector-thought-content");
    if (thoughtEl) {
      let combinedThought = "";
      if (data.currentThought) {
        combinedThought = data.currentThought;
      }
      const thoughtActs = (data.recentActivities || []).filter((a: any) => a.type === "thought" && a.detail);
      if (thoughtActs.length > 0) {
        combinedThought = thoughtActs.map((a: any) => `[${new Date(a.ts).toLocaleTimeString()}] ${a.detail}`).join("\n\n---\n\n");
      }
      thoughtEl.textContent = combinedThought.trim() || "(No inner thoughts generated yet. When the agent plans or generates reasoning tokens, they stream here live.)";
    }

    // 2. Files & Tools View
    const fileCountEl = document.getElementById("inspector-file-count");
    if (fileCountEl) fileCountEl.textContent = String(data.filesEdited?.length || 0);

    const filesListEl = document.getElementById("inspector-files-list");
    if (filesListEl) {
      filesListEl.innerHTML = "";
      if (!data.filesEdited || data.filesEdited.length === 0) {
        filesListEl.innerHTML = `<span style="color:#64748b; font-size:11px;">No files touched yet.</span>`;
      } else {
        for (const file of data.filesEdited) {
          const badge = document.createElement("span");
          badge.style.display = "inline-flex";
          badge.style.alignItems = "center";
          badge.style.gap = "4px";
          badge.style.padding = "2px 8px";
          badge.style.borderRadius = "3px";
          badge.style.background = "rgba(56, 189, 248, 0.12)";
          badge.style.border = "1px solid rgba(56, 189, 248, 0.3)";
          badge.style.color = "#38bdf8";
          badge.style.fontSize = "11px";
          badge.style.fontWeight = "600";
          badge.textContent = `📄 ${file}`;
          filesListEl.appendChild(badge);
        }
      }
    }

    const toolsLogEl = document.getElementById("inspector-tools-log");
    if (toolsLogEl) {
      toolsLogEl.innerHTML = "";
      const toolActs = (data.recentActivities || []).filter((a: any) => a.type === "tool" || a.type === "patch" || a.type === "command");
      if (toolActs.length === 0) {
        toolsLogEl.innerHTML = `<div style="color:#64748b; font-style:italic;">No tool executions recorded yet.</div>`;
      } else {
        for (const act of [...toolActs].reverse()) {
          const row = document.createElement("div");
          row.style.padding = "6px 8px";
          row.style.background = "rgba(15, 23, 42, 0.7)";
          row.style.borderRadius = "3px";
          row.style.borderLeft = act.type === "patch" ? "3px solid #10b981" : act.type === "command" ? "3px solid #f59e0b" : "3px solid #6366f1";

          const top = document.createElement("div");
          top.style.display = "flex";
          top.style.justifyContent = "space-between";
          top.style.fontSize = "10px";
          top.style.fontWeight = "600";
          top.style.color = act.type === "patch" ? "#34d399" : act.type === "command" ? "#fbbf24" : "#a5b4fc";
          top.textContent = act.title;

          const timeSpan = document.createElement("span");
          timeSpan.style.color = "#64748b";
          timeSpan.style.fontWeight = "normal";
          timeSpan.textContent = new Date(act.ts).toLocaleTimeString();
          top.appendChild(timeSpan);

          row.appendChild(top);

          if (act.detail && act.detail !== "{}" && act.detail !== '""') {
            const code = document.createElement("pre");
            code.style.margin = "4px 0 0";
            code.style.fontSize = "10px";
            code.style.color = "#cbd5e1";
            code.style.maxHeight = "120px";
            code.style.overflow = "auto";
            code.textContent = act.detail;
            row.appendChild(code);
          }

          toolsLogEl.appendChild(row);
        }
      }
    }

    // 3. Full Stream View
    const feedCountEl = document.getElementById("inspector-feed-count");
    if (feedCountEl) feedCountEl.textContent = `${data.messages?.length || 0} messages`;

    const feedLogEl = document.getElementById("inspector-feed-log");
    if (feedLogEl) {
      feedLogEl.innerHTML = "";
      if (!data.messages || data.messages.length === 0) {
        feedLogEl.innerHTML = `<div style="color:#64748b; font-style:italic;">No conversation messages found for this session.</div>`;
      } else {
        for (const msg of data.messages) {
          const msgEl = document.createElement("div");
          msgEl.style.padding = "8px 10px";
          msgEl.style.borderRadius = "4px";

          const isUser = msg.role === "user";
          msgEl.style.background = isUser ? "rgba(59, 130, 246, 0.08)" : "rgba(30, 41, 59, 0.4)";
          msgEl.style.borderLeft = isUser ? "3px solid #3b82f6" : "3px solid #10b981";

          const head = document.createElement("div");
          head.style.fontSize = "10px";
          head.style.fontWeight = "700";
          head.style.color = isUser ? "#60a5fa" : "#34d399";
          head.style.marginBottom = "4px";
          head.textContent = isUser ? "👤 USER / KUYA PROMPT" : `🦫 ${data.name} [${data.agent}]`;
          msgEl.appendChild(head);

          const parts = Array.isArray(msg.parts) ? msg.parts : [{ text: msg.content || "" }];
          for (const p of parts) {
            if (p.type === "thought" && p.text) {
              const th = document.createElement("div");
              th.style.fontSize = "10.5px";
              th.style.fontStyle = "italic";
              th.style.color = "#a78bfa";
              th.style.background = "rgba(167, 139, 250, 0.08)";
              th.style.padding = "4px 8px";
              th.style.borderRadius = "3px";
              th.style.margin = "4px 0";
              th.textContent = `💭 ${p.text}`;
              msgEl.appendChild(th);
            } else if (p.type === "tool") {
              const tl = document.createElement("div");
              tl.style.fontSize = "10px";
              tl.style.color = "#fbbf24";
              tl.style.background = "rgba(245, 158, 11, 0.08)";
              tl.style.padding = "4px 8px";
              tl.style.borderRadius = "3px";
              tl.style.margin = "4px 0";
              tl.textContent = `⚡ Tool: ${p.tool || "call"} ${p.input?.path ? `(file: ${p.input.path})` : p.input?.command ? `(cmd: ${p.input.command})` : ""}`;
              msgEl.appendChild(tl);
            } else if (p.text) {
              const txt = document.createElement("div");
              txt.style.whiteSpace = "pre-wrap";
              txt.style.wordBreak = "break-word";
              txt.style.color = "#e2e8f0";
              txt.textContent = p.text;
              msgEl.appendChild(txt);
            }
          }

          feedLogEl.appendChild(msgEl);
        }
      }
    }
  }
}
