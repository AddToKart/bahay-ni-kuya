// 3/4 top-down PixiJS pixel renderer for Bahay ni Kuya.
// Powered by the Oddboro-based compiled texture atlas (172 sprites, 2142 frames).
// Features integer scaling, nearest-neighbor filtering, static map layer caching,
// dynamic Y-sorting for furniture and 20+ characters, room ambient tints,
// stage spotlight in Confession Room, and security CCTV frame overlay.

import type { HouseMap, RoomId, MapProp } from "./map.js";
import { resolveCharacterFrame, resolveEmoteFrame, type Facing, type Action, type Emote } from "./anim.js";

declare const PIXI: any;

export interface Camera {
  x: number; // scene center x in world pixels
  y: number; // scene center y in world pixels
  zoom: number; // target zoom
  targetX: number;
  targetY: number;
  targetZoom: number;
  activeCamLabel: string;
}

export interface CharacterRenderState {
  key: string;
  harness: string;
  parentKey: string | null;
  sub: boolean;
  sleeping: boolean;
  room: RoomId;
  label: string;
  working: boolean;
  blocked: boolean;
  errorState: boolean;
  tool: string | null;
  bubbleUntil: number;
  instanceIndex: number;
  subagentCount: number;
  x: number;
  y: number;
  facing: Facing;
  action: Action;
  emote: Emote;
  emoteUntil?: number;
}

export class MapRenderer {
  canvas: HTMLCanvasElement;
  map: HouseMap;
  app: any = null;
  spritesheet: any = null;
  meta: any = null;
  ready = false;

  camera: Camera = {
    x: 336,
    y: 216,
    zoom: 1.1,
    targetX: 336,
    targetY: 216,
    targetZoom: 1.1,
    activeCamLabel: "CAM 4 - ALL HOUSE FEEDS",
  };

  // Scene graph containers
  stageContainer: any = null;
  groundContainer: any = null;
  floorContainer: any = null;
  wallContainer: any = null;
  ysortContainer: any = null;
  lightingContainer: any = null;
  cctvContainer: any = null;

  // Static prop sprites
  staticProps: any[] = [];

  // Dynamic character display object pool
  charNodes = new Map<string, {
    container: any;
    body: any;
    shadow: any;
    emote: any;
    bubble: any;
    bubbleText: any;
    bubbleBg: any;
    tether: any;
  }>();

  // CCTV elements
  cctvGraphics: any = null;
  cctvRecText: any = null;
  cctvRecDot: any = null;
  cctvCamText: any = null;
  cctvTimeText: any = null;
  cctvVignette: any = null;

  sceneW = 672;
  sceneH = 432;

  constructor(map: HouseMap) {
    this.map = map;
    this.canvas = document.getElementById("scene") as HTMLCanvasElement;
    this.initPixi().catch((err) => {
      console.error("PixiJS initialization failed:", err);
    });
  }

  async initPixi(): Promise<void> {
    if (typeof PIXI === "undefined") {
      console.warn("PixiJS not loaded, retrying...");
      setTimeout(() => this.initPixi(), 100);
      return;
    }

    // Force nearest-neighbor sampling for crisp pixel art
    PIXI.TextureStyle.defaultOptions.scaleMode = "nearest";

    this.app = new PIXI.Application();
    await this.app.init({
      canvas: this.canvas,
      width: 960,
      height: 580,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      backgroundColor: 0x0c0e14,
      roundPixels: true,
    });

    // Pause rendering when tab is hidden to save battery & GPU
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.app?.stop();
      } else {
        this.app?.start();
      }
    });

    // Load texture atlas & metadata
    const texture = await PIXI.Assets.load("/atlas/atlas.png");
    texture.source.scaleMode = "nearest";

    const [atlasData, metaData] = await Promise.all([
      fetch("/atlas/atlas.json").then((r) => r.json()),
      fetch("/atlas/meta.json").then((r) => r.json()),
    ]);

    this.meta = metaData;
    this.spritesheet = new PIXI.Spritesheet(texture, atlasData);
    await this.spritesheet.parse();

    this.buildScene();
    this.ready = true;
  }

  getTexture(key: string): any {
    if (!this.spritesheet) return null;
    return (
      this.spritesheet.textures[key] ||
      this.spritesheet.textures[`${key}/default`] ||
      this.spritesheet.textures[`${key}/0`] ||
      null
    );
  }

  buildScene(): void {
    // 1. Stage container (controlled by camera)
    this.stageContainer = new PIXI.Container();
    this.app.stage.addChild(this.stageContainer);

    // 2. Ground container (outdoor framing)
    this.groundContainer = new PIXI.Container();
    this.stageContainer.addChild(this.groundContainer);
    this.buildOutdoorPerimeter();

    // 3. Floor container (static floor tiles & rugs)
    this.floorContainer = new PIXI.Container();
    this.stageContainer.addChild(this.floorContainer);
    this.buildFloors();

    // 4. Wall container (faces, windows, caps, wall sconces, signs)
    this.wallContainer = new PIXI.Container();
    this.stageContainer.addChild(this.wallContainer);
    this.buildWalls();

    // 5. Y-sort container (furniture, props, characters)
    this.ysortContainer = new PIXI.Container();
    this.stageContainer.addChild(this.ysortContainer);
    this.buildProps();

    // 6. Lighting container (atmospheric room tints & confession spotlight)
    this.lightingContainer = new PIXI.Container();
    this.stageContainer.addChild(this.lightingContainer);
    this.buildLighting();

    // 7. CCTV overlay (screen-space frame, brackets, REC dot, camera label)
    this.cctvContainer = new PIXI.Container();
    this.app.stage.addChild(this.cctvContainer);
    this.buildCctvOverlay();
  }

  buildOutdoorPerimeter(): void {
    // Build grass and stone paths beyond the house perimeter
    const W = this.map.width;
    const H = this.map.height;

    for (let ty = -3; ty < H + 3; ty++) {
      for (let tx = -4; tx < W + 4; tx++) {
        // Outside the building walls
        const inside = tx >= 0 && tx < W && ty >= 0 && ty < H;
        if (!inside) {
          let texKey = "floor-grass/0";
          if (ty >= H) {
            // Outdoor sidewalk / street along bottom
            texKey = (tx + ty) % 2 === 0 ? "floor-sidewalk/0" : "floor-sidewalk/1";
          } else {
            // Seeded grass variety
            const hash = Math.abs(Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1;
            const variant = Math.floor(hash * 6);
            texKey = `floor-grass/${variant}`;
          }

          const tex = this.getTexture(texKey);
          if (tex) {
            const spr = new PIXI.Sprite(tex);
            spr.position.set(tx * 16, ty * 16);
            this.groundContainer.addChild(spr);
          }
        }
      }
    }
  }

  buildFloors(): void {
    const W = this.map.width;
    const H = this.map.height;
    const floors = this.map.floor;

    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const gid = floors[ty * W + tx];
        if (gid === 0) continue;

        let texKey = "floor-oak/0";
        switch (gid) {
          case 1: // Bedroom: slate wood planks
            texKey = `floor-oak/${(tx + ty) % 3}`;
            break;
          case 2: // Living Room: carpet & warm tiles
            texKey = `floor-carpet/${(tx + ty) % 3}`;
            break;
          case 3: // Office: parquet oak wood
            texKey = `floor-oak/${(tx + ty) % 4}`;
            break;
          case 4: // Kitchen: ceramic tiles
            texKey = `floor-tile/${(tx + ty) % 4}`;
            break;
          case 5: // Game Room: mauve carpet
            texKey = `floor-carpet/${(tx + ty) % 2 === 0 ? 1 : 2}`;
            break;
          case 6: // Confession Room: dark obsidian
            texKey = "floor-asphalt/0";
            break;
          case 7: // Hallway: Checkered obsidian
          case 8: // Hallway: Checkered cream
            texKey = (tx + ty) % 2 === 0 ? "floor-checkered/0" : "floor-checkered/1";
            break;
          case 9: // Gym / Garden: grass & rubber
            texKey = tx >= 38 ? "floor-rubber/0" : `floor-grass/${(tx + ty) % 5}`;
            break;
        }

        const tex = this.getTexture(texKey);
        if (tex) {
          const spr = new PIXI.Sprite(tex);
          spr.position.set(tx * 16, ty * 16);
          this.floorContainer.addChild(spr);
        }
      }
    }

    // Add floor-layer rugs from props
    for (const p of this.map.props || []) {
      if (p.layer === "floor") {
        const tex = this.getTexture(p.sprite);
        if (tex) {
          const spr = new PIXI.Sprite(tex);
          spr.position.set(p.x * 16, p.y * 16);
          this.floorContainer.addChild(spr);
        }
      }
    }
  }

  buildWalls(): void {
    const W = this.map.width;
    const H = this.map.height;
    const walls = this.map.walls;

    const isWall = (x: number, y: number): boolean => {
      if (x < 0 || x >= W || y < 0 || y >= H) return true;
      return walls[y * W + x] > 0;
    };

    // 1. Bitmasked wall caps
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (walls[ty * W + tx] === 0) continue;

        // 4-bit neighbor mask: North (1), East (2), South (4), West (8)
        const north = isWall(tx, ty - 1) ? 1 : 0;
        const east = isWall(tx + 1, ty) ? 2 : 0;
        const south = isWall(tx, ty + 1) ? 4 : 0;
        const west = isWall(tx - 1, ty) ? 8 : 0;
        const mask = north | east | south | west;

        const capTex = this.getTexture(`wall-plaster-cap/m${mask}`);
        if (capTex) {
          const spr = new PIXI.Sprite(capTex);
          spr.position.set(tx * 16, ty * 16);
          this.wallContainer.addChild(spr);
        }
      }
    }

    // 2. North wall interior faces & windows
    // Top rooms: Bedroom (1..11, y=1..2), Living (13..23, y=1..2), Office (25..40, y=1..2)
    const windowCols = new Set([4, 8, 14, 21, 27, 36]);
    for (let tx = 1; tx <= 40; tx++) {
      if (tx === 12 || tx === 24) continue;
      const isWindow = windowCols.has(tx);
      const texKey = isWindow ? "wall-plaster-window/0" : `wall-plaster-face/${tx % 3}`;
      const tex = this.getTexture(texKey);
      if (tex) {
        const spr = new PIXI.Sprite(tex);
        spr.position.set(tx * 16, 16);
        this.wallContainer.addChild(spr);
      }
    }

    // Wall-mounted props (posters, clocks, whiteboard, house sign, sconces)
    for (const p of this.map.props || []) {
      if (p.layer === "wall") {
        const tex = this.getTexture(p.sprite);
        if (tex) {
          const spr = new PIXI.Sprite(tex);
          spr.position.set(p.x * 16, p.y * 16);
          this.wallContainer.addChild(spr);
        }
      }
    }
  }

  buildProps(): void {
    // Add all static furniture and objects to ysortContainer
    for (const p of this.map.props || []) {
      if (p.layer === "floor" || p.layer === "wall") continue;

      let texKey = p.sprite;
      if (p.variant) {
        texKey = `${p.sprite}@${p.variant}/default`;
      }
      let tex = this.getTexture(texKey);
      if (!tex) {
        tex = this.getTexture(p.sprite);
      }
      if (!tex) continue;

      const spr = new PIXI.Sprite(tex);
      spr.position.set(p.x * 16, p.y * 16);
      if (p.flip) {
        spr.scale.x = -1;
        spr.anchor.x = 1;
      }

      // Foot Y position for depth sorting
      const spriteMeta = this.meta?.sprites?.[p.sprite];
      const footprintH = spriteMeta?.footprint?.[1] ?? 1;
      (spr as any).footY = p.y * 16 + footprintH * 16 + (p.zbias ?? 0);

      this.ysortContainer.addChild(spr);
      this.staticProps.push(spr);
    }
  }

  buildLighting(): void {
    // 1. Confession Room dark moody atmosphere
    const darkMask = new PIXI.Graphics();
    darkMask.rect(16, 256, 128, 160);
    darkMask.fill({ color: 0x060810, alpha: 0.65 });
    this.lightingContainer.addChild(darkMask);

    // Conical spotlight beam from ceiling down to chair
    const cone = new PIXI.Graphics();
    cone.moveTo(68, 288);
    cone.lineTo(76, 288);
    cone.lineTo(94, 332);
    cone.lineTo(50, 332);
    cone.closePath();
    cone.fill({ color: 0xfffcf0, alpha: 0.15 });
    this.lightingContainer.addChild(cone);

    // Concentric soft spotlight pools centered on chair at (72, 328)
    const beam = new PIXI.Graphics();
    beam.circle(72, 328, 38);
    beam.fill({ color: 0xfffae6, alpha: 0.08 });
    beam.circle(72, 328, 28);
    beam.fill({ color: 0xfffae6, alpha: 0.14 });
    beam.circle(72, 328, 18);
    beam.fill({ color: 0xfffdf5, alpha: 0.22 });
    beam.circle(72, 328, 10);
    beam.fill({ color: 0xffffff, alpha: 0.35 });
    beam.circle(72, 328, 30);
    beam.stroke({ color: 0xffffff, alpha: 0.25, width: 1.5 });
    this.lightingContainer.addChild(beam);

    // 2. Room ambient tints
    const ambient = new PIXI.Graphics();
    // Office (warm daylight tint)
    ambient.rect(25 * 16, 1 * 16, 16 * 16, 10 * 16);
    ambient.fill({ color: 0x64b5f6, alpha: 0.03 });
    // Living room (cozy warm amber)
    ambient.rect(13 * 16, 1 * 16, 11 * 16, 10 * 16);
    ambient.fill({ color: 0xffb74d, alpha: 0.04 });
    // Bedroom (slate moonlight)
    ambient.rect(1 * 16, 1 * 16, 11 * 16, 10 * 16);
    ambient.fill({ color: 0x3f51b5, alpha: 0.06 });
    // Game room (mauve lounge)
    ambient.rect(24 * 16, 16 * 16, 11 * 16, 10 * 16);
    ambient.fill({ color: 0xba68c8, alpha: 0.04 });
    this.lightingContainer.addChild(ambient);
  }

  buildCctvOverlay(): void {
    const W = this.canvas.width / (window.devicePixelRatio || 1);
    const H = this.canvas.height / (window.devicePixelRatio || 1);

    this.cctvGraphics = new PIXI.Graphics();
    this.cctvContainer.addChild(this.cctvGraphics);

    // REC dot
    this.cctvRecDot = new PIXI.Graphics();
    this.cctvRecDot.circle(28, 24, 4);
    this.cctvRecDot.fill({ color: 0xff3b30 });
    this.cctvContainer.addChild(this.cctvRecDot);

    // Text elements
    const style = new PIXI.TextStyle({
      fontFamily: "ui-monospace, monospace",
      fontSize: 11,
      fill: "#e5e7eb",
      fontWeight: "bold",
      letterSpacing: 1,
    });

    this.cctvRecText = new PIXI.Text({ text: "REC", style });
    this.cctvRecText.position.set(38, 18);
    this.cctvContainer.addChild(this.cctvRecText);

    this.cctvCamText = new PIXI.Text({
      text: this.camera.activeCamLabel,
      style: new PIXI.TextStyle({ ...style, fill: "#38bdf8" }),
    });
    this.cctvCamText.position.set(90, 18);
    this.cctvContainer.addChild(this.cctvCamText);

    this.cctvTimeText = new PIXI.Text({
      text: "",
      style: new PIXI.TextStyle({ ...style, fill: "#9ca3af" }),
    });
    this.cctvTimeText.position.set(W - 220, 18);
    this.cctvContainer.addChild(this.cctvTimeText);

    this.updateCctvLayout(W, H);
  }

  updateCctvLayout(w: number, h: number): void {
    if (!this.cctvGraphics) return;

    this.cctvGraphics.clear();

    // 4 Corner brackets
    const arm = 18;
    const pad = 14;
    this.cctvGraphics.stroke({ color: 0xffffff, alpha: 0.65, width: 2 });

    // Top-left
    this.cctvGraphics.moveTo(pad, pad + arm).lineTo(pad, pad).lineTo(pad + arm, pad);
    // Top-right
    this.cctvGraphics.moveTo(w - pad - arm, pad).lineTo(w - pad, pad).lineTo(w - pad, pad + arm);
    // Bottom-left
    this.cctvGraphics.moveTo(pad, h - pad - arm).lineTo(pad, h - pad).lineTo(pad + arm, h - pad);
    // Bottom-right
    this.cctvGraphics.moveTo(w - pad - arm, h - pad).lineTo(w - pad, h - pad).lineTo(w - pad, h - pad - arm);

    // Subtle dark vignette along screen border
    this.cctvGraphics.rect(0, 0, w, 6);
    this.cctvGraphics.fill({ color: 0x000000, alpha: 0.4 });
    this.cctvGraphics.rect(0, h - 6, w, 6);
    this.cctvGraphics.fill({ color: 0x000000, alpha: 0.4 });

    if (this.cctvTimeText) {
      this.cctvTimeText.position.set(w - 200, 18);
    }
  }

  resize(): void {
    if (!this.app || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    this.app.renderer.resize(w, h);
    this.updateCctvLayout(w, h);
  }

  update(dt: number): void {
    // Smooth camera lerp
    const lerpSpeed = Math.min(1, dt * 8);
    this.camera.x += (this.camera.targetX - this.camera.x) * lerpSpeed;
    this.camera.y += (this.camera.targetY - this.camera.y) * lerpSpeed;
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * lerpSpeed;
  }

  render(chars: Map<string, CharacterRenderState>, now: number): void {
    if (!this.ready || !this.app) return;

    // 1. Apply camera transform to stageContainer
    const viewW = this.canvas.width / (window.devicePixelRatio || 1);
    const viewH = this.canvas.height / (window.devicePixelRatio || 1);
    const zoom = this.camera.zoom;

    this.stageContainer.scale.set(zoom, zoom);
    this.stageContainer.position.set(
      viewW / 2 - this.camera.x * zoom,
      viewH / 2 - this.camera.y * zoom
    );

    // 2. Synchronize character nodes
    const activeKeys = new Set<string>();

    for (const c of chars.values()) {
      activeKeys.add(c.key);
      let node = this.charNodes.get(c.key);

      if (!node) {
        // Create new character display node
        const container = new PIXI.Container();

        // Soft drop shadow
        const shadow = new PIXI.Graphics();
        shadow.ellipse(0, 0, 7, 3);
        shadow.fill({ color: 0x000000, alpha: 0.35 });
        container.addChild(shadow);

        // Body sprite
        const body = new PIXI.Sprite();
        body.anchor.set(0.5, 1.0); // Foot anchor
        container.addChild(body);

        // Emote sprite
        const emote = new PIXI.Sprite();
        emote.anchor.set(0.5, 1.0);
        emote.position.set(0, -32);
        emote.visible = false;
        container.addChild(emote);

        // Speech / Tool Bubble
        const bubble = new PIXI.Container();
        bubble.visible = false;
        bubble.position.set(0, -36);

        const bubbleBg = new PIXI.Graphics();
        bubble.addChild(bubbleBg);

        const bubbleText = new PIXI.Text({
          text: "",
          style: new PIXI.TextStyle({
            fontFamily: "ui-monospace, monospace",
            fontSize: 9,
            fill: "#1f2937",
            fontWeight: "bold",
          }),
        });
        bubbleText.anchor.set(0.5, 0.5);
        bubble.addChild(bubbleText);
        container.addChild(bubble);

        // Subagent tether line
        const tether = new PIXI.Graphics();
        this.ysortContainer.addChild(tether);

        node = { container, body, shadow, emote, bubble, bubbleText, bubbleBg, tether };
        this.charNodes.set(c.key, node);
        this.ysortContainer.addChild(container);
      }

      // Update position
      node.container.position.set(Math.round(c.x), Math.round(c.y));
      (node.container as any).footY = c.y;

      // Scale (mini-chibi for subagents)
      const scale = c.sub ? 0.68 : 1.0;

      // Resolve animation frame
      const { frameKey, flipX } = resolveCharacterFrame(
        c.harness,
        c.facing,
        c.action,
        c.instanceIndex,
        now
      );
      const tex = this.getTexture(frameKey);
      if (tex) {
        node.body.texture = tex;
        node.body.scale.set(flipX ? -scale : scale, scale);
      }

      // Update subagent tether
      if (c.sub && c.parentKey) {
        const parent = chars.get(c.parentKey);
        if (parent) {
          node.tether.clear();
          node.tether.stroke({ color: 0x38bdf8, alpha: 0.4, width: 1.5 });
          node.tether.moveTo(Math.round(c.x), Math.round(c.y - 12));
          node.tether.lineTo(Math.round(parent.x), Math.round(parent.y - 14));
          node.tether.visible = true;
        } else {
          node.tether.visible = false;
        }
      } else {
        node.tether.visible = false;
      }

      // Update emote
      const isEmoteActive = c.emote && (!c.emoteUntil || now < c.emoteUntil);
      if (isEmoteActive) {
        const emoteTex = this.getTexture(resolveEmoteFrame(c.emote!) || "");
        if (emoteTex) {
          node.emote.texture = emoteTex;
          node.emote.visible = true;
          // Gentle floating bounce
          node.emote.position.y = -34 - Math.sin(now / 180) * 3;
        } else {
          node.emote.visible = false;
        }
      } else {
        node.emote.visible = false;
      }

      // Update typing / tool bubble
      if (!c.sleeping && c.working && !isEmoteActive) {
        const txt = c.tool && now < c.bubbleUntil ? c.tool : "thinking...";
        node.bubbleText.text = txt;
        const bw = Math.max(28, node.bubbleText.width + 10);
        const bh = 14;

        node.bubbleBg.clear();
        node.bubbleBg.roundRect(-bw / 2, -bh / 2, bw, bh, 3);
        node.bubbleBg.fill({ color: 0xffffff, alpha: 0.95 });
        node.bubbleBg.stroke({ color: 0x38bdf8, width: 1 });
        // Tail
        node.bubbleBg.moveTo(-2, bh / 2);
        node.bubbleBg.lineTo(2, bh / 2);
        node.bubbleBg.lineTo(0, bh / 2 + 3);
        node.bubbleBg.fill({ color: 0xffffff });

        node.bubble.visible = true;
        node.bubble.position.y = -36 - Math.sin(now / 220) * 2;
      } else if (c.blocked && !isEmoteActive) {
        node.bubbleText.text = "!";
        node.bubbleBg.clear();
        node.bubbleBg.roundRect(-8, -8, 16, 16, 8);
        node.bubbleBg.fill({ color: 0xef4444 });
        node.bubbleText.style.fill = "#ffffff";
        node.bubble.visible = true;
      } else {
        node.bubble.visible = false;
      }
    }

    // Clean up removed characters
    for (const [key, node] of this.charNodes.entries()) {
      if (!activeKeys.has(key)) {
        this.ysortContainer.removeChild(node.container);
        this.ysortContainer.removeChild(node.tether);
        this.charNodes.delete(key);
      }
    }

    // 3. Y-Sort all entities in ysortContainer
    this.ysortContainer.children.sort((a: any, b: any) => {
      const ya = a.footY ?? a.position?.y ?? 0;
      const yb = b.footY ?? b.position?.y ?? 0;
      return ya - yb;
    });

    // 4. Update CCTV HUD
    if (this.cctvRecDot) {
      // Blink REC dot every 1s (500ms on, 500ms off)
      this.cctvRecDot.visible = now % 1000 < 600;
    }
    if (this.cctvCamText) {
      this.cctvCamText.text = this.camera.activeCamLabel;
    }
    if (this.cctvTimeText) {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      this.cctvTimeText.text = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  }
}
