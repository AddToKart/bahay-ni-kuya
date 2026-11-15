# Visual Analysis: Oddboro Aesthetic & Technical Benchmark

**Benchmark Repository**: `github.com/New-Altitude/Oddboro` (Apache-2.0)  
**Target Application**: `bahay-ni-kuya` (3/4 cutaway pixel-art visualizer)  
**Date**: 2026-11-16  

---

## 1. Key Visual Pillars: Why Oddboro Looks Like a Real Game

Oddboro achieves its cohesive, high-end pixel aesthetic through strict technical constraints, consistent materials, high prop density, and warm ambient lighting. Unlike programmatic diagrams or flat schematics, it reads as a living isometric/cutaway dollhouse.

```
+-------------------------------------------------------------+
|                      OUTDOOR GROUNDS                        |
|  (Lush green grass, pine & deciduous trees, park benches)   |
|                                                             |
|   +-------------------+  +-------------------------------+  |
|   |   BEDROOM / GYM   |  |     OFFICE & WORKSPACE        |  |
|   |  - Plaster walls  |  |  - 2-tile tall back walls     |  |
|   |  - Rubber/wood    |  |  - Windows showing outdoor sky|  |
|   |  - Bunks/weights  |  |  - Desks, laptops, lamps, mugs|  |
|   |  - Wall lamps     |  |  - Whiteboards, plants, rugs  |  |
|   +---------+---------+  +---------------+---------------+  |
|             |                            |                  |
|             |    CHECKERED HALLWAY       |                  |
|             |   - Bitmasked wall caps    |                  |
|             |   - Seamless door cutouts  |                  |
|             |   - Wall sconces & clocks  |                  |
|   +---------+---------+  +---------------+---------------+  |
|   |  KITCHEN / LOUNGE |  |     GAME ROOM / CONFESSION    |  |
|   |  - Cream tile     |  |  - Rose/slate carpets         |  |
|   |  - Sinks & fridge |  |  - Pool table & arcade cab    |  |
|   |  - Vending machine|  |  - Confession chair & spot    |  |
|   +-------------------+  +-------------------------------+  |
+-------------------------------------------------------------+
```

---

## 2. Measurable Metrics & Hard Constants

| Parameter | Oddboro Value | Bahay ni Kuya Adaptation | Notes |
| :--- | :--- | :--- | :--- |
| **Tile Grid Size** | `16 x 16 px` | `16 x 16 px` | Fundamental grid unit for collision, navigation, and floors. |
| **Native Render Scale** | `3x` (48px / tile) | `3x` (optional 2x–4x zoom) | Nearest-neighbor integer scaling (`image-rendering: pixelated`). |
| **Character Dimensions** | `16 x 32 px` box | `16 x 32 px` box | Footprint `1 x 1` tile, origin at `0, 16`. Character stands ~26px tall. |
| **Head Proportions** | `12 x 10 px` | `12 x 10 px` | Chibi head ratio: expressive 2×3 anime eyes with 1px catchlight. |
| **Palette Size** | 88 distinct hex colors | 88 shared colors (`oddboro`) | Unified palette across all props, walls, tiles, and characters. |
| **Wall Face Height** | `32 px` (2 vertical tiles) | `32 px` (2 vertical tiles) | Top 24px wall surface, bottom 8px baseboard/trim. |
| **Wall Cap Height** | `16 px` (1 tile) | `16 px` (1 tile) | 16 autotile bitmask frames (`m0` to `m15`) with outline `k`. |
| **Window Sill Line** | Rows 21–23 of face | Rows 21–23 of face | Translucent glass (`/` and `(`) allowing outdoor/sky layer to show. |
| **Baseboard Line** | Rows 28–31 of face | Rows 28–31 of face | Dark walnut line (`w` / `W`) grounding walls to floor tiles. |
| **Outdoor Buffer** | 4–6 tiles perimeter | 4–6 tiles perimeter | Framed by grass, trees, sidewalks, and street lamps. |

---

## 3. Shading, Outlines, and Lighting Conventions

### A. Universal Light Source
- **Direction**: Light strictly originates from the **upper-left** (10:30 angle).
- **Rule of Three**:
  - **Top surface**: Lightest tone (`P` plaster, `o` oak, `m` metal).
  - **Front vertical face**: Mid body tone (`p` plaster, `O` oak, `M` metal).
  - **Right & underside**: Dark shadow tone (`q` plaster, `1`/`2` oak, `5` metal).
- **Single-Pixel Highlights**: Rounded objects (mugs, lamp shades, hair crests) carry exactly **one** highlight pixel at the top-left corner—never a continuous streak.

### B. Outline Hierarchy
- **Outer Silhouettes**: 1px continuous outline in key `k` (`#14121f`). Only `k` touches the floor.
- **Interior Seams**: Separated by material-specific shadow tones (`2` for oak plank seams, `W` for walnut shelf dividers) or soft dark `K` (`#28233a`). **Never** use outer `k` internally, which splits objects visually.
- **Floors & Wall Faces**: Zero outlines. Wall caps carry `k` along open edges to define the cutaway boundaries.

### C. Dynamic Ambient Lighting Directives
- **Warm Emitters** (Desk lamps, sconces, nightstands):
  - Tint: `#ffd27a` (Warm Amber)
  - Radius: ~48 px (3 tiles)
  - Intensity: 0.85 – 1.0
- **Cool Emitters** (Monitors, terminals, TV screens, water dispensers):
  - Tint: `#63dccf` (Teal Aqua)
  - Radius: ~32 px (2 tiles)
  - Intensity: 0.65 – 0.75
- **Light Occlusion**: Light pools inside rooms and illuminates interior vertical faces without bleeding across outer wall caps.

---

## 4. Architectural Composition: Rooms & Floor Plans

### A. Modular Room Stamps
Oddboro constructs its world from reusable room templates containing:
1. **Wall Style**: `wall-plaster` (cream/warm), `wall-teal` (accent), `wall-brick`.
2. **Floor Material**: `oak` (open workspaces), `tile` (kitchen/breakroom), `carpet` (lounges), `rubber` (gyms), `grass` (outdoors).
3. **Wall Grid**:
   - `W`: Solid 2-tile tall back wall face.
   - `N`: Window opening with translucent panes.
   - `D`: Walkable doorway opening.
   - `.`: Interior floor tile.
4. **Prop Layering**:
   - `layer floor`: Rugs and floor mats (always `walkable`, rendered immediately above floor tiles).
   - `layer object`: Furniture (desks, couches, chairs, arcade cabinets, beds, pool table).
   - `layer wall`: Wall clocks, framed paintings, whiteboards, corkboards, wall sconces.
   - `zbias`: Nudges draw order within identical Y elevations (`zbias -1` for chairs facing camera so sitting characters draw on top; `zbias 1` for chairs facing away so backrests draw in front of character).

### B. Depth-Sorting & Y-Sorting
- Objects are sorted strictly by their footprint base line (`y + footprint.h * 16`).
- Characters dynamically step in front of desks, behind conference chairs, and around pool tables without clipping or popping.

---

## 5. Summary of Technical Requirements for Bahay ni Kuya

1. **Move to PixiJS**:
   - Leverage PixiJS 8 (or 7) for texture atlas management, sprite batching, integer pixel-perfect camera scaling, and smooth 60 FPS performance.
2. **Atlas-Driven Pipeline**:
   - Pre-compile Oddboro-compatible `.px` files and original house assets into `atlas.png`, `atlas.json`, and `meta.json`.
3. **Autotile Bitmasking**:
   - Render 16-mask wall caps (`m0`–`m15`) and 8-direction floor edges (`fx-edge-oak`, `fx-edge-tile`, `fx-edge-carpet`) for seamless cutaways.
4. **Prop & Room Density**:
   - Eliminate barren rooms. Furnish the house with authentic rugs, desk plants, paper stacks, coffee mugs, wall clocks, and bookshelves.
5. **Preserve Wire Protocol & Tests**:
   - Ensure `SessionState`, `A*` navigation, POI scheduler, task dispatcher, MCP wrapper, and all 35 tests continue passing without regressions.
