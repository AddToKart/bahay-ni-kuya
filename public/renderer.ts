// 3/4 top-down Canvas 2D pixel renderer for Bahay ni Kuya.
// 16px tiles rendered with depth y-sorting, atmospheric room lighting,
// dynamic phosphor glows, CRT scanlines, and retro CCTV frame overlay.

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
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#5a6e85" : "#4e6075";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(px, py + size - 1, size, 1);
      if (tx % 2 === 0) ctx.fillRect(px + size / 2, py, 1, size - 1);
      break;

    case 2: // Living Room / Blue Lounge: Deep navy-blue square tiles (matching reference image)
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#2b4868" : "#243d59";
      ctx.fillRect(px, py, size, size);
      ctx.strokeStyle = "rgba(22, 36, 52, 0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      break;

    case 3: // Office: Warm golden-brown parquet oak wood (matching reference image)
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#785338" : "#6c4930";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#583a24"; // Plank joint seam
      ctx.fillRect(px, py + size - 1, size, 1);
      if (ty % 2 === 0) ctx.fillRect(px + size / 2, py, 1, size - 1);
      break;

    case 4: // Kitchen / Breakroom: Clean cream ceramic tiles (matching reference image)
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#ded5c6" : "#d2c6b4";
      ctx.fillRect(px, py, size, size);
      ctx.strokeStyle = "rgba(168, 154, 138, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      break;

    case 5: // Game Room: Dusty rose / mauve pink tiles (matching reference image)
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#a66e85" : "#986278";
      ctx.fillRect(px, py, size, size);
      ctx.strokeStyle = "rgba(110, 65, 85, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      break;

    case 6: // Confession Room: Dark obsidian floor
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#181a22" : "#121319";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#0c0d12";
      ctx.fillRect(px, py + size - 1, size, 1);
      break;

    case 7: // Hallway: Checkered black
      ctx.fillStyle = "#1a1c22";
      ctx.fillRect(px, py, size, size);
      break;

    case 8: // Hallway: Checkered white/cream
      ctx.fillStyle = "#dedcd5";
      ctx.fillRect(px, py, size, size);
      break;

    case 9: // Gym & Conference: Slate steel-blue tiles (matching reference image)
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#355474" : "#2d4763";
      ctx.fillRect(px, py, size, size);
      ctx.strokeStyle = "rgba(28, 44, 62, 0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      break;

    // ---------------- WALLS ----------------
    case 11: // Wall Top: Deep navy vertical face with beveled light blue-gray top rim
      ctx.fillStyle = "#161b26"; // Dark navy vertical wall face
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#2c394f"; // Beveled top rim
      ctx.fillRect(px, py, size, 4);
      ctx.fillStyle = "#3e4e6c"; // Highlight edge
      ctx.fillRect(px, py, size, 1);
      ctx.fillStyle = "#10141d"; // Bottom drop shadow
      ctx.fillRect(px, py + size - 1, size, 1);
      if (tx % 2 === 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(px, py + 4, 1, size - 4);
      }
      break;

    case 12: // Wall Side: Navy vertical column
      ctx.fillStyle = "#141822";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#2c394f";
      ctx.fillRect(px, py, 3, size);
      ctx.fillStyle = "#0d1017";
      ctx.fillRect(px + size - 2, py, 2, size);
      break;

    // ---------------- DOORS ----------------
    case 21: // Doorway opening: checkered floor with doorframe molding
      ctx.fillStyle = (tx + ty) % 2 === 0 ? "#1a1c22" : "#dedcd5";
      ctx.fillRect(px, py, size, size);
      ctx.fillStyle = "#2c394f"; // Left frame post
      ctx.fillRect(px, py, 2, size);
      ctx.fillStyle = "#2c394f"; // Right frame post
      ctx.fillRect(px + size - 2, py, 2, size);
      break;

    default:
      break;
  }
}

// Procedural furniture drawings matching the reference visualizer
export function drawFurniture(
  ctx: CanvasRenderingContext2D,
  gid: number,
  px: number,
  py: number,
  size = 16,
): void {
  switch (gid) {
    case 31: // Bunk Bed Top (headboard + pillows)
      ctx.fillStyle = "#4a2c1d"; // Dark wood frame
      ctx.fillRect(px + 1, py + 1, size - 2, size - 1);
      ctx.fillStyle = "#f5f6fa"; // White sheet
      ctx.fillRect(px + 3, py + 5, size - 6, size - 5);
      ctx.fillStyle = "#74b9ff"; // Pillow
      ctx.fillRect(px + 4, py + 3, size - 8, 3);
      break;

    case 32: // Bunk Bed Bottom (blue cozy duvet)
      ctx.fillStyle = "#4a2c1d";
      ctx.fillRect(px + 1, py, size - 2, size - 2);
      ctx.fillStyle = "#2980b9"; // Blue duvet
      ctx.fillRect(px + 3, py, size - 6, size - 4);
      ctx.fillStyle = "#1f618d"; // Quilt crease
      ctx.fillRect(px + 3, py + 4, size - 6, 1);
      break;

    case 33: // Nightstand with lamp
      ctx.fillStyle = "#5c3d26";
      ctx.fillRect(px + 3, py + 3, size - 6, size - 5);
      ctx.fillStyle = "#f1c40f"; // Brass base
      ctx.fillRect(px + 6, py + 2, 4, 1);
      ctx.fillStyle = "#fef9e7"; // Glowing warm lampshade
      ctx.fillRect(px + 5, py, 6, 3);
      break;

    case 34: // Red Sofa Left Armchair (matching reference image)
      ctx.fillStyle = "#991b1b"; // Deep crimson cushion
      ctx.fillRect(px + 1, py + 2, size - 2, size - 3);
      ctx.fillStyle = "#450a0a"; // Wood armrest
      ctx.fillRect(px + 1, py + 1, 3, size - 2);
      ctx.fillStyle = "#b91c1c"; // Cushion highlight
      ctx.fillRect(px + 4, py + 3, size - 6, 3);
      break;

    case 35: // Red Sofa Mid Section (matching reference image)
      ctx.fillStyle = "#991b1b";
      ctx.fillRect(px, py + 2, size, size - 3);
      ctx.fillStyle = "#b91c1c";
      ctx.fillRect(px + 1, py + 3, size - 2, 3);
      ctx.fillStyle = "#7f1d1d"; // Center button tuft
      ctx.fillRect(px + size / 2 - 1, py + 6, 2, 2);
      break;

    case 36: // Red Sofa Right Armchair (matching reference image)
      ctx.fillStyle = "#991b1b";
      ctx.fillRect(px + 1, py + 2, size - 2, size - 3);
      ctx.fillStyle = "#450a0a"; // Wood armrest
      ctx.fillRect(px + size - 4, py + 1, 3, size - 2);
      ctx.fillStyle = "#b91c1c";
      ctx.fillRect(px + 2, py + 3, size - 6, 3);
      break;

    case 37: // Living Coffee Table
      ctx.fillStyle = "#6d4c41"; // Oak table
      ctx.fillRect(px + 2, py + 3, size - 4, size - 5);
      ctx.fillStyle = "#8d6e63"; // Table surface
      ctx.fillRect(px + 3, py + 4, size - 6, size - 7);
      ctx.fillStyle = "#ffffff"; // White ceramic teacups
      ctx.fillRect(px + 5, py + 5, 2, 2);
      ctx.fillRect(px + 9, py + 5, 2, 2);
      break;

    case 38: // TV Console with retro scanlines
      ctx.fillStyle = "#2c1d11"; // Wood chassis
      ctx.fillRect(px + 1, py + 7, size - 2, size - 7);
      ctx.fillStyle = "#1e272e"; // CRT frame
      ctx.fillRect(px + 2, py + 1, size - 4, 7);
      ctx.fillStyle = "#4fc3f7"; // Glowing blue screen
      ctx.fillRect(px + 4, py + 2, size - 8, 4);
      break;

    case 39: // Bookshelf (matching reference image back walls)
      ctx.fillStyle = "#5c3d26"; // Oak bookcase
      ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
      // Row 1 books (red, blue, gold, green)
      ctx.fillStyle = "#e74c3c"; ctx.fillRect(px + 3, py + 3, 2, 4);
      ctx.fillStyle = "#3498db"; ctx.fillRect(px + 5, py + 3, 2, 4);
      ctx.fillStyle = "#f1c40f"; ctx.fillRect(px + 7, py + 3, 2, 4);
      ctx.fillStyle = "#2ecc71"; ctx.fillRect(px + 9, py + 3, 2, 4);
      ctx.fillStyle = "#ecf0f1"; ctx.fillRect(px + 11, py + 3, 2, 4);
      // Row 2 books
      ctx.fillStyle = "#e67e22"; ctx.fillRect(px + 3, py + 8, 2, 5);
      ctx.fillStyle = "#9b59b6"; ctx.fillRect(px + 5, py + 8, 2, 5);
      ctx.fillStyle = "#1abc9c"; ctx.fillRect(px + 7, py + 8, 2, 5);
      ctx.fillStyle = "#e74c3c"; ctx.fillRect(px + 9, py + 8, 2, 5);
      ctx.fillStyle = "#34495e"; ctx.fillRect(px + 11, py + 8, 2, 5);
      break;

    case 41: // Office Desk with Computer Monitor, Plant & Mug (matching reference image!)
      // 1. Warm oak desktop surface (spans 24px width for authentic wide desk)
      ctx.fillStyle = "#4a280c"; // Dark outer wood outline
      ctx.fillRect(px - 4, py + 3, size + 8, size - 4);
      ctx.fillStyle = "#8c5427"; // Rich oak wood top surface
      ctx.fillRect(px - 3, py + 4, size + 6, size - 6);
      ctx.fillStyle = "#b07542"; // Top highlight bevel edge
      ctx.fillRect(px - 3, py + 4, size + 6, 1);
      ctx.fillStyle = "#5d3312"; // Front apron shadow
      ctx.fillRect(px - 3, py + size - 3, size + 6, 1);

      // 2. Modern White / Silver Widescreen Monitor
      ctx.fillStyle = "#ffffff"; // Stand base
      ctx.fillRect(px + 4, py + 8, 8, 2);
      ctx.fillStyle = "#cbd5e1"; // Stand neck
      ctx.fillRect(px + 7, py + 5, 2, 3);
      ctx.fillStyle = "#ffffff"; // Monitor bezel frame
      ctx.fillRect(px + 1, py + 1, size - 2, 6);
      ctx.fillStyle = "#0f172a"; // Dark display screen
      ctx.fillRect(px + 2, py + 2, size - 4, 4);
      // Code syntax highlight lines (amber, green, cyan)
      ctx.fillStyle = "#f59e0b"; ctx.fillRect(px + 3, py + 3, 4, 1);
      ctx.fillStyle = "#22c55e"; ctx.fillRect(px + 8, py + 3, 3, 1);
      ctx.fillStyle = "#38bdf8"; ctx.fillRect(px + 3, py + 4, 6, 1);

      // 3. White keyboard in front of monitor
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(px + 4, py + 10, 8, 2);
      // White mouse on right
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(px + 13, py + 10, 2, 2);

      // 4. White stack of papers / notebook on left
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px - 2, py + 5, 4, 5);
      ctx.fillStyle = "#cbd5e1"; // Binder / ruled lines
      ctx.fillRect(px - 1, py + 6, 2, 1);
      ctx.fillRect(px - 1, py + 8, 2, 1);

      // 5. White Coffee Mug on right
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px + 16, py + 5, 3, 4);
      ctx.fillStyle = "#78350f"; // Coffee inside
      ctx.fillRect(px + 16, py + 5, 3, 1);

      // 6. Succulent plant in white pot (far left corner)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px - 3, py + 10, 2, 2);
      ctx.fillStyle = "#15803d";
      ctx.fillRect(px - 3, py + 9, 2, 1);
      break;

    case 43: // Subagent Compact Desk with green terminal
      ctx.fillStyle = "#6d4c41";
      ctx.fillRect(px + 2, py + 5, size - 4, size - 6);
      ctx.fillStyle = "#2d3436"; // CRT casing
      ctx.fillRect(px + 4, py + 2, 8, 5);
      ctx.fillStyle = "#27ae60"; // Green terminal screen
      ctx.fillRect(px + 5, py + 3, 6, 3);
      ctx.fillStyle = "#2c3e50"; // Keyboard
      ctx.fillRect(px + 5, py + 9, 6, 2);
      break;

    case 44: // Kitchen Refrigerator (matching reference image)
      ctx.fillStyle = "#ecf0f1"; // Clean white body
      ctx.fillRect(px + 2, py + 1, size - 4, size - 2);
      ctx.fillStyle = "#bdc3c7"; // Shadow side & door seam
      ctx.fillRect(px + 2, py + 7, size - 4, 1);
      ctx.fillRect(px + size - 4, py + 1, 2, size - 2);
      ctx.fillStyle = "#7f8c8d"; // Silver door handles
      ctx.fillRect(px + 3, py + 3, 1, 3);
      ctx.fillRect(px + 3, py + 9, 1, 4);
      break;

    case 45: // Kitchen Stove / Range
      ctx.fillStyle = "#2c3e50";
      ctx.fillRect(px + 2, py + 2, size - 4, size - 3);
      ctx.fillStyle = "#ecf0f1"; // Silver knobs
      ctx.fillRect(px + 3, py + 3, size - 6, 1);
      ctx.fillStyle = "#e74c3c"; // Red glowing burners
      ctx.fillRect(px + 4, py + 5, 3, 3);
      ctx.fillRect(px + 9, py + 5, 3, 3);
      break;

    case 46: // Kitchen Sink & Counter
      ctx.fillStyle = "#f5f6fa"; // White counter
      ctx.fillRect(px + 2, py + 3, size - 4, size - 4);
      ctx.fillStyle = "#95a5a6"; // Stainless steel basin
      ctx.fillRect(px + 4, py + 5, size - 8, 5);
      ctx.fillStyle = "#7f8c8d"; // Gooseneck chrome faucet
      ctx.fillRect(px + 7, py + 2, 2, 3);
      ctx.fillRect(px + 6, py + 2, 1, 1);
      break;

    case 47: // Water Cooler Dispenser (matching reference image breakroom!)
      // Transparent blue water jug bottle on top
      ctx.fillStyle = "#29b6f6";
      ctx.fillRect(px + 5, py + 1, 6, 6);
      ctx.fillStyle = "#e1f5fe"; // Bottle highlight
      ctx.fillRect(px + 5, py + 2, 1, 4);
      // White dispenser body
      ctx.fillStyle = "#f5f6fa";
      ctx.fillRect(px + 4, py + 7, 8, 8);
      ctx.fillStyle = "#dcdde1"; // Alcove shadow
      ctx.fillRect(px + 6, py + 9, 4, 4);
      // Red and blue water taps
      ctx.fillStyle = "#e74c3c"; ctx.fillRect(px + 6, py + 9, 1, 2);
      ctx.fillStyle = "#3498db"; ctx.fillRect(px + 8, py + 9, 1, 2);
      break;

    case 48: // Conference / Dining Table (matching reference image!)
      ctx.fillStyle = "#6d4c41"; // Polished wood table
      ctx.fillRect(px, py + 2, size, size - 3);
      ctx.fillStyle = "#8d6e63"; // Tabletop surface
      ctx.fillRect(px, py + 3, size, size - 5);
      // Open Silver Laptop on table
      if (Math.floor(px / size) % 2 === 0) {
        ctx.fillStyle = "#bdc3c7"; // Laptop base
        ctx.fillRect(px + 5, py + 7, 6, 3);
        ctx.fillStyle = "#3498db"; // Glowing screen
        ctx.fillRect(px + 5, py + 4, 6, 3);
      }
      break;

    case 49: // Green Conference Chairs (matching reference image!)
      ctx.fillStyle = "#2e7d32"; // Dark green upholstered seat
      ctx.fillRect(px + 3, py + 4, size - 6, size - 6);
      ctx.fillStyle = "#388e3c"; // Green backrest
      ctx.fillRect(px + 3, py + 2, size - 6, 3);
      ctx.fillStyle = "#1e272e"; // Swivel caster base
      ctx.fillRect(px + 6, py + size - 2, 4, 2);
      break;

    case 50: // Pool Table (matching reference image!)
      // 1. Rich dark mahogany wood frame
      ctx.fillStyle = "#4a2c1d";
      ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
      ctx.fillStyle = "#351e13";
      ctx.fillRect(px + 1, py + size - 2, size - 2, 1);

      // 2. Brass corner pocket accents
      ctx.fillStyle = "#f1c40f";
      ctx.fillRect(px + 1, py + 1, 2, 2);
      ctx.fillRect(px + size - 3, py + 1, 2, 2);
      ctx.fillRect(px + 1, py + size - 3, 2, 2);
      ctx.fillRect(px + size - 3, py + size - 3, 2, 2);

      // 3. Vibrant green baize felt
      ctx.fillStyle = "#27ae60";
      ctx.fillRect(px + 3, py + 3, size - 6, size - 6);

      // 4. Billiard balls (white cue ball, red, yellow, blue)
      ctx.fillStyle = "#ffffff"; ctx.fillRect(px + 5, py + 5, 2, 2);
      ctx.fillStyle = "#e74c3c"; ctx.fillRect(px + 9, py + 6, 2, 2);
      ctx.fillStyle = "#f1c40f"; ctx.fillRect(px + 8, py + 9, 2, 2);

      // 5. Wooden pool cue stick angled across the table
      ctx.fillStyle = "#f5cd79";
      ctx.fillRect(px + 4, py + 10, 8, 1);
      ctx.fillStyle = "#e55039"; // Tip
      ctx.fillRect(px + 11, py + 10, 1, 1);
      break;

    case 51: // Retro Purple Arcade Cabinet (matching reference image!)
      // Deep purple chassis
      ctx.fillStyle = "#4a148c";
      ctx.fillRect(px + 2, py + 1, size - 4, size - 2);
      ctx.fillStyle = "#311b92"; // Side shadow
      ctx.fillRect(px + size - 4, py + 1, 2, size - 2);
      // Glowing yellow marquee at top
      ctx.fillStyle = "#ffee58";
      ctx.fillRect(px + 4, py + 2, size - 8, 2);
      // Glowing CRT screen with pixel graphics
      ctx.fillStyle = "#00e5ff";
      ctx.fillRect(px + 4, py + 5, size - 8, 5);
      ctx.fillStyle = "#e91e63"; // Pixel character on screen
      ctx.fillRect(px + 6, py + 6, 3, 2);
      // Black control panel with red joystick & buttons
      ctx.fillStyle = "#1e272e";
      ctx.fillRect(px + 3, py + 10, size - 6, 2);
      ctx.fillStyle = "#e74c3c"; // Red joystick ball
      ctx.fillRect(px + 5, py + 9, 2, 2);
      ctx.fillStyle = "#f1c40f"; // Push buttons
      ctx.fillRect(px + 9, py + 10, 2, 1);
      break;

    case 52: // Retro Arcade Cabinet 2 (Cyan/Magenta)
      ctx.fillStyle = "#006064";
      ctx.fillRect(px + 2, py + 1, size - 4, size - 2);
      ctx.fillStyle = "#00e5ff"; // Marquee
      ctx.fillRect(px + 4, py + 2, size - 8, 2);
      ctx.fillStyle = "#e91e63"; // Screen
      ctx.fillRect(px + 4, py + 5, size - 8, 5);
      break;

    case 53: // Gym Treadmill
      ctx.fillStyle = "#37474f";
      ctx.fillRect(px + 2, py + 4, size - 4, size - 5);
      ctx.fillStyle = "#212121"; // Running belt
      ctx.fillRect(px + 4, py + 5, size - 8, size - 6);
      ctx.fillStyle = "#00e676"; // Console display
      ctx.fillRect(px + 5, py + 2, 6, 3);
      break;

    case 54: // Indoor Potted Plant (matching reference image lush foliage)
      ctx.fillStyle = "#b76d49"; // Terracotta pot
      ctx.fillRect(px + 4, py + 9, size - 8, 6);
      ctx.fillStyle = "#8d4e2c";
      ctx.fillRect(px + 3, py + 9, size - 6, 2);
      // Layered Monstera/Ficus Green Leaves
      ctx.fillStyle = "#1e7e34";
      ctx.beginPath(); ctx.arc(px + 8, py + 6, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#28a745";
      ctx.beginPath(); ctx.arc(px + 6, py + 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#34ce57";
      ctx.beginPath(); ctx.arc(px + 9, py + 4, 3, 0, Math.PI * 2); ctx.fill();
      break;

    case 55: // Wall Whiteboard with Flowcharts (matching reference image!)
      ctx.fillStyle = "#bdc3c7"; // Aluminum frame
      ctx.fillRect(px, py + 1, size, size - 4);
      ctx.fillStyle = "#ffffff"; // Magnetic board surface
      ctx.fillRect(px + 1, py + 2, size - 2, size - 6);
      // Colorful diagrams & sticky notes
      ctx.fillStyle = "#3498db"; ctx.fillRect(px + 3, py + 4, 4, 2);
      ctx.fillStyle = "#e74c3c"; ctx.fillRect(px + 9, py + 4, 3, 2);
      ctx.fillStyle = "#f1c40f"; ctx.fillRect(px + 4, py + 7, 2, 2); // Yellow sticky note
      ctx.fillStyle = "#2ecc71"; ctx.fillRect(px + 8, py + 7, 3, 1);
      break;

    case 56: // Confession Room Chair
      ctx.fillStyle = "#3e2723"; // High mahogany backrest
      ctx.fillRect(px + 4, py + 1, size - 8, size - 3);
      ctx.fillStyle = "#b71c1c"; // Red leather seat cushion
      ctx.fillRect(px + 3, py + 5, size - 6, size - 7);
      break;

    case 57: // Snack Vending Machine (matching reference image breakroom!)
      // Blue cabinet
      ctx.fillStyle = "#1976d2";
      ctx.fillRect(px + 2, py + 1, size - 4, size - 2);
      ctx.fillStyle = "#0d47a1"; // Shadow edge
      ctx.fillRect(px + size - 4, py + 1, 2, size - 2);
      // Glass display window with colorful snack rows
      ctx.fillStyle = "#e3f2fd";
      ctx.fillRect(px + 4, py + 2, size - 8, 8);
      ctx.fillStyle = "#e74c3c"; ctx.fillRect(px + 5, py + 3, 2, 1); // Chips
      ctx.fillStyle = "#f1c40f"; ctx.fillRect(px + 8, py + 3, 2, 1); // Candy
      ctx.fillStyle = "#2ecc71"; ctx.fillRect(px + 5, py + 6, 2, 1); // Soda
      ctx.fillStyle = "#9b59b6"; ctx.fillRect(px + 8, py + 6, 2, 1);
      // Product delivery flap & coin slot
      ctx.fillStyle = "#212121";
      ctx.fillRect(px + 4, py + 11, size - 8, 3);
      ctx.fillStyle = "#ffeb3b"; // Glowing coin slot
      ctx.fillRect(px + size - 5, py + 8, 1, 2);
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

  // 2. CCTV Corner Brackets (crisp white line brackets matching reference image)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 2;
  const bl = 20; // bracket length
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
    // Default to a focused 2.1x zoom centered on the active house life (office & living)
    this.camera = {
      x: 350,
      y: 160,
      zoom: 2.1,
      targetX: 350,
      targetY: 160,
      targetZoom: 2.1,
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

    // Clear background with deep dark space
    ctx.fillStyle = "#0f1118";
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

    // Confession Room Spotlight effect with breathing pulse
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
    // Soft phosphor monitor glows, CRT TV scanline pulse, bedroom lamps, and arcade marquees
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

    // Arcade Marquee Neon Glows
    const arcGrad1 = ctx.createRadialGradient(31 * tw + 8, 17 * th + 4, 1, 31 * tw + 8, 17 * th + 4, 16);
    arcGrad1.addColorStop(0, "rgba(255, 238, 88, 0.25)");
    arcGrad1.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = arcGrad1;
    ctx.beginPath();
    ctx.arc(31 * tw + 8, 17 * th + 4, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.restore();

    // 6. Draw CCTV Frame & Vignette in screen space
    drawCCTVFrame(ctx, canvasW, canvasH, this.camera.activeCamLabel, now);
  }
}
