// Sprite + shared drawing primitives for Agent House.
// All colors are the DESIGN.md palette (CSS vars mirror this constant).

export const PALETTE = {
  page: "#12141c",
  frame: "#2b2119",
  wallBed: "#a9bcce",
  wallLiv: "#e7d3ac",
  wallOff: "#c9d3ae",
  floor: "#a06a45",
  floor2: "#8a5a3b",
  ink: "#2b2119",
  muted: "#8b8171",
  working: "#f0a33a",
  idle: "#7fb069",
  sleeping: "#6f7f95",
} as const;

export const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

export const HARNESS_ORDER = ["opencode", "codex", "pi", "omp", "hermes"] as const;

export const HARNESS_EMOJI: Record<string, string> = {
  opencode: "🦫",
  codex: "🐙",
  pi: "🐹",
  omp: "🦝",
  hermes: "🦉",
};

export const HARNESS_ACCENT: Record<string, string> = {
  opencode: "#e07a5f",
  codex: "#5b8def",
  pi: "#b48ead",
  omp: "#d9a441",
  hermes: "#6fb1a8",
};

export const SCENE_W = 960;
export const SCENE_H = 580;

export function accentFor(harness: string): string {
  return HARNESS_ACCENT[harness] ?? PALETTE.muted;
}

// ---------------------------------------------------------------- emoji cache

const emojiCache = new Map<string, HTMLCanvasElement>();

/** Emoji glyph rendered once per (harness, size, dpr) into an offscreen canvas. */
export function emojiCanvas(harness: string, size: number, dpr: number): HTMLCanvasElement {
  const px = Math.max(1, Math.round(size * dpr));
  const key = `${harness}|${px}`;
  const cached = emojiCache.get(key);
  if (cached) return cached;

  const side = Math.ceil(px * 1.35);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${px}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(HARNESS_EMOJI[harness] ?? "🐾", side / 2, side / 2 + px * 0.04);
  }
  emojiCache.set(key, canvas);
  return canvas;
}

// ---------------------------------------------------------------- text utils

export function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const candidate = text.slice(0, mid) + "…";
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "…";
}

// ---------------------------------------------------------------- primitives

function pathPxRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.lineTo(x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.lineTo(x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.lineTo(x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.closePath();
}

/** Cream speech bubble with 1px ink outline and a downward tail. */
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  topY: number,
  maxWidth = 170,
): number {
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const label = truncateToWidth(ctx, text, maxWidth);
  const w = Math.max(26, Math.ceil(ctx.measureText(label).width) + 14);
  const h = 20;
  const x = Math.min(Math.max(4, Math.round(cx - w / 2)), SCENE_W - w - 4);
  const y = Math.max(4, Math.round(topY - h));

  pathPxRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 2);
  ctx.fillStyle = PALETTE.wallLiv;
  ctx.fill();
  ctx.strokeStyle = PALETTE.frame;
  ctx.lineWidth = 1;
  ctx.stroke();

  const tx = Math.min(Math.max(cx, x + 6), x + w - 6);
  ctx.beginPath();
  ctx.moveTo(tx - 3, y + h - 1);
  ctx.lineTo(tx + 3, y + h - 1);
  ctx.lineTo(tx, y + h + 5);
  ctx.closePath();
  ctx.fillStyle = PALETTE.wallLiv;
  ctx.fill();
  ctx.strokeStyle = PALETTE.frame;
  ctx.stroke();
  // erase the seam where the tail meets the bubble
  ctx.beginPath();
  ctx.moveTo(tx - 2, y + h - 1);
  ctx.lineTo(tx + 2, y + h - 1);
  ctx.strokeStyle = PALETTE.wallLiv;
  ctx.stroke();

  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(label, x + 7, y + 14);
  return y;
}

export interface CharacterPaint {
  harness: string;
  /** feet position in scene coordinates */
  x: number;
  y: number;
  bob: number;
  size: number;
  facing: number;
}

/** Emoji sprite in a harness-accent pixel ring with a flat floor shadow + label. */
export function drawCharacter(ctx: CanvasRenderingContext2D, p: CharacterPaint, dpr: number): void {
  const feetY = Math.round(p.y);
  const bob = Math.round(p.bob);
  const cy = Math.round(feetY + bob - p.size / 2);
  const accent = accentFor(p.harness);

  // flat shadow stays on the floor surface
  ctx.fillStyle = "rgba(43, 33, 25, 0.3)";
  ctx.beginPath();
  ctx.ellipse(Math.round(p.x), feetY, p.size * 0.33, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // square pixel ring: 1px ink outside, 2px harness accent inside
  const half = Math.round(p.size / 2 + 4);
  const side = half * 2;
  ctx.strokeStyle = PALETTE.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(p.x) - half + 0.5, cy - half + 0.5, side - 1, side - 1);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(p.x) - half + 3, cy - half + 3, side - 6, side - 6);

  const sprite = emojiCanvas(p.harness, p.size, dpr);
  const dest = p.size * 1.35;
  ctx.save();
  ctx.translate(Math.round(p.x), cy);
  ctx.scale(p.facing >= 0 ? 1 : -1, 1);
  ctx.drawImage(sprite, -dest / 2, -dest / 2, dest, dest);
  ctx.restore();
}

/** Name plate under a character; cream fill keeps it legible on dark floors. */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  maxWidth: number,
): void {
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const label = truncateToWidth(ctx, text, maxWidth);
  const w = Math.ceil(ctx.measureText(label).width) + 6;
  const bx = Math.round(x - w / 2);
  const by = Math.round(baselineY) - 10;
  ctx.fillStyle = PALETTE.wallLiv;
  ctx.fillRect(bx, by, w, 13);
  ctx.fillStyle = PALETTE.ink;
  ctx.fillText(label, Math.round(x), Math.round(baselineY));
}

/** Dashed tether from a subagent to its parent. */
export function drawParentLink(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  ctx.save();
  ctx.strokeStyle = PALETTE.muted;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(Math.round(fromX) + 0.5, Math.round(fromY) + 0.5);
  ctx.lineTo(Math.round(toX) + 0.5, Math.round(toY) + 0.5);
  ctx.stroke();
  ctx.restore();
}

/** Slow floating z z z above a sleeping character. */
export function drawZzz(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  spriteSize: number,
  time: number,
  reduced: boolean,
): void {
  ctx.fillStyle = PALETTE.sleeping;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < 3; i += 1) {
    const lift = reduced ? 0 : Math.round(Math.sin(time / 900 + i * 0.9) * 2);
    const size = 9 + i * 2;
    ctx.font = `${size}px ${MONO}`;
    ctx.fillText("z", x + 14 + i * 8, feetY - spriteSize - 6 - i * 8 + lift);
  }
}
