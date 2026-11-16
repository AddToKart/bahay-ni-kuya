// Render the Phase 2 sprite drafts into a review sheet (D2 approval gate).
// Reads assets/house/prop-*.px directly; does NOT touch the shipped atlas.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parsePx, renderFrame, type Palette } from "../assets/third-party/oddboro/src/px.ts";
import { createImage, drawImage, encodePng, scaleImage, type Image } from "../assets/third-party/oddboro/src/png.ts";

const SPRITES = [
  "prop-bag",
  "prop-suitcase",
  "prop-folder",
  "prop-lanyard-badge",
  "prop-onair-sign",
];
const SCALE = 6;
const GAP = 12;
const MARGIN = 12;

function loadPalette(): Palette {
  const src = join(process.cwd(), "assets", "third-party", "oddboro", "src");
  return JSON.parse(readFileSync(join(src, "palette.json"), "utf8")) as Palette;
}

function fillBackground(img: Image, hex: string): void {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  }
}

function main(): void {
  const palette = loadPalette();
  const cell = 16 * SCALE;
  const width = MARGIN * 2 + SPRITES.length * cell + (SPRITES.length - 1) * GAP;
  const height = MARGIN * 2 + cell;
  const sheet = createImage(width, height);
  fillBackground(sheet, "#12141c");

  SPRITES.forEach((name, index) => {
    const file = join(process.cwd(), "assets", "house", `${name}.px`);
    const def = parsePx(readFileSync(file, "utf8"), file, palette);
    const frame = def.frames.find((f) => f.name === "default") ?? def.frames[0];
    if (!frame) throw new Error(`${name}: no frames`);
    const img = renderFrame(def, frame, palette);
    const scaled = scaleImage(img, SCALE);
    drawImage(sheet, scaled, MARGIN + index * (cell + GAP), MARGIN);
  });

  const outDir = join(process.cwd(), "docs", "screenshots", "phase-2");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "sprite-sheet-draft.png");
  writeFileSync(out, encodePng(sheet));
  console.log(`wrote ${out} (${width}x${height})`);
  console.log(`order: ${SPRITES.join(", ")}`);
}

if (import.meta.main) main();
