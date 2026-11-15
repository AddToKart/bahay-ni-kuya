// Standalone script to render the complete pixel house scene into a high-res PNG screenshot
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsePx,
  type Palette,
  type SpriteDef,
  renderFrame,
} from "../assets/third-party/oddboro/src/px.ts";
import {
  createImage,
  drawImage,
  blendPixel,
  encodePng,
  scaleImage,
  type Image,
} from "../assets/third-party/oddboro/src/png.ts";
import { tiledMap } from "./generate-map.ts";

const ODDBORO_SRC = join(process.cwd(), "assets", "third-party", "oddboro", "src");
const HOUSE_SRC = join(process.cwd(), "assets", "house");
const OUT_PATH = join(process.cwd(), "docs", "screenshots", "after.png");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith(".px") ? [p] : [];
  });
}

function loadCombinedPalette(): Palette {
  const base = JSON.parse(readFileSync(join(ODDBORO_SRC, "palette.json"), "utf8")) as Palette;
  const dir = join(ODDBORO_SRC, "palettes");
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const ext = JSON.parse(readFileSync(join(dir, file), "utf8")) as Palette;
      for (const [key, color] of Object.entries(ext.colors)) {
        base.colors[key] = color;
      }
    }
  }
  return base;
}

export function renderFullScene(): void {
  const palette = loadCombinedPalette();
  const sprites = new Map<string, SpriteDef>();
  const files = [...walk(ODDBORO_SRC), ...walk(HOUSE_SRC)].sort();

  for (const file of files) {
    try {
      const text = readFileSync(file, "utf8");
      const def = parsePx(text, file, palette);
      sprites.set(def.name, def);
    } catch (err) {
      console.warn(`Error loading sprite ${file}:`, err);
    }
  }

  const W = 42 * 16; // 672
  const H = 27 * 16; // 432
  const scene = createImage(W, H);

  // Fill background dark
  for (let i = 0; i < W * H; i++) {
    scene.data[i * 4] = 12;
    scene.data[i * 4 + 1] = 14;
    scene.data[i * 4 + 2] = 20;
    scene.data[i * 4 + 3] = 255;
  }

  const getFrameImg = (spriteName: string, frameName = "default", variant?: string): Image | null => {
    const def = sprites.get(spriteName);
    if (!def) return null;
    try {
      return renderFrame(def, frameName, palette, variant);
    } catch {
      try {
        return renderFrame(def, "0", palette, variant);
      } catch {
        return null;
      }
    }
  };

  // 1. Draw Floors
  const floorData = tiledMap.layers.find((l) => l.name === "floor")!.data;
  for (let ty = 0; ty < 27; ty++) {
    for (let tx = 0; tx < 42; tx++) {
      const gid = floorData[ty * 42 + tx];
      if (gid === 0) continue;

      let sprName = "floor-oak";
      let frameName = "0";

      switch (gid) {
        case 1: // Bedroom
          sprName = "floor-oak";
          frameName = String((tx + ty) % 3);
          break;
        case 2: // Living Room
          sprName = "floor-carpet";
          frameName = String((tx + ty) % 3);
          break;
        case 3: // Office
          sprName = "floor-oak";
          frameName = String((tx + ty) % 4);
          break;
        case 4: // Kitchen
          sprName = "floor-tile";
          frameName = String((tx + ty) % 4);
          break;
        case 5: // Game Room
          sprName = "floor-carpet";
          frameName = "1";
          break;
        case 6: // Confession
          sprName = "floor-asphalt";
          frameName = "0";
          break;
        case 7: // Hallway black
        case 8: // Hallway cream
          sprName = "floor-checkered";
          frameName = String((tx + ty) % 2);
          break;
        case 9: // Gym
          sprName = tx >= 38 ? "floor-rubber" : "floor-grass";
          frameName = "0";
          break;
      }

      const f = getFrameImg(sprName, frameName);
      if (f) drawImage(scene, f, tx * 16, ty * 16);
    }
  }

  // Floor rugs
  for (const p of tiledMap.props) {
    if (p.layer === "floor") {
      const f = getFrameImg(p.sprite, p.frame || "default", p.variant);
      if (f) drawImage(scene, f, p.x * 16, p.y * 16);
    }
  }

  // 2. Draw Walls
  const wallData = tiledMap.layers.find((l) => l.name === "walls")!.data;
  const isWall = (x: number, y: number) => {
    if (x < 0 || x >= 42 || y < 0 || y >= 27) return true;
    return wallData[y * 42 + x] > 0;
  };

  // Wall caps
  for (let ty = 0; ty < 27; ty++) {
    for (let tx = 0; tx < 42; tx++) {
      if (wallData[ty * 42 + tx] === 0) continue;
      const north = isWall(tx, ty - 1) ? 1 : 0;
      const east = isWall(tx + 1, ty) ? 2 : 0;
      const south = isWall(tx, ty + 1) ? 4 : 0;
      const west = isWall(tx - 1, ty) ? 8 : 0;
      const mask = north | east | south | west;

      const f = getFrameImg("wall-plaster-cap", `m${mask}`);
      if (f) drawImage(scene, f, tx * 16, ty * 16);
    }
  }

  // North wall faces & windows
  const windowCols = new Set([3, 4, 8, 9, 14, 15, 21, 22, 27, 28, 33, 34, 38, 39]);
  for (let tx = 1; tx <= 40; tx++) {
    if (tx === 12 || tx === 24) continue;
    const isWin = windowCols.has(tx);
    const spr = isWin ? "wall-plaster-window" : "wall-plaster-face";
    const frame = isWin ? "0" : String(tx % 3);
    const f = getFrameImg(spr, frame);
    if (f) drawImage(scene, f, tx * 16, 16);
  }

  // Wall mounted props
  for (const p of tiledMap.props) {
    if (p.layer === "wall") {
      const f = getFrameImg(p.sprite, p.frame || "default", p.variant);
      if (f) drawImage(scene, f, p.x * 16, p.y * 16, p.flip);
    }
  }

  // 3. Y-Sortable Objects: Furniture & Housemate Characters
  interface YItem {
    footY: number;
    draw: () => void;
  }
  const yItems: YItem[] = [];

  // Furniture props
  for (const p of tiledMap.props) {
    if (p.layer === "floor" || p.layer === "wall") continue;
    const f = getFrameImg(p.sprite, p.frame || "default", p.variant);
    if (!f) continue;
    const footY = p.y * 16 + f.height;
    yItems.push({
      footY,
      draw: () => {
        drawImage(scene, f, p.x * 16, p.y * 16, p.flip);
      },
    });
  }

  // Characters in action!
  // opencode at desk 1 (Office)
  const fOpencode = getFrameImg("staff", "sit-down-0", "opencode");
  if (fOpencode) {
    yItems.push({
      footY: 4 * 16 + 14,
      draw: () => drawImage(scene, fOpencode, 26 * 16 + 1, 3 * 16 - 2),
    });
  }

  // codex at desk 2 (Office)
  const fCodex = getFrameImg("staff", "sit-down-1", "codex");
  if (fCodex) {
    yItems.push({
      footY: 4 * 16 + 14,
      draw: () => drawImage(scene, fCodex, 29 * 16 + 1, 3 * 16 - 2),
    });
  }

  // subagent at subagent desk
  const fSubagent = getFrameImg("staff", "sit-down-0", "ash");
  if (fSubagent) {
    yItems.push({
      footY: 10 * 16 + 14,
      draw: () => drawImage(scene, fSubagent, 26 * 16 + 2, 9 * 16),
    });
  }

  // pi in Kitchen (making snack)
  const fPi = getFrameImg("staff", "eat-down-1", "pi");
  if (fPi) {
    yItems.push({
      footY: 19 * 16 + 14,
      draw: () => drawImage(scene, fPi, 14 * 16, 18 * 16),
    });
  }

  // omp in Game Room (playing billiards)
  const fOmp = getFrameImg("staff", "play-up-2", "omp");
  if (fOmp) {
    yItems.push({
      footY: 20 * 16 + 14,
      draw: () => drawImage(scene, fOmp, 26 * 16, 19 * 16),
    });
  }

  // hermes in Living Room (sitting & reading)
  const fHermes = getFrameImg("staff", "read-down-1", "hermes");
  if (fHermes) {
    yItems.push({
      footY: 7 * 16 + 14,
      draw: () => drawImage(scene, fHermes, 13 * 16, 6 * 16),
    });
  }

  // Sort and draw all props & characters
  yItems.sort((a, b) => a.footY - b.footY);
  for (const item of yItems) item.draw();

  // 4. Confession Room Spotlight
  // Dark overlay over confession room (x: 16..144, y: 256..416)
  for (let py = 16 * 16; py < 26 * 16; py++) {
    for (let px = 1 * 16; px < 9 * 16; px++) {
      const dx = px - 72;
      const dy = py - 328;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 32) {
        // Spotlight cone beam
        blendPixel(scene, px, py, [255, 250, 230, Math.round((1 - dist / 32) * 55)]);
      } else {
        // Dramatic room darkness
        blendPixel(scene, px, py, [6, 7, 10, 180]);
      }
    }
  }

  // 5. Emotes
  const fThumb = getFrameImg("emotes", "thumbs-up");
  if (fThumb) drawImage(scene, fThumb, 26 * 16 + 1, 3 * 16 - 22);

  // 6. CCTV HUD Overlay
  // Brackets
  const strokeLine = (x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        blendPixel(scene, x, y, [255, 255, 255, 200]);
      }
    }
  };
  // Top-left
  strokeLine(10, 10, 26, 10);
  strokeLine(10, 10, 10, 26);
  // Top-right
  strokeLine(W - 26, 10, W - 10, 10);
  strokeLine(W - 10, 10, W - 10, 26);
  // Bottom-left
  strokeLine(10, H - 10, 26, H - 10);
  strokeLine(10, H - 26, 10, H - 10);
  // Bottom-right
  strokeLine(W - 26, H - 10, W - 10, H - 10);
  strokeLine(W - 10, H - 26, W - 10, H - 10);

  // Red REC dot
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy <= 9) {
        blendPixel(scene, 24 + dx, 18 + dy, [239, 68, 68, 255]);
      }
    }
  }

  // 7. Scale up 2x for crisp pixel sharpness
  const scaled = scaleImage(scene, 2);
  const pngBuf = encodePng(scaled);
  mkdirSync(join(process.cwd(), "docs", "screenshots"), { recursive: true });
  writeFileSync(OUT_PATH, pngBuf);
  console.log(`Rendered high-res after screenshot to ${OUT_PATH} (${scaled.width}x${scaled.height})`);
}

if (import.meta.main) {
  renderFullScene();
}
