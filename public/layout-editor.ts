// Dev-only layout editor (toggled with E).
//
// Click a prop to select it; arrows nudge one tile; drag moves with grid snap; R flips or
// cycles existing sprite variants; Delete removes; Ctrl+Z / Ctrl+Y undo/redo. The selected
// prop's id, tile and drawn rect are shown in the HUD; violations come from the same
// drawn-bounds validator as the G overlay and are highlighted red while editing.
//
// Save POSTs to /api/layout/save (bearer token + loopback enforced server-side), which
// backs up the map, refuses structural changes and regenerates collision.
import type { HouseMap, MapProp } from "./map.js";
import type { MapRenderer } from "./renderer.js";
import { validateFurniture, type Violation } from "./furniture-validate.js";

interface MetaSprite {
  width: number;
  height: number;
  footprint: [number, number];
  walkable: boolean;
  variants?: string[];
}

type MetaMap = Record<string, MetaSprite>;

const T = 16;

export class LayoutEditor {
  private map: HouseMap;
  private renderer: MapRenderer;
  private enabled = false;
  private selectedId: string | null = null;
  private history: string[] = [];
  private redoStack: string[] = [];
  private hud: HTMLElement | null = null;
  private statusLine = "";
  private drag: { id: string; startClientX: number; startClientY: number; originX: number; originY: number } | null = null;

  constructor(map: HouseMap, renderer: MapRenderer) {
    this.map = map;
    this.renderer = renderer;
  }

  /** True when the editor is active (used by tests). */
  get isEnabled(): boolean {
    return this.enabled;
  }

  private meta(): MetaMap {
    return (this.renderer.meta?.sprites ?? {}) as MetaMap;
  }

  private selected(): MapProp | undefined {
    return this.selectedId ? this.map.props.find((p) => p.id === this.selectedId) : undefined;
  }

  init(): void {
    window.addEventListener("keydown", this.onKeyDown, true);
    const canvas = document.getElementById("scene");
    canvas?.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    this.buildHud();
  }

  toggle(force?: boolean): void {
    this.enabled = force ?? !this.enabled;
    this.renderer.toggleDebugOverlay(this.enabled);
    if (!this.enabled) {
      this.selectedId = null;
      this.drag = null;
      this.renderer.setSelection(null);
    }
    if (this.hud) this.hud.style.display = this.enabled ? "block" : "none";
    this.updateHud();
  }

  private buildHud(): void {
    const hud = document.createElement("div");
    hud.id = "layout-editor-hud";
    hud.style.cssText = [
      "position:fixed",
      "left:9px",
      "bottom:9px",
      "z-index:50",
      "display:none",
      "max-width:520px",
      "padding:8px 10px",
      "border:1px solid #64d2ff",
      "background:rgba(6,10,18,.92)",
      "color:#cfe8ff",
      "font:11px/1.5 ui-monospace,monospace",
      "white-space:pre-wrap",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(hud);
    this.hud = hud;
  }

  private updateHud(): void {
    if (!this.hud) return;
    if (!this.enabled) {
      this.hud.textContent = "";
      return;
    }
    const p = this.selected();
    const m = p ? this.meta()[p.sprite] : undefined;
    const violations = this.violations();
    const lines: string[] = [];
    lines.push(`LAYOUT EDITOR — E to exit | arrows move | drag | R flip/variant | Del remove | Ctrl+Z/Y | Ctrl+S save`);
    if (p && m) {
      lines.push(`selected ${p.id} (${p.sprite}) tile ${p.x},${p.y} layer ${p.layer ?? "object"}`);
      lines.push(`drawn rect x${p.x}..${+(p.x + m.width / T).toFixed(2)} y${p.y}..${+(p.y + m.height / T).toFixed(2)} (${m.width}x${m.height}px) flip ${p.flip ? "yes" : "no"} variant ${p.variant || "-"}`);
    } else {
      lines.push("selected: none — click a prop");
    }
    lines.push(`violations: ${violations.length}${violations.length ? " — " + violations.slice(0, 3).map((v) => v.prop + ":" + v.rule).join(", ") : ""}`);
    if (this.statusLine) lines.push(this.statusLine);
    this.hud.textContent = lines.join("\n");
  }

  private violations(): Violation[] {
    try {
      return validateFurniture(this.map, this.meta());
    } catch {
      return [];
    }
  }

  private commit(): void {
    this.history.push(JSON.stringify(this.map.props));
    if (this.history.length > 60) this.history.shift();
    this.redoStack = [];
  }

  private restore(snapshot: string | undefined): void {
    if (!snapshot) return;
    const props = JSON.parse(snapshot) as MapProp[];
    this.map.props = props;
    if (this.selectedId && !props.some((p) => p.id === this.selectedId)) this.selectedId = null;
    this.refresh();
  }

  private refresh(): void {
    this.renderer.refreshProps();
    const p = this.selected();
    const m = p ? this.meta()[p.sprite] : undefined;
    this.renderer.setSelection(p && m ? { x: p.x, y: p.y, w: m.width / T, h: m.height / T } : null);
    this.updateHud();
  }

  private select(prop: MapProp | null): void {
    this.selectedId = prop ? prop.id : null;
    this.refresh();
  }

  private moveBy(dx: number, dy: number): void {
    const p = this.selected();
    if (!p) return;
    this.commit();
    p.x = Math.max(0, Math.min(this.map.width - 1, p.x + dx));
    p.y = Math.max(0, Math.min(this.map.height - 1, p.y + dy));
    this.refresh();
  }

  private cycleAppearance(): void {
    const p = this.selected();
    if (!p) return;
    this.commit();
    const m = this.meta()[p.sprite];
    if (m?.variants && m.variants.length > 0) {
      const idx = m.variants.indexOf(p.variant ?? "");
      p.variant = m.variants[(idx + 1) % m.variants.length];
    } else {
      p.flip = !p.flip;
    }
    this.refresh();
  }

  private deleteSelected(): void {
    const p = this.selected();
    if (!p) return;
    this.commit();
    this.map.props = this.map.props.filter((q) => q.id !== p.id);
    this.selectedId = null;
    this.refresh();
  }

  private undo(): void {
    if (this.history.length === 0) return;
    this.redoStack.push(JSON.stringify(this.map.props));
    this.restore(this.history.pop());
  }

  private redo(): void {
    if (this.redoStack.length === 0) return;
    this.history.push(JSON.stringify(this.map.props));
    this.restore(this.redoStack.pop());
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (event.key.toLowerCase() === "e" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.toggle();
      return;
    }
    if (!this.enabled) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void this.save();
        return;
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) this.redo();
        else this.undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        this.redo();
      }
      return;
    }
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        this.moveBy(-1, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        this.moveBy(1, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.moveBy(0, -1);
        break;
      case "ArrowDown":
        event.preventDefault();
        this.moveBy(0, 1);
        break;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        this.deleteSelected();
        break;
      case "r":
      case "R":
        event.preventDefault();
        this.cycleAppearance();
        break;
      case "Escape":
        this.select(null);
        break;
      default:
        break;
    }
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) return;
    const world = this.renderer.screenToWorld(event.clientX, event.clientY);
    const prop = this.renderer.propAt(world.x, world.y);
    this.select(prop);
    if (!prop) return;
    this.commit();
    this.drag = {
      id: prop.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: prop.x,
      originY: prop.y,
    };
    event.preventDefault();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled || !this.drag) return;
    const p = this.map.props.find((q) => q.id === this.drag?.id);
    if (!p) return;
    const zoom = this.renderer.camera.zoom || 1;
    const dx = Math.round((event.clientX - this.drag.startClientX) / (T * zoom));
    const dy = Math.round((event.clientY - this.drag.startClientY) / (T * zoom));
    const nx = Math.max(0, Math.min(this.map.width - 1, this.drag.originX + dx));
    const ny = Math.max(0, Math.min(this.map.height - 1, this.drag.originY + dy));
    if (nx === p.x && ny === p.y) return;
    p.x = nx;
    p.y = ny;
    this.refresh();
  };

  private onPointerUp = (): void => {
    this.drag = null;
  };

  async save(): Promise<void> {
    this.statusLine = "saving…";
    this.updateHud();
    try {
      const tokenResponse = await fetch("/api/auth/token");
      if (!tokenResponse.ok) throw new Error("token unavailable");
      const { token } = (await tokenResponse.json()) as { token: string };
      const props = this.map.props.map((p) => ({
        id: p.id,
        sprite: p.sprite,
        x: p.x,
        y: p.y,
        variant: p.variant,
        frame: p.frame,
        layer: p.layer ?? "object",
        flip: Boolean(p.flip),
      }));
      const response = await fetch("/api/layout/save", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ props }),
      });
      const result = (await response.json()) as { ok?: boolean; backup?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      this.statusLine = `saved ${props.length} props — backup ${result.backup} — reloading…`;
      this.updateHud();
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      this.statusLine = `save failed: ${error instanceof Error ? error.message : String(error)}`;
      this.updateHud();
    }
  }
}

/** Expose the editor instance for dev tooling and the browser test harness. */
export function installLayoutEditor(map: HouseMap, renderer: MapRenderer): LayoutEditor {
  const editor = new LayoutEditor(map, renderer);
  editor.init();
  (window as unknown as { __layoutEditor?: LayoutEditor }).__layoutEditor = editor;
  return editor;
}
