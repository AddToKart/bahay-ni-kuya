// Sprite Animation and Emote System for Bahay ni Kuya
// Renders human chibi pixel art characters, 4-direction walk cycles,
// interactive action poses (sit, type, pool, arcade, etc.), and floating emotes.

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
  opencode: "🦫", // Beaver theme (Green/Orange)
  codex: "🐙",    // Octopus theme (Purple/Violet)
  pi: "🐹",       // Hamster theme (Red Hoodie)
  omp: "🦝",      // Raccoon theme (Charcoal/Cyan)
  hermes: "🦉",   // Owl theme (Silver Hair/Scholar)
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
  nominated?: boolean;
  errorState?: boolean;
}

interface ChibiPalette {
  hair: string;
  hairShadow: string;
  hairStyle: "wavy" | "bangs" | "spiky" | "slick" | "spectacles" | "ponytail";
  skin: string;
  skinShadow: string;
  shirt: string;
  shirtDetail?: string;
  pants: string;
  shoes: string;
}

const CHIBI_PALETTES: Record<string, ChibiPalette> = {
  codex: {
    hair: "#7d44aa",
    hairShadow: "#5b327d",
    hairStyle: "wavy",
    skin: "#fde8d7",
    skinShadow: "#ecc8b2",
    shirt: "#4834d4",
    shirtDetail: "#686de0",
    pants: "#2d3436",
    shoes: "#f5f6fa",
  },
  opencode: {
    hair: "#e67e22",
    hairShadow: "#d35400",
    hairStyle: "bangs",
    skin: "#fbe9dd",
    skinShadow: "#ebd1c1",
    shirt: "#27ae60",
    shirtDetail: "#2ecc71",
    pants: "#795548",
    shoes: "#3e2723",
  },
  pi: {
    hair: "#2c3e50",
    hairShadow: "#1a252f",
    hairStyle: "spiky",
    skin: "#fae3d9",
    skinShadow: "#e8c5b6",
    shirt: "#e74c3c",
    shirtDetail: "#ffffff",
    pants: "#2980b9",
    shoes: "#fdfefe",
  },
  omp: {
    hair: "#34495e",
    hairShadow: "#2c3e50",
    hairStyle: "spiky",
    skin: "#f5cba7",
    skinShadow: "#e0ad85",
    shirt: "#2c3e50",
    shirtDetail: "#00cec9",
    pants: "#17202a",
    shoes: "#212f3d",
  },
  hermes: {
    hair: "#dfe6e9",
    hairShadow: "#b2bec3",
    hairStyle: "spectacles",
    skin: "#fbf3eb",
    skinShadow: "#ebd8cb",
    shirt: "#636e72",
    shirtDetail: "#f5f6fa",
    pants: "#2c3e50",
    shoes: "#3e2723",
  },
};

// Alternate human character palettes for multiple instances of a harness
const VARIANT_PALETTES: ChibiPalette[] = [
  {
    hair: "#f1c40f",
    hairShadow: "#f39c12",
    hairStyle: "ponytail",
    skin: "#fceade",
    skinShadow: "#eecdb9",
    shirt: "#e84393",
    shirtDetail: "#fd79a8",
    pants: "#0984e3",
    shoes: "#dfe6e9",
  },
  {
    hair: "#c0392b",
    hairShadow: "#962d22",
    hairStyle: "wavy",
    skin: "#fbe8dc",
    skinShadow: "#ecc6b3",
    shirt: "#00b894",
    shirtDetail: "#55efc4",
    pants: "#636e72",
    shoes: "#2d3436",
  },
  {
    hair: "#ecf0f1",
    hairShadow: "#bdc3c7",
    hairStyle: "bangs",
    skin: "#f8e0cf",
    skinShadow: "#e4beaa",
    shirt: "#8e44ad",
    shirtDetail: "#9b59b6",
    pants: "#2c3e50",
    shoes: "#111111",
  },
  {
    hair: "#8d6e63",
    hairShadow: "#6d4c41",
    hairStyle: "slick",
    skin: "#fcefe6",
    skinShadow: "#e9d5c8",
    shirt: "#f5f6fa",
    shirtDetail: "#2980b9",
    pants: "#2d3436",
    shoes: "#3e2723",
  },
];

/** Draws a human chibi pixel art character matching the reference pixel visualizer aesthetic. */
export function drawAnimatedCharacter(
  ctx: CanvasRenderingContext2D,
  state: AnimatedSpriteState,
  timeMs: number,
  dpr = 1,
): void {
  const { harness, x, y, size, facing, action, emote, instanceIndex = 0, highlighted } = state;
  const feetX = Math.round(x);
  const feetY = Math.round(y);
  const isSubagent = size < 24;

  // Select human chibi palette
  let pal = CHIBI_PALETTES[harness] || CHIBI_PALETTES.codex;
  if (instanceIndex > 0) {
    pal = VARIANT_PALETTES[(instanceIndex - 1) % VARIANT_PALETTES.length];
  }

  // 1. Action-dependent bob, posture, and arm movement
  let bob = 0;
  let legCycle = 0;
  let typingCycle = 0;

  switch (action) {
    case "walk":
      legCycle = Math.floor(timeMs / 140) % 4; // 0, 1, 2, 3
      bob = legCycle % 2 === 1 ? -1 : 0;
      break;
    case "type":
      bob = 1; // seated slightly lower
      typingCycle = Math.floor(timeMs / 100) % 2;
      break;
    case "sit":
    case "pool":
      bob = 1;
      break;
    case "exercise":
      legCycle = Math.floor(timeMs / 90) % 4;
      bob = legCycle % 2 === 1 ? -2 : 0;
      break;
    case "sleep":
      bob = 2;
      break;
    default:
      // idle subtle breathing
      bob = Math.floor(timeMs / 700) % 2 === 0 ? 0 : -1;
      break;
  }

  // 2. Soft Floor Shadow
  ctx.fillStyle = "rgba(18, 22, 32, 0.4)";
  ctx.beginPath();
  const shadowRadiusX = isSubagent ? 4.5 : 6;
  const shadowRadiusY = isSubagent ? 2 : 2.5;
  ctx.ellipse(feetX, feetY, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Selection Halo / Glow (clean circular highlight, no bulky square borders)
  if (highlighted) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(feetX, feetY, 9, 4, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = pal.shirt;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(feetX, feetY, 11, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 4. Draw Human Chibi Character
  ctx.save();
  ctx.translate(feetX, feetY + bob);

  const scale = isSubagent ? 0.75 : 1.0;
  if (scale !== 1.0) ctx.scale(scale, scale);

  const py = -24; // top of head relative to feet

  // --- LEGS & SHOES ---
  const leftLegOffset = action === "walk" ? (legCycle === 1 ? -2 : legCycle === 3 ? 2 : 0) : 0;
  const rightLegOffset = action === "walk" ? (legCycle === 1 ? 2 : legCycle === 3 ? -2 : 0) : 0;

  if (action === "sleep") {
    // Sleeping: curled horizontally
    ctx.fillStyle = pal.pants;
    ctx.fillRect(-5, -6, 10, 4);
    ctx.fillStyle = pal.shoes;
    ctx.fillRect(5, -6, 3, 4);
  } else if (action === "sit" || action === "type") {
    // Seated pose: thighs forward
    ctx.fillStyle = pal.pants;
    ctx.fillRect(-4, -6, 8, 4);
    ctx.fillStyle = pal.shoes;
    ctx.fillRect(-3, -2, 3, 2);
    ctx.fillRect(1, -2, 3, 2);
  } else {
    // Standing / Walking legs
    if (facing === "left") {
      ctx.fillStyle = pal.pants;
      ctx.fillRect(-2 + leftLegOffset, -7, 4, 5);
      ctx.fillStyle = pal.shoes;
      ctx.fillRect(-3 + leftLegOffset, -2, 5, 2);
    } else if (facing === "right") {
      ctx.fillStyle = pal.pants;
      ctx.fillRect(-2 + rightLegOffset, -7, 4, 5);
      ctx.fillStyle = pal.shoes;
      ctx.fillRect(-2 + rightLegOffset, -2, 5, 2);
    } else {
      // Facing Down or Up
      // Left leg
      ctx.fillStyle = pal.pants;
      ctx.fillRect(-4, -7 + leftLegOffset, 3, 5);
      ctx.fillStyle = pal.shoes;
      ctx.fillRect(-4, -2 + leftLegOffset, 3, 2);

      // Right leg
      ctx.fillStyle = pal.pants;
      ctx.fillRect(1, -7 + rightLegOffset, 3, 5);
      ctx.fillStyle = pal.shoes;
      ctx.fillRect(1, -2 + rightLegOffset, 3, 2);
    }
  }

  // --- TORSO & SHIRT ---
  ctx.fillStyle = pal.shirt;
  ctx.fillRect(-4, -14, 8, 7);

  // Shirt detail (collar / jacket inner)
  if (pal.shirtDetail && facing === "down") {
    ctx.fillStyle = pal.shirtDetail;
    ctx.fillRect(-1, -14, 2, 4);
  }

  // Arms
  if (action === "type") {
    // Typing: arms extended forward with hands tapping
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-5, -13, 3, 3);
    ctx.fillRect(2, -13, 3, 3);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(-5, -10 + typingCycle, 3, 2);
    ctx.fillRect(2, -11 + typingCycle, 3, 2);
  } else if (action === "pool") {
    // Pool player: holding cue stick
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-5, -13, 3, 4);
    ctx.fillRect(2, -13, 3, 4);
    ctx.fillStyle = "#8d6e63"; // Cue stick
    ctx.fillRect(-7, -11, 14, 2);
  } else if (facing === "left") {
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-4, -13, 3, 5);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(-4, -8, 2, 2);
  } else if (facing === "right") {
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(1, -13, 3, 5);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(2, -8, 2, 2);
  } else {
    // Left & Right arms at sides
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-6, -13, 2, 5);
    ctx.fillRect(4, -13, 2, 5);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(-6, -8, 2, 2);
    ctx.fillRect(4, -8, 2, 2);
  }

  // --- HEAD & FACE ---
  // Skin base
  ctx.fillStyle = pal.skin;
  ctx.fillRect(-5, -23, 10, 9);

  // Back of head if facing UP
  if (facing === "up") {
    ctx.fillStyle = pal.hair;
    ctx.fillRect(-5, -24, 10, 10);
    ctx.fillStyle = pal.hairShadow;
    ctx.fillRect(-5, -16, 10, 2);
  } else {
    // Face features (Eyes, Cheeks, Hair)
    // Subtle peach blush
    ctx.fillStyle = "rgba(235, 77, 75, 0.25)";
    ctx.fillRect(-4, -17, 2, 1);
    ctx.fillRect(2, -17, 2, 1);

    // Eyes
    if (action === "sleep") {
      // Closed sleepy eyes: - _ -
      ctx.fillStyle = "#1e272e";
      ctx.fillRect(-4, -18, 2, 1);
      ctx.fillRect(2, -18, 2, 1);
    } else if (facing === "left") {
      // Profile eye (left)
      ctx.fillStyle = "#1e272e";
      ctx.fillRect(-4, -19, 2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-4, -19, 1, 1);
    } else if (facing === "right") {
      // Profile eye (right)
      ctx.fillStyle = "#1e272e";
      ctx.fillRect(2, -19, 2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(3, -19, 1, 1);
    } else {
      // Facing Down: 2 expressive anime eyes with white catchlight
      ctx.fillStyle = "#1e272e";
      ctx.fillRect(-4, -19, 2, 2);
      ctx.fillRect(2, -19, 2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-4, -19, 1, 1);
      ctx.fillRect(2, -19, 1, 1);
    }

    // Spectacles (for Hermes / scholar style)
    if (pal.hairStyle === "spectacles" && facing === "down") {
      ctx.strokeStyle = "#485460";
      ctx.lineWidth = 1;
      ctx.strokeRect(-4.5, -19.5, 3, 3);
      ctx.strokeRect(1.5, -19.5, 3, 3);
      ctx.fillStyle = "#485460";
      ctx.fillRect(-1.5, -18.5, 3, 1); // Bridge
    }

    // Hair Cap & Bangs
    ctx.fillStyle = pal.hair;
    ctx.fillRect(-5, -24, 10, 4); // Top volume
    ctx.fillRect(-6, -23, 2, 7); // Left sideburn
    ctx.fillRect(4, -23, 2, 7);  // Right sideburn

    if (pal.hairStyle === "bangs") {
      ctx.fillRect(-3, -20, 6, 2);
    } else if (pal.hairStyle === "spiky") {
      ctx.fillRect(-3, -25, 2, 2);
      ctx.fillRect(1, -25, 2, 2);
      ctx.fillRect(-2, -20, 4, 1);
    } else if (pal.hairStyle === "wavy") {
      ctx.fillRect(-4, -20, 3, 2);
      ctx.fillRect(1, -20, 3, 2);
    } else if (pal.hairStyle === "ponytail") {
      ctx.fillRect(-4, -20, 8, 2);
      ctx.fillRect(facing === "left" ? 4 : -6, -24, 2, 6); // Ponytail puff
    } else {
      // Default side-swept bangs
      ctx.fillRect(-4, -20, 5, 2);
    }

    // Hair Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(-3, -23, 6, 1);
  }

  ctx.restore();

  // 5. Floating Sleeping Zzz
  if (action === "sleep") {
    const drift = ((timeMs / 1000) % 2) / 2;
    ctx.font = `bold 10px ${MONO}`;
    ctx.fillStyle = PALETTE.sleeping;
    ctx.fillText("z", feetX + 8 + drift * 4, feetY - 22 - drift * 8);
    ctx.font = `bold 12px ${MONO}`;
    ctx.fillText("Z", feetX + 14 + drift * 6, feetY - 30 - drift * 10);
  }

  // 6. Floating Emote Speech Bubble
  if (emote && EMOTE_GLYPHS[emote]) {
    const emoteIcon = EMOTE_GLYPHS[emote];
    const bw = 22;
    const bh = 18;
    const bx = feetX - bw / 2;
    const by = feetY + bob - 38;

    // Rounded speech bubble with shadow
    ctx.fillStyle = "rgba(18, 22, 32, 0.3)";
    ctx.fillRect(bx + 1, by + 1, bw, bh);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = "#2d3436";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    // Pointer tail
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(bx + bw / 2 - 2, by + bh);
    ctx.lineTo(bx + bw / 2 + 2, by + bh);
    ctx.lineTo(bx + bw / 2, by + bh + 3);
    ctx.closePath();
    ctx.fill();

    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoteIcon, bx + bw / 2, by + bh / 2 + 1);
  }

  // 7. Nominated Banner
  if (state.nominated) {
    const nw = 56;
    const nh = 11;
    const nx = feetX - nw / 2;
    const ny = feetY + bob - (emote ? 52 : 36);
    ctx.fillStyle = Math.floor(timeMs / 400) % 2 === 0 ? "#dc2626" : "#b91c1c";
    ctx.fillRect(nx, ny, nw, nh);
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 1;
    ctx.strokeRect(nx + 0.5, ny + 0.5, nw - 1, nh - 1);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 8px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("NOMINATED", nx + nw / 2, ny + nh / 2 + 0.5);
  }
}
