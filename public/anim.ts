// Sprite Animation and Emote System for Bahay ni Kuya

import { MONO, PALETTE, accentFor, VARIANT_ACCENTS } from "./sprites.js";

export type Facing = "up" | "down" | "left" | "right";

export type Action =
  | "idle"
  | "walk"
  | "sit"
  | "type"
  | "sleep"
  | "wash"
  | "cook"
  | "tv"
  | "pool"
  | "arcade"
  | "exercise"
  | "water"
  | "read";

export type Emote =
  | "thumbs_up"
  | "facepalm"
  | "question"
  | "exclamation"
  | "sweat"
  | "heart"
  | null;

export const EMOTE_GLYPHS: Record<string, string> = {
  thumbs_up: "👍",
  facepalm: "🤦",
  question: "❓",
  exclamation: "❗",
  sweat: "💧",
  heart: "❤️",
};

export const HARNESS_SPECIES: Record<string, string> = {
  opencode: "🦫", // Beaver
  codex: "🐙",    // Octopus
  pi: "🐹",       // Hamster
  omp: "🦝",      // Raccoon
  hermes: "🦉",   // Owl
};

export interface AnimatedSpriteState {
  harness: string;
  x: number; // scene pixel x
  y: number; // scene pixel y (feet)
  size: number;
  facing: Facing;
  action: Action;
  emote: Emote;
  emoteUntil?: number;
  instanceIndex?: number;
  highlighted?: boolean;
}

/** Draws an animated housemate character at (x, y) with action frame, species icon, ring, and active emote. */
export function drawAnimatedCharacter(
  ctx: CanvasRenderingContext2D,
  state: AnimatedSpriteState,
  timeMs: number,
  dpr = 1,
): void {
  const { harness, x, y, size, facing, action, emote, instanceIndex = 0, highlighted } = state;
  const feetY = Math.round(y);

  // 1. Action-dependent bob and posture
  let bob = 0;
  let handMotion = 0;
  let particle = "";

  switch (action) {
    case "walk":
      bob = Math.floor(timeMs / 120) % 2 === 0 ? 0 : -3;
      break;
    case "type":
      bob = Math.floor(timeMs / 150) % 2 === 0 ? 0 : -1;
      handMotion = Math.sin(timeMs / 80) * 2;
      break;
    case "sit":
      bob = 2; // slightly seated lower
      break;
    case "exercise":
      bob = Math.floor(timeMs / 90) % 2 === 0 ? -1 : -4;
      if (Math.floor(timeMs / 300) % 2 === 0) particle = "💧";
      break;
    case "cook":
      handMotion = Math.sin(timeMs / 120) * 3;
      if (Math.floor(timeMs / 400) % 2 === 0) particle = "♨️";
      break;
    case "wash":
      handMotion = Math.sin(timeMs / 100) * 2;
      if (Math.floor(timeMs / 350) % 2 === 0) particle = "🫧";
      break;
    case "pool":
      bob = 1;
      break;
    case "arcade":
      handMotion = Math.sin(timeMs / 70) * 3;
      break;
    case "water":
      if (Math.floor(timeMs / 300) % 2 === 0) particle = "💧";
      break;
    case "sleep":
      bob = 3;
      break;
    default:
      // idle subtle breathing
      bob = Math.floor(timeMs / 600) % 2 === 0 ? 0 : -1;
      break;
  }

  const cy = Math.round(feetY + bob - size / 2);
  const variant = instanceIndex > 0 ? VARIANT_ACCENTS[(instanceIndex - 1) % VARIANT_ACCENTS.length] : null;
  const accent = variant ?? accentFor(harness);

  // 2. Floor Shadow
  ctx.fillStyle = "rgba(43, 33, 25, 0.35)";
  ctx.beginPath();
  ctx.ellipse(Math.round(x), feetY, size * 0.35, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Selection / Highlight Ring
  const half = Math.round(size / 2 + 4);
  const side = half * 2;
  const rx = Math.round(x) - half;
  const ry = cy - half;

  if (highlighted) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx - 1.5, ry - 1.5, side + 3, side + 3);
  }

  // 4. Character Frame Ring
  ctx.strokeStyle = PALETTE.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 0.5, ry + 0.5, side - 1, side - 1);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(rx + 3, ry + 3, side - 6, side - 6);

  // Instance pips (for multiple processes of same harness)
  if (instanceIndex > 0) {
    const pips = Math.min(3, instanceIndex);
    ctx.fillStyle = accent;
    for (let i = 0; i < pips; i++) {
      ctx.fillRect(rx + side - 4 - i * 4, ry + 2, 3, 3);
    }
  }

  // 5. Render Species Glyph
  const glyph = HARNESS_SPECIES[harness] ?? "🐾";
  ctx.save();
  ctx.translate(Math.round(x), cy);
  // Facing horizontal flip
  const flip = facing === "left" ? -1 : 1;
  ctx.scale(flip, 1);

  ctx.font = `${Math.round(size * 0.85)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, 0, 1);

  // Hand / tool activity indicator
  if (handMotion !== 0) {
    ctx.fillStyle = accent;
    ctx.fillRect(flip * 10, 6 + handMotion, 3, 3);
  }
  ctx.restore();

  // 6. Action Particle (steam, water, sweat)
  if (particle) {
    ctx.font = "10px sans-serif";
    ctx.fillText(particle, Math.round(x) + 12, ry + 4);
  }

  // 7. Sleeping Zzz
  if (action === "sleep") {
    const drift = ((timeMs / 1000) % 2) / 2;
    ctx.font = `bold 10px ${MONO}`;
    ctx.fillStyle = PALETTE.sleeping;
    ctx.fillText("z", Math.round(x) + 8 + drift * 4, ry - 4 - drift * 8);
    ctx.font = `bold 12px ${MONO}`;
    ctx.fillText("Z", Math.round(x) + 14 + drift * 6, ry - 12 - drift * 10);
  }

  // 8. Floating Emote Bubble
  if (emote && EMOTE_GLYPHS[emote]) {
    const emoteIcon = EMOTE_GLYPHS[emote];
    const bw = 22;
    const bh = 18;
    const bx = Math.round(x) - bw / 2;
    const by = ry - bh - 6;

    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = PALETTE.frame;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    // Tail
    ctx.fillStyle = "#fffdf7";
    ctx.beginPath();
    ctx.moveTo(bx + bw / 2 - 2, by + bh);
    ctx.lineTo(bx + bw / 2 + 2, by + bh);
    ctx.lineTo(bx + bw / 2, by + bh + 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoteIcon, bx + bw / 2, by + bh / 2 + 1);
  }
}
