// Script to compile Oddboro third-party sprites + Bahay ni Kuya original house sprites into a PixiJS Spritesheet Atlas
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parsePx,
  type Palette,
  type SpriteDef,
  hasEmissive,
  offPalette,
  renderFrame,
  spriteMeta,
} from "../assets/third-party/oddboro/src/px.ts";
import {
  createImage,
  drawImage,
  encodePng,
  extrude,
  type Image,
} from "../assets/third-party/oddboro/src/png.ts";

const ODDBORO_SRC = join(process.cwd(), "assets", "third-party", "oddboro", "src");
const HOUSE_SRC = join(process.cwd(), "assets", "house");
const OUT_DIR = join(process.cwd(), "public", "atlas");

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

export function compileAtlas(): void {
  const palette = loadCombinedPalette();
  const sprites = new Map<string, SpriteDef>();
  const errors: string[] = [];

  const files = [...walk(ODDBORO_SRC), ...walk(HOUSE_SRC)].sort();

  for (const file of files) {
    try {
      const text = readFileSync(file, "utf8");
      const def = parsePx(text, file, palette);
      sprites.set(def.name, def);
    } catch (err) {
      errors.push(`${file}: ${String(err)}`);
    }
  }

  if (errors.length > 0) {
    console.error(`Atlas compilation failed with ${errors.length} error(s):\n` + errors.join("\n"));
    process.exit(1);
  }

  type Cell = { key: string; img: Image; sprite: SpriteDef; frame: string; variant?: string };
  const unlit = offPalette(palette);
  const cells: Cell[] = [];

  for (const def of sprites.values()) {
    const variants = [undefined, ...def.variants];
    const glow = hasEmissive(def, palette);
    const hasOffFrame = def.frames.some((f) => f.name === "off");

    for (const v of variants) {
      for (const f of def.frames) {
        const key = v ? `${def.name}@${v.name}/${f.name}` : `${def.name}/${f.name}`;
        cells.push({
          key,
          img: renderFrame(def, f, palette, v?.map),
          sprite: def,
          frame: f.name,
          variant: v?.name,
        });

        if (glow) {
          cells.push({
            key: `${key}~e`,
            img: renderFrame(def, f, palette, v?.map, true),
            sprite: def,
            frame: `${f.name}~e`,
            variant: v?.name,
          });
        }

        if (glow && !hasOffFrame) {
          cells.push({
            key: `${key}~off`,
            img: renderFrame(def, f, unlit, v?.map),
            sprite: def,
            frame: `${f.name}~off`,
            variant: v?.name,
          });
        }
      }
    }
  }

  // Shelf packing with 2px gutters
  const PAD = 2;
  const area = cells.reduce((n, c) => n + (c.img.width + PAD) * (c.img.height + PAD), 0);
  let atlasW = 256;
  while (atlasW * atlasW < area * 1.3) atlasW *= 2;
  const sorted = [...cells].sort((a, b) => b.img.height - a.img.height);
  const placed = new Map<string, { x: number; y: number }>();
  let x = PAD;
  let y = PAD;
  let shelf = 0;

  for (const c of sorted) {
    if (x + c.img.width + PAD > atlasW) {
      x = PAD;
      y += shelf + PAD;
      shelf = 0;
    }
    placed.set(c.key, { x, y });
    x += c.img.width + PAD;
    shelf = Math.max(shelf, c.img.height);
  }

  const atlasH = y + shelf + PAD;
  const atlas = createImage(atlasW, atlasH);

  for (const c of cells) {
    const p = placed.get(c.key)!;
    drawImage(atlas, c.img, p.x, p.y);
    extrude(atlas, p.x, p.y, c.img.width, c.img.height);
  }

  const frames: Record<string, unknown> = {};
  const animations: Record<string, string[]> = {};

  for (const c of cells) {
    const p = placed.get(c.key)!;
    const size = { w: c.img.width, h: c.img.height };
    frames[c.key] = {
      frame: { x: p.x, y: p.y, ...size },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, ...size },
      sourceSize: size,
    };
    const m = /^(.*)-(\d+)(~e)?$/.exec(c.frame);
    if (m) {
      const prefix = c.variant ? `${c.sprite.name}@${c.variant}` : c.sprite.name;
      (animations[`${prefix}/${m[1]}${m[3] ?? ""}`] ??= []).push(c.key);
    }
  }

  for (const list of Object.values(animations)) {
    list.sort((a, b) => Number(/(\d+)(~e)?$/.exec(a)![1]) - Number(/(\d+)(~e)?$/.exec(b)![1]));
  }

  const meta = Object.fromEntries([...sprites.values()].map((d) => [d.name, spriteMeta(d, palette)]));

  mkdirSync(OUT_DIR, { recursive: true });

  writeFileSync(join(OUT_DIR, "atlas.png"), encodePng(atlas));
  writeFileSync(
    join(OUT_DIR, "atlas.json"),
    JSON.stringify(
      {
        frames,
        animations,
        meta: {
          image: "atlas.png",
          format: "RGBA8888",
          size: { w: atlasW, h: atlasH },
          scale: "1",
        },
      },
      null,
      2
    )
  );
  writeFileSync(join(OUT_DIR, "meta.json"), JSON.stringify({ palette, sprites: meta }, null, 2));

  console.log(
    `Compiled atlas: ${sprites.size} sprites, ${cells.length} frames into ${atlasW}x${atlasH} at ${OUT_DIR}`
  );
}

if (import.meta.main) {
  compileAtlas();
}
