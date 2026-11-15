// Sprite Animation and Emote System for Bahay ni Kuya
// Integrates with the Oddboro-based compiled atlas (172 sprites, 2142 frames).
// Renders human chibi pixel art characters with harness motifs, 4 directions,
// walk cycles, sit/type/sleep poses, chore animations, and pixel speech bubbles.

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
  opencode: "🦫", // Beaver theme (Green button-down / amber hair)
  codex: "🐙",    // Octopus theme (Purple hoodie / violet hair)
  pi: "🐹",       // Hamster theme (Red hoodie / dark hair)
  omp: "🦝",      // Raccoon theme (Charcoal jacket / cyan shirt)
  hermes: "🦉",   // Owl theme (Silver hair / scholar vest)
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

const INSTANCE_VARIANTS = [
  "striped",
  "white-tee",
  "black-dress",
  "variant-4",
  "ada",
  "juno",
  "marshall",
  "theo",
];

/**
 * Maps a character's harness, instance index, facing direction, and action
 * to the exact frame name inside public/atlas/atlas.json.
 */
export function resolveCharacterFrame(
  harness: string,
  facing: Facing,
  action: Action,
  instanceIndex = 0,
  timeMs = 0,
): { frameKey: string; flipX: boolean } {
  // 1. Determine variant
  let variant = harness;
  if (instanceIndex > 0) {
    variant = INSTANCE_VARIANTS[(instanceIndex - 1) % INSTANCE_VARIANTS.length];
  }

  // 2. Map facing
  let dirKey: "down" | "up" | "side" = "down";
  let flipX = false;
  if (facing === "up") {
    dirKey = "up";
  } else if (facing === "down") {
    dirKey = "down";
  } else if (facing === "left") {
    dirKey = "side";
    flipX = true;
  } else if (facing === "right") {
    dirKey = "side";
    flipX = false;
  }

  // 3. Map action and frame tick
  let actionPrefix = "idle";
  let frameIndex = 0;

  switch (action) {
    case "walk": {
      actionPrefix = "walk";
      frameIndex = Math.floor(timeMs / 140) % 4;
      break;
    }
    case "type":
    case "sit":
    case "tv": {
      actionPrefix = dirKey === "up" ? "sit-up" : "sit-down";
      frameIndex = Math.floor(timeMs / 300) % (actionPrefix === "sit-up" ? 4 : 3);
      return {
        frameKey: `staff@${variant}/${actionPrefix}-${frameIndex}`,
        flipX,
      };
    }
    case "sleep": {
      // Resting on bunk bed
      return {
        frameKey: `staff@${variant}/sit-down-0`,
        flipX,
      };
    }
    case "pool":
    case "arcade": {
      frameIndex = Math.floor(timeMs / 200) % 4;
      return {
        frameKey: `staff@${variant}/play-up-${frameIndex}`,
        flipX: false,
      };
    }
    case "exercise": {
      frameIndex = Math.floor(timeMs / 150) % 4;
      return {
        frameKey: `staff@${variant}/exercise-run-${frameIndex}`,
        flipX: false,
      };
    }
    case "read": {
      frameIndex = Math.floor(timeMs / 400) % 3;
      return {
        frameKey: `staff@${variant}/read-down-${frameIndex}`,
        flipX,
      };
    }
    case "cook":
    case "wash": {
      frameIndex = Math.floor(timeMs / 300) % 3;
      return {
        frameKey: `staff@${variant}/eat-down-${frameIndex}`,
        flipX,
      };
    }
    case "idle":
    default: {
      actionPrefix = "idle";
      frameIndex = Math.floor(timeMs / 350) % 4;
      break;
    }
  }

  return {
    frameKey: `staff@${variant}/${actionPrefix}-${dirKey}-${frameIndex}`,
    flipX,
  };
}

/**
 * Resolves an emote to its sprite frame name in public/atlas/atlas.json.
 */
export function resolveEmoteFrame(emote: Emote): string | null {
  switch (emote) {
    case "thumbs_up":
      return "emotes/thumbs-up";
    case "facepalm":
      return "emotes/facepalm";
    case "question":
      return "emotes/question";
    case "exclamation":
      return "emotes/exclamation";
    case "sweat":
      return "emotes/sweat";
    case "heart":
      return "emotes/heart";
    default:
      return null;
  }
}

// Fallback stub for Canvas 2D (if needed in isolated test environments)
export function drawAnimatedCharacter(
  _ctx: any,
  _state: AnimatedSpriteState,
  _now: number,
  _dpr = 1,
): void {
  // Handled by PixiMapRenderer with texture atlas
}
