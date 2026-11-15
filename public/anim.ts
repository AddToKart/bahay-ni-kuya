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
  hairStyle: "wavy" | "bangs" | "spiky" | "slick" | "spectacles" | "ponytail" | "afro" | "parted";
  skin: string;
  skinShadow: string;
  shirt: string;
  shirtDetail?: string;
  shirtStyle?: "plain" | "striped" | "collar";
  pants: string;
  shoes: string;
  isShorts?: boolean;
}

const CHIBI_PALETTES: Record<string, ChibiPalette> = {
  // pi: Matches kitchen boy in reference image (neat black parted hair, red t-shirt, white collar, dark shorts, red shoes)
  pi: {
    hair: "#1a1a1a",
    hairShadow: "#0d0d0d",
    hairStyle: "parted",
    skin: "#ffdfba",
    skinShadow: "#e8c39e",
    shirt: "#dc2626",
    shirtDetail: "#ffffff",
    shirtStyle: "collar",
    pants: "#1e293b",
    shoes: "#dc2626",
    isShorts: true,
  },
  // omp: Matches aisle walker in reference image (dark afro hair, dark skin, red sweater, blue jeans, white sneakers)
  omp: {
    hair: "#18181b",
    hairShadow: "#09090b",
    hairStyle: "afro",
    skin: "#8d5524",
    skinShadow: "#6b3d16",
    shirt: "#b91c1c",
    shirtDetail: "#991b1b",
    pants: "#2563eb",
    shoes: "#ffffff",
  },
  // codex: Royal violet/indigo sweater, purple anime hair, charcoal slacks, white sneakers
  codex: {
    hair: "#7d44aa",
    hairShadow: "#5b327d",
    hairStyle: "wavy",
    skin: "#fedac5",
    skinShadow: "#ecc8b2",
    shirt: "#4834d4",
    shirtDetail: "#686de0",
    pants: "#2d3436",
    shoes: "#f8fafc",
  },
  // opencode: Forest green sweater, auburn bangs, beige/brown slacks, dark boots
  opencode: {
    hair: "#d97706",
    hairShadow: "#b45309",
    hairStyle: "bangs",
    skin: "#fbe9dd",
    skinShadow: "#ebd1c1",
    shirt: "#15803d",
    shirtDetail: "#22c55e",
    pants: "#78350f",
    shoes: "#3e2723",
  },
  // hermes: Matches lounge scholar in reference image (fluffy silver/white afro, silver spectacles, white collared shirt, gray vest)
  hermes: {
    hair: "#f1f5f9",
    hairShadow: "#cbd5e1",
    hairStyle: "afro",
    skin: "#fedac5",
    skinShadow: "#ebd8cb",
    shirt: "#ffffff",
    shirtDetail: "#64748b",
    shirtStyle: "collar",
    pants: "#334155",
    shoes: "#451a03",
  },
};

// Alternate human character palettes directly matching reference visualizer
const VARIANT_PALETTES: ChibiPalette[] = [
  // Variant 0: Matches bottom-right desk worker (blonde anime hair, black & white vertically striped shirt, dark jeans, white sneakers)
  {
    hair: "#eab308",
    hairShadow: "#ca8a04",
    hairStyle: "bangs",
    skin: "#fedac5",
    skinShadow: "#eecdb9",
    shirt: "#ffffff",
    shirtDetail: "#1e293b",
    shirtStyle: "striped",
    pants: "#1e293b",
    shoes: "#ffffff",
  },
  // Variant 1: Matches bottom-left desk worker (chestnut spiky hair, clean white t-shirt, slacks, brown shoes)
  {
    hair: "#6d4c41",
    hairShadow: "#4e342e",
    hairStyle: "spiky",
    skin: "#fedac5",
    skinShadow: "#e0ad85",
    shirt: "#ffffff",
    shirtDetail: "#e2e8f0",
    pants: "#334155",
    shoes: "#ffffff",
  },
  // Variant 2: Matches lounge worker in armchair (flowing golden/auburn wavy hair, chic black long-sleeve outfit)
  {
    hair: "#e67e22",
    hairShadow: "#d35400",
    hairStyle: "wavy",
    skin: "#fedac5",
    skinShadow: "#ecc6b3",
    shirt: "#18181b",
    shirtDetail: "#27272a",
    pants: "#18181b",
    shoes: "#27272a",
  },
  // Variant 3: Purple anime hair, cyan accent hoodie
  {
    hair: "#9333ea",
    hairShadow: "#7e22ce",
    hairStyle: "spiky",
    skin: "#fbe8dc",
    skinShadow: "#ecc6b3",
    shirt: "#2563eb",
    shirtDetail: "#38bdf8",
    pants: "#1e293b",
    shoes: "#ffffff",
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

  // --- SEAT / STOOL ---
  // When sitting or typing, render an authentic round wooden stool beneath them
  if (action === "sit" || action === "type") {
    // Stool seat top surface
    ctx.fillStyle = "#c8965a";
    ctx.beginPath();
    ctx.ellipse(0, -6, 6.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Stool rim
    ctx.strokeStyle = "#8a5a2b";
    ctx.lineWidth = 1;
    ctx.stroke();
    // 2 visible wooden legs
    ctx.fillStyle = "#5c3317";
    ctx.fillRect(-4, -4, 2, 4);
    ctx.fillRect(2, -4, 2, 4);
  }

  // --- LEGS & SHOES ---
  const leftLegOffset = action === "walk" ? (legCycle === 1 ? -2 : legCycle === 3 ? 2 : 0) : 0;
  const rightLegOffset = action === "walk" ? (legCycle === 1 ? 2 : legCycle === 3 ? -2 : 0) : 0;

  if (action === "sleep") {
    // Sleeping: curled in bed under duvet
    ctx.fillStyle = "#1e40af"; // Duvet
    ctx.fillRect(-6, -8, 12, 6);
    ctx.fillStyle = pal.shoes;
    ctx.fillRect(5, -6, 3, 3);
  } else if (action === "sit" || action === "type") {
    // Seated pose: thighs forward on stool
    ctx.fillStyle = pal.pants;
    ctx.fillRect(-4, -7, 8, 4);
    if (pal.isShorts) {
      ctx.fillStyle = pal.skin;
      ctx.fillRect(-3, -4, 2, 2);
      ctx.fillRect(1, -4, 2, 2);
    }
    ctx.fillStyle = pal.shoes;
    ctx.fillRect(-3, -3, 3, 2);
    ctx.fillRect(1, -3, 3, 2);
  } else {
    // Standing / Walking legs
    if (facing === "left") {
      ctx.fillStyle = pal.pants;
      ctx.fillRect(-2 + leftLegOffset, -7, 4, pal.isShorts ? 3 : 5);
      if (pal.isShorts) {
        ctx.fillStyle = pal.skin;
        ctx.fillRect(-2 + leftLegOffset, -4, 3, 2);
      }
      ctx.fillStyle = pal.shoes;
      ctx.fillRect(-3 + leftLegOffset, -2, 5, 2);
    } else if (facing === "right") {
      ctx.fillStyle = pal.pants;
      ctx.fillRect(-2 + rightLegOffset, -7, 4, pal.isShorts ? 3 : 5);
      if (pal.isShorts) {
        ctx.fillStyle = pal.skin;
        ctx.fillRect(-1 + rightLegOffset, -4, 3, 2);
      }
      ctx.fillStyle = pal.shoes;
      ctx.fillRect(-2 + rightLegOffset, -2, 5, 2);
    } else {
      // Facing Down or Up
      // Left leg
      ctx.fillStyle = pal.pants;
      ctx.fillRect(-4, -7 + leftLegOffset, 3, pal.isShorts ? 3 : 5);
      if (pal.isShorts) {
        ctx.fillStyle = pal.skin;
        ctx.fillRect(-4, -4 + leftLegOffset, 3, 2);
      }
      ctx.fillStyle = pal.shoes;
      ctx.fillRect(-4, -2 + leftLegOffset, 3, 2);

      // Right leg
      ctx.fillStyle = pal.pants;
      ctx.fillRect(1, -7 + rightLegOffset, 3, pal.isShorts ? 3 : 5);
      if (pal.isShorts) {
        ctx.fillStyle = pal.skin;
        ctx.fillRect(1, -4 + rightLegOffset, 3, 2);
      }
      ctx.fillStyle = pal.shoes;
      ctx.fillRect(1, -2 + rightLegOffset, 3, 2);
    }
  }

  // --- TORSO & SHIRT ---
  if (pal.shirtStyle === "striped") {
    // Black & white vertical stripes (matching reference desk character)
    for (let sx = -4; sx < 4; sx++) {
      ctx.fillStyle = sx % 2 === 0 ? "#ffffff" : "#1e293b";
      ctx.fillRect(sx, -14, 1, 7);
    }
  } else {
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-4, -14, 8, 7);

    // Collar detail
    if (pal.shirtStyle === "collar" || (pal.shirtDetail && facing === "down")) {
      ctx.fillStyle = pal.shirtDetail || "#ffffff";
      ctx.fillRect(-2, -14, 4, 2);
      ctx.fillRect(-1, -12, 2, 2);
    }
  }

  // Arms
  if (action === "type") {
    // Typing: arms extended forward with hands tapping
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-5, -13, 2, 4);
    ctx.fillRect(3, -13, 2, 4);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(-5, -10 + typingCycle, 3, 2);
    ctx.fillRect(2, -11 + typingCycle, 3, 2);

    // Compact open laptop with glowing screen
    ctx.fillStyle = "#94a3b8"; // Laptop base
    ctx.fillRect(-4, -8, 8, 2);
    ctx.fillStyle = "#38bdf8"; // Display screen
    ctx.fillRect(-3, -11, 6, 3);
  } else if (action === "pool") {
    // Pool player: holding wooden cue stick
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-5, -13, 3, 4);
    ctx.fillRect(2, -13, 3, 4);
    ctx.fillStyle = "#8d6e63"; // Cue stick
    ctx.fillRect(-8, -11, 16, 2);
    ctx.fillStyle = "#38bdf8"; // Blue chalked cue tip
    ctx.fillRect(7, -11, 2, 2);
  } else if (facing === "left") {
    const swing = action === "walk" ? (legCycle === 1 ? 2 : legCycle === 3 ? -2 : 0) : 0;
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-4, -13 + swing, 3, 5);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(-4, -8 + swing, 2, 2);
  } else if (facing === "right") {
    const swing = action === "walk" ? (legCycle === 1 ? -2 : legCycle === 3 ? 2 : 0) : 0;
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(1, -13 + swing, 3, 5);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(2, -8 + swing, 2, 2);
  } else {
    // Facing Down or Up: Left & Right arms with subtle swing
    const armSwingL = action === "walk" ? (legCycle === 1 ? -1 : legCycle === 3 ? 1 : 0) : 0;
    const armSwingR = action === "walk" ? (legCycle === 1 ? 1 : legCycle === 3 ? -1 : 0) : 0;
    ctx.fillStyle = pal.shirt;
    ctx.fillRect(-6, -13 + armSwingL, 2, 5);
    ctx.fillRect(4, -13 + armSwingR, 2, 5);
    ctx.fillStyle = pal.skin;
    ctx.fillRect(-6, -8 + armSwingL, 2, 2);
    ctx.fillRect(4, -8 + armSwingR, 2, 2);
  }

  // --- HEAD & FACE ---
  // Skin base
  ctx.fillStyle = pal.skin;
  ctx.fillRect(-5, -23, 10, 9);

  // Back of head if facing UP
  if (facing === "up") {
    ctx.fillStyle = pal.hair;
    if (pal.hairStyle === "afro") {
      ctx.beginPath();
      ctx.arc(0, -21, 8.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-6, -24, 12, 10);
      ctx.fillStyle = pal.hairShadow;
      ctx.fillRect(-5, -15, 10, 2);
    }
  } else {
    // Face features (Eyes, Cheeks, Mouth, Hair)
    // Subtle rose blush on cheeks
    ctx.fillStyle = "rgba(239, 68, 68, 0.30)";
    ctx.fillRect(-4, -16, 2, 1);
    ctx.fillRect(2, -16, 2, 1);

    // Subtle mouth
    ctx.fillStyle = "#e07a5f";
    ctx.fillRect(-1, -15, 2, 1);

    // Expressive 2x3 anime eyes with white catchlight highlight
    if (action === "sleep") {
      // Closed sleepy eye slits: - _ -
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-4, -18, 2, 1);
      ctx.fillRect(2, -18, 2, 1);
    } else if (facing === "left") {
      // Profile eye (left)
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-4, -19, 2, 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-4, -19, 1, 1);
    } else if (facing === "right") {
      // Profile eye (right)
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(2, -19, 2, 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(3, -19, 1, 1);
    } else {
      // Facing Down: 2 expressive anime eyes
      ctx.fillStyle = "#0f172a"; // Deep pupil
      ctx.fillRect(-4, -19, 2, 3);
      ctx.fillRect(2, -19, 2, 3);
      // White catchlight highlight
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-4, -19, 1, 1);
      ctx.fillRect(2, -19, 1, 1);
      // Eyelid line
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-4, -20, 2, 1);
      ctx.fillRect(2, -20, 2, 1);
    }

    // Spectacles (for Hermes / scholar style)
    if (pal.hairStyle === "spectacles" || pal.harness === "hermes") {
      ctx.strokeStyle = "#485460";
      ctx.lineWidth = 1;
      ctx.strokeRect(-4.5, -19.5, 3, 3);
      ctx.strokeRect(1.5, -19.5, 3, 3);
      ctx.fillStyle = "#485460";
      ctx.fillRect(-1.5, -18.5, 3, 1); // Bridge
    }

    // Hair Style Rendering
    ctx.fillStyle = pal.hair;
    if (pal.hairStyle === "afro") {
      // Big puffy rounded afro (matches aisle walker & lounge scholar)
      ctx.beginPath();
      ctx.arc(0, -22, 8.5, 0, Math.PI * 2);
      ctx.fill();
      // Textured side curls
      ctx.fillRect(-7, -21, 2, 5);
      ctx.fillRect(5, -21, 2, 5);
      ctx.fillStyle = pal.hairShadow;
      ctx.fillRect(-5, -20, 10, 2);
    } else if (pal.hairStyle === "parted") {
      // Neat side-parted hair (matches kitchen boy)
      ctx.fillRect(-6, -24, 12, 5); // Hair cap
      ctx.fillRect(-6, -23, 2, 7);  // Left sideburn
      ctx.fillRect(4, -23, 2, 7);   // Right sideburn
      ctx.fillRect(-4, -20, 3, 2);  // Left parted bang
      ctx.fillRect(0, -20, 4, 2);   // Right parted bang
      // Hair glint
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillRect(-3, -23, 6, 1);
    } else if (pal.hairStyle === "spiky") {
      // Anime spiky tufts (matches bottom-left desk worker)
      ctx.fillRect(-6, -24, 12, 4);
      ctx.fillRect(-6, -23, 2, 7);
      ctx.fillRect(4, -23, 2, 7);
      ctx.fillRect(-4, -26, 3, 3); // Left spike
      ctx.fillRect(1, -26, 3, 3);  // Right spike
      ctx.fillRect(-3, -20, 6, 2);  // Bangs
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(-3, -24, 6, 1);
    } else if (pal.hairStyle === "wavy") {
      // Long flowing wavy hair (matches lounge armchair worker)
      ctx.fillRect(-6, -24, 12, 5);
      ctx.fillRect(-6, -23, 2, 9);
      ctx.fillRect(4, -23, 2, 9);
      ctx.fillRect(-4, -20, 3, 2);
      ctx.fillRect(1, -20, 3, 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.fillRect(-3, -23, 6, 1);
    } else {
      // Default neat bangs (matches bottom-right desk worker)
      ctx.fillRect(-6, -24, 12, 4);
      ctx.fillRect(-6, -23, 2, 7);
      ctx.fillRect(4, -23, 2, 7);
      ctx.fillRect(-4, -20, 8, 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(-3, -23, 6, 1);
    }
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
