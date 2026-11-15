// 3/4 top-down Canvas 2D pixel renderer for Bahay ni Kuya.
// 16px tiles rendered at integer scale (3x) with y-sorting, room lighting, soft vignette, and CCTV overlay.

import type { HouseMap, RoomId } from "./map.js";
import { MONO, PALETTE } from "./sprites.js";

export interface Camera {
  x: number; // scene center x in world pixels
  y: number; // scene center y in world pixels
  zoom: number; // target zoom (1x, 2x, 3x)
  targetX: number;
  targetY: number;
  targetZoom: number;
  activeCamLabel: string;
}

export interface YSortable {
  y: number; // world y for depth sorting
  draw(ctx: CanvasRenderingContext2D, dpr: number): void;
}

// Procedural 16x16 pixel tile drawing routines (crisp, zero paid assets)
export function drawTile(
  ctx: CanvasRenderingContext2D,
  gid: number,
  tx: number, // tile x
  ty: number, // tile y
  px: number, // pixel x
  py: number, // pixel y
  size = 16,
): void {
  switch (gid) {
    // ---------------- FLOORS ----------------
    case 1: // Bedroom: Cool night slate wood planks
      ctx.fillStyle = "#8ba1b8";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#778d9f";
      ctx.fillRect(px, py + size - 1, size, 1);
      if (tx % 2 === 0) ctx.fillRect(px + size / 2, py, 1, size - 1);
      break;

    case 2: // Living Room: Warm golden wood floor
      ctx.fillStyle = "#b48455";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#9a6a3e";
      ctx.fillRect(px, py + size - 1, size, 1);
      if ((tx + ty) % 2 === 0) ctx.fillRect(px + size / 2, py, 1, size - 1);
      break;

    case 3: // Office: Parquet sage wood
      ctx.fillStyle = "#967554";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#836243";
      ctx.fillRect(px, py + size - 1, size, 1);
      if (ty % 2 === 0) ctx.fillRect(px + size / 2, py, 1, size - 1);
      break;

    case 4: // Kitchen: Cream/gray clean ceramic tiles
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#dedad1" : "#cfcac0";
      ctx.fillRect(px, py, size, size);
      ctx.strokeStyle = "rgba(43, 33, 25, 0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      break;

    case 5: // Game Room: Cozy pink/mauve felt floor
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#a66882" : "#985c76";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "rgba(43, 33, 25, 0.1)";
      ctx.fillRect(px, py + size - 1, size, 1);
      break;

    case 6: // Confession Room: Dark obsidian floor
      ctx.fillStyle = "#1b1d24";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#13151b";
      ctx.fillRect(px, py + size - 1, size, 1);
      break;

    case 7: // Hallway: Checkered black
      ctx.fillStyle = "#2c2d33";
      ctx.fillRect(px, py, size, size);
      break;

    case 8: // Hallway: Checkered white/cream
      ctx.fillStyle = "#e0dcce";
      ctx.fillRect(px, py, size, size);
      break;

    case 9: // Gym/Garden: Rubber/turf green
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#5a825e" : "#507554";
      ctx.fillRect(px, py, size, size);
      break;

    // ---------------- WALLS ----------------
    case 11: // Wall Top: Navy face with darker top trim
      ctx.fillStyle = "#1b212f"; // Dark navy wall
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#10141d"; // Wall top edge
      ctx.fillRect(px, py, size, 4);
      ctx.fillStyle = "#2b3447"; // Highlight line
      ctx.fillRect(px, py + 4, size, 1);
      break;

    case 12: // Wall Side: Navy vertical column
      ctx.fillStyle = "#161b27";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#0e111a";
      ctx.fillRect(px, py, 3, size);
      break;

    // ---------------- DOORS ----------------
    case 21: // Doorway opening: checkered floor with doorframe posts
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#2c2d33" : "#e0dcce";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#10141d";
      ctx.fillRect(px, py, 2, size);
      ctx.fillRect(px + size - 2, py, 2, size);
      break;

    default:
      break;
  }
}

// Procedural furniture drawings
export function drawFurniture(
  ctx: CanvasRenderingContext2D,
  gid: number,
  px: number,
  py: number,
  size = 16,
): void {
  switch (gid) {
    case 31: // Bunk Bed Top (headboard + pillows)
      ctx.fillStyle = "#5c3d26"; // Wood frame
      ctx.fillRect(px + 1, py + 1, size - 2, size - 1);
      ctx.fillStyle = "#ffffff"; // White sheet
      ctx.fillRect(px + 3, py + 5, size - 6, size - 5);
      ctx.fillStyle = "#c5d7e8"; // Blue pillow
      ctx.fillRect(px + 4, py + 2, size - 8, 4);
      break;

    case 32: // Bunk Bed Bottom (footboard + blanket)
      ctx.fillStyle = "#5c3d26";
      ctx.fillRect(px + 1, py, size - 2, size - 2);
      ctx.fillStyle = "#3a5f82"; // Navy bedspread
      ctx.fillRect(px + 3, py, size - 6, size - 4);
      break;

    case 33: // Nightstand
      ctx.fillStyle = "#694931";
      ctx.fillRect(px + 3, py + 3, size - 6, size - 5);
      ctx.fillStyle = "#f5d76e"; // Little lamp
      ctx.fillRect(px + 6, py + 1, 4, 3);
      break;

    case 34: // Sofa Left Arm
    case 35: // Sofa Mid
    case 36: // Sofa Right Arm
      ctx.fillStyle = "#4a6b82"; // Muted blue sofa
      ctx.fillRect(px + 1, py + 3, size - 2, size - 4);
      ctx.fillStyle = "#375062"; // Cushion seam
      ctx.fillRect(px + 1, py + 3, size - 2, 4);
      if (gid === 34) {
        ctx.fillStyle = "#2c4150";
        ctx.fillRect(px + 1, py + 2, 4, size - 3);
      }
      if (gid === 36) {
        ctx.fillStyle = "#2c4150";
        ctx.fillRect(px + size - 5, py + 2, 4, size - 3);
      }
      break;

    case 38: // TV Console
      ctx.fillStyle = "#2b2119"; // Stand
      ctx.fillRect(px + 1, py + 8, size - 2, size - 8);
      ctx.fillStyle = "#151821"; // TV Screen
      ctx.fillRect(px + 2, py + 1, size - 4, 8);
      ctx.fillStyle = "#4fc3f7"; // Faint scanline glow
      ctx.fillRect(px + 4, py + 3, size - 8, 4);
      break;

    case 41: // Office Desk with CRT Monitor
      ctx.fillStyle = "#6b543e"; // Desk wood
      ctx.fillRect(px + 1, py + 4, size - 2, size - 5);
      ctx.fillStyle = "#23272f"; // Monitor chassis
      ctx.fillRect(px + 3, py + 1, size - 6, 7);
      ctx.fillStyle = "#f0a33a"; // Amber phosphor screen
      ctx.fillRect(px + 5, py + 2, size - 10, 4);
      break;

    case 43: // Subagent Desk (compact terminal)
      ctx.fillStyle = "#574432";
      ctx.fillRect(px + 2, py + 5, size - 4, size - 6);
      ctx.fillStyle = "#23272f";
      ctx.fillRect(px + 4, py + 2, 8, 5);
      ctx.fillStyle = "#7fb069"; // Green phosphor screen
      ctx.fillRect(px + 5, py + 3, 6, 3);
      break;

    case 44: // Kitchen Fridge
      ctx.fillStyle = "#b0bec5"; // Stainless steel
      ctx.fillRect(px + 2, py + 1, size - 4, size - 2);
      ctx.fillStyle = "#78909c"; // Handle & seam
      ctx.fillRect(px + 2, py + 7, size - 4, 1);
      ctx.fillRect(px + size - 5, py + 3, 1, 3);
      ctx.fillRect(px + size - 5, py + 9, 1, 4);
      break;

    case 45: // Kitchen Stove
      ctx.fillStyle = "#37474f";
      ctx.fillRect(px + 2, py + 2, size - 4, size - 3);
      ctx.fillStyle = "#cfd8dc"; // Burners
      ctx.fillRect(px + 4, py + 4, 3, 3);
      ctx.fillRect(px + 9, py + 4, 3, 3);
      break;

    case 46: // Kitchen Sink
      ctx.fillStyle = "#cfd8dc";
      ctx.fillRect(px + 2, py + 3, size - 4, size - 4);
      ctx.fillStyle = "#90a4ae"; // Basin
      ctx.fillRect(px + 4, py + 5, size - 8, 6);
      ctx.fillStyle = "#607d8b"; // Tap
      ctx.fillRect(px + 7, py + 2, 2, 3);
      break;

    case 48: // Dining Table
      ctx.fillStyle = "#8d6e63";
      ctx.fillRect(px + 1, py + 2, size - 2, size - 3);
      break;

    case 50: // Pool Table
      ctx.fillStyle = "#5c3d26"; // Wood bumper
      ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
      ctx.fillStyle = "#2e7d32"; // Green baize felt
      ctx.fillRect(px + 3, py + 3, size - 6, size - 6);
      ctx.fillStyle = "#ffffff"; // Cue ball
      ctx.fillRect(px + 6, py + 6, 2, 2);
      break;

    case 51: // Arcade 1 (Street Fighter vibe)
      ctx.fillStyle = "#d32f2f"; // Red cab
      ctx.fillRect(px + 2, py + 1, size - 4, size - 2);
      ctx.fillStyle = "#ffee58"; // Glowing marquee
      ctx.fillRect(px + 4, py + 2, size - 8, 3);
      ctx.fillStyle = "#1e88e5"; // Screen
      ctx.fillRect(px + 4, py + 6, size - 8, 5);
      break;

    case 52: // Arcade 2 (Pacman/Galaga vibe)
      ctx.fillStyle = "#7b1fa2"; // Purple cab
      ctx.fillRect(px + 2, py + 1, size - 4, size - 2);
      ctx.fillStyle = "#00e676"; // Marquee
      ctx.fillRect(px + 4, py + 2, size - 8, 3);
      ctx.fillStyle = "#ffeb3b"; // Screen
      ctx.fillRect(px + 4, py + 6, size - 8, 5);
      break;

    case 53: // Treadmill
      ctx.fillStyle = "#455a64"; // Frame
      ctx.fillRect(px + 2, py + 4, size - 4, size - 5);
      ctx.fillStyle = "#263238"; // Belt
      ctx.fillRect(px + 4, py + 5, size - 8, size - 6);
      ctx.fillStyle = "#00e676"; // Console display
      ctx.fillRect(px + 5, py + 2, 6, 3);
      break;

    case 54: // Indoor Plant
      ctx.fillStyle = "#b76d49"; // Terracotta pot
      ctx.fillRect(px + 4, py + 9, size - 8, 6);
      ctx.fillStyle = "#43a047"; // Lush foliage
      ctx.beginPath();
      ctx.arc(px + 8, py + 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2e7d32";
      ctx.beginPath();
      ctx.arc(px + 9, py + 5, 4, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 56: // Confession Chair
      ctx.fillStyle = "#5d4037"; // Dark mahogany chair
      ctx.fillRect(px + 3, py + 3, size - 6, size - 4);
      ctx.fillStyle = "#3e2723"; // High backrest
      ctx.fillRect(px + 4, py + 1, size - 8, 4);
      break;

    default:
      break;
  }
}

// ---------------- CCTV OVERLAY & VIGNETTE ----------------

export function drawCCTVFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camLabel = "CAM ALL - BAHAY NI KUYA",
  now = Date.now(),
): void {
  // 1. Soft atmospheric vignette
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(10, 12, 18, 0.45)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // 2. CCTV Corner Brackets (crisp 2px)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 2;
  const bl = 18; // bracket length
  const p = 14;  // padding

  // Top-left
  ctx.beginPath();
  ctx.moveTo(p, p + bl);
  ctx.lineTo(p, p);
  ctx.lineTo(p + bl, p);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(w - p - bl, p);
  ctx.lineTo(w - p, p);
  ctx.lineTo(w - p, p + bl);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(p, h - p - bl);
  ctx.lineTo(p, h - p);
  ctx.lineTo(p + bl, h - p);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(w - p - bl, h - p);
  ctx.lineTo(w - p, h - p);
  ctx.lineTo(w - p, h - p - bl);
  ctx.stroke();

  // 3. REC dot (blinking every second)
  const isRecOn = Math.floor(now / 700) % 2 === 0;
  if (isRecOn) {
    ctx.fillStyle = "#ff2a2a";
    ctx.beginPath();
    ctx.arc(p + 12, p + 10, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Header text: REC + live timestamp + Camera Label
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("REC", p + 22, p + 10);

  const dateStr = new Date(now).toISOString().replace("T", " ").slice(0, 19);
  ctx.fillText(dateStr, p + 65, p + 10);

  // Camera Label at top-right
  ctx.textAlign = "right";
  ctx.fillText(camLabel, w - p - 10, p + 10);
}

// ---------------- FULL SCENE RENDERER ----------------

export class MapRenderer {
  map: HouseMap;
  camera: Camera;

  constructor(map: HouseMap) {
    this.map = map;
    this.camera = {
      x: (map.width * map.tilewidth) / 2,
      y: (map.height * map.tileheight) / 2,
      zoom: 1,
      targetX: (map.width * map.tilewidth) / 2,
      targetY: (map.height * map.tileheight) / 2,
      targetZoom: 1,
      activeCamLabel: "CAM ALL - BAHAY NI KUYA",
    };
  }

  update(dt: number): void {
    // Smooth camera lerp
    const factor = Math.min(1, dt * 6);
    this.camera.x += (this.camera.targetX - this.camera.x) * factor;
    this.camera.y += (this.camera.targetY - this.camera.y) * factor;
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * factor;
  }

  render(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    entities: YSortable[],
    dpr = 1,
    now = Date.now(),
  ): void {
    ctx.save();

    // Clear background
    ctx.fillStyle = PALETTE.page;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Apply Camera transform: center on camera.x, camera.y and scale
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

    const tw = this.map.tilewidth;
    const th = this.map.tileheight;

    // 1. Draw Floor Layer
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const gid = this.map.floor[y * this.map.width + x];
        if (gid > 0) drawTile(ctx, gid, x, y, x * tw, y * th, tw);
      }
    }

    // 2. Draw Doors Layer
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const gid = this.map.doors[y * this.map.width + x];
        if (gid > 0) drawTile(ctx, gid, x, y, x * tw, y * th, tw);
      }
    }

    // 3. Draw Room Lighting Tints (Atmosphere)
    for (const r of Object.values(this.map.rooms)) {
      ctx.fillStyle = r.tint;
      ctx.fillRect(r.x * tw, r.y * th, r.w * tw, r.h * th);
    }

    // Confession Room Spotlight effect with subtle breathing pulse
    const spotPulse = 0.95 + 0.05 * Math.sin(now * 0.003);
    const spotX = 4 * tw + tw / 2;
    const spotY = 20 * th + th / 2;
    const spotGrad = ctx.createRadialGradient(spotX, spotY, 2, spotX, spotY, 32 * spotPulse);
    spotGrad.addColorStop(0, "rgba(255, 248, 220, 0.55)");
    spotGrad.addColorStop(0.4, "rgba(255, 248, 220, 0.25)");
    spotGrad.addColorStop(0.8, "rgba(255, 248, 220, 0.08)");
    spotGrad.addColorStop(1, "rgba(255, 248, 220, 0)");
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.arc(spotX, spotY, 36 * spotPulse, 0, Math.PI * 2);
    ctx.fill();

    // 4. Draw Walls Layer
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const gid = this.map.walls[y * this.map.width + x];
        if (gid > 0) drawTile(ctx, gid, x, y, x * tw, y * th, tw);
      }
    }

    // 5. Y-Sorted Draw List: Furniture + Characters/Entities
    // Convert furniture items into YSortable drawables
    const drawables: YSortable[] = [...entities];

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const gid = this.map.furniture[y * this.map.width + x];
        if (gid > 0) {
          const footY = (y + 1) * th;
          drawables.push({
            y: footY,
            draw: (c) => drawFurniture(c, gid, x * tw, y * th, tw),
          });
        }
      }
    }

    // Sort all drawables strictly by their base y-coordinate!
    drawables.sort((a, b) => a.y - b.y);

    // Draw all depth-sorted items
    for (const d of drawables) {
      d.draw(ctx, dpr);
    }

    // --- 5.5 Atmospheric Dynamic Lighting Pass ---
    // Soft phosphor glows, CRT television flicker, bedroom lamps, and arcade marquees
    ctx.save();

    // Office Monitor Glows (amber primary CRT, green subagent terminal)
    for (let y = 1; y < 11; y++) {
      for (let x = 23; x < 39; x++) {
        const gid = this.map.furniture[y * this.map.width + x];
        if (gid === 41 || gid === 43) {
          const glowColor = gid === 41 ? "rgba(240, 163, 58, 0.14)" : "rgba(127, 176, 105, 0.14)";
          const gx = x * tw + tw / 2;
          const gy = y * th + 5;
          const grad = ctx.createRadialGradient(gx, gy, 1, gx, gy, 15);
          grad.addColorStop(0, glowColor);
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(gx, gy, 15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Living Room CRT TV Glow & Ambient Scanline Pulse
    const tvFlicker = 0.85 + 0.15 * Math.sin(now * 0.007) * Math.cos(now * 0.011);
    const tvGrad = ctx.createRadialGradient(19 * tw + 8, 3 * th + 6, 2, 19 * tw + 8, 3 * th + 6, 28);
    tvGrad.addColorStop(0, `rgba(79, 195, 247, ${0.24 * tvFlicker})`);
    tvGrad.addColorStop(0.5, `rgba(79, 195, 247, ${0.08 * tvFlicker})`);
    tvGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = tvGrad;
    ctx.beginPath();
    ctx.arc(19 * tw + 8, 3 * th + 6, 28, 0, Math.PI * 2);
    ctx.fill();

    // Bedroom Nightstand warm amber lamps
    const bedGrad1 = ctx.createRadialGradient(2 * tw + 8, 4 * th + 4, 1, 2 * tw + 8, 4 * th + 4, 18);
    bedGrad1.addColorStop(0, "rgba(245, 215, 110, 0.22)");
    bedGrad1.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bedGrad1;
    ctx.beginPath();
    ctx.arc(2 * tw + 8, 4 * th + 4, 18, 0, Math.PI * 2);
    ctx.fill();

    const bedGrad2 = ctx.createRadialGradient(2 * tw + 8, 8 * th + 4, 1, 2 * tw + 8, 8 * th + 4, 18);
    bedGrad2.addColorStop(0, "rgba(245, 215, 110, 0.22)");
    bedGrad2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bedGrad2;
    ctx.beginPath();
    ctx.arc(2 * tw + 8, 8 * th + 4, 18, 0, Math.PI * 2);
    ctx.fill();

    // Arcade Marquee Neon Glows (x: 24, y: 22 and x: 26, y: 22)
    const arcGrad1 = ctx.createRadialGradient(24 * tw + 8, 22 * th + 4, 1, 24 * tw + 8, 22 * th + 4, 16);
    arcGrad1.addColorStop(0, "rgba(255, 238, 88, 0.25)");
    arcGrad1.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = arcGrad1;
    ctx.beginPath();
    ctx.arc(24 * tw + 8, 22 * th + 4, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.restore();

    // 6. Draw CCTV Frame & Vignette in screen space
    drawCCTVFrame(ctx, canvasW, canvasH, this.camera.activeCamLabel, now);
  }
}
