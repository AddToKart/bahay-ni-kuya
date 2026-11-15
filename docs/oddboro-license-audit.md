# Oddboro License Audit

**Date**: 2026-11-16  
**Audited Repository**: `github.com/New-Altitude/Oddboro` (Cloned locally from commit `main`)  
**Auditor**: Bahay ni Kuya Implementation Agent  

---

## 1. Executive Summary

Oddboro is an open-source virtual office simulator developed and published by **New Altitude, Inc.**
The repository contains code, procedural/text-defined pixel art (`.px` format), room templates, sound, and brand assets.

- **Source Code & Pixel Art Assets**: Licensed under the **Apache License 2.0** (`LICENSE`).
- **Audio Assets**: Explicitly **excluded** from Apache 2.0 under `LICENSE-ASSETS` (all 25 music tracks in `apps/office/static/audio/` and `apps/site/static/audio/` are proprietary).
- **Trademarks & Branding**: The "Oddboro" name, glowing pixel "O" roundel, and brand signage are **excluded** per Apache 2.0 Section 6 and `CONTRIBUTING.md`.

---

## 2. Permitted Reuse (Apache-2.0)

The following components from Oddboro are licensed under Apache 2.0 and may be reused in `bahay-ni-kuya`:

1. **Sprite & Tile Data (`packages/sprites/src/`)**:
   - Floor tiles: oak plank (`floor-oak.px`), tile (`floor-tile.px`), carpet (`floor-carpet.px`), rubber gym floor (`floor-rubber.px`), grass (`floor-grass.px`), path (`floor-path.px`), water, crosswalk, sidewalk, curbs.
   - Wall tiles: plaster wall faces, plaster caps (all 16 bitmask frames `m0`–`m15`), teal accent walls, brick walls, wall windows, and wall doors.
   - Props (`packages/sprites/src/props/`):
     - **Office**: Desks (`desk-oak`, `desk-corner`, `desk-standing`), task chairs (`chair-office`), bookshelves (`shelf-wood`, `shelf-metal`), filing cabinets (`filing-cabinet`), whiteboards (`whiteboard`), corkboards, desk lamps, paper trays, trash bins, water coolers.
     - **Breakroom**: Kitchenette counter, coffee maker, water cooler, snack vending machine, dining table (`table-lunch`), dining chairs (`chair-lunch`), refrigerator, mugs.
     - **Lounge & Library**: Sofas (`couch`, `couch-leather`), armchairs (`armchair-teal`), low coffee tables, rugs (`rug-amber`, `rug-teal`), reading lamps, globe, plants (`plant-potted`, `plant-fiddle-leaf`, `plant-snake`).
     - **Outdoors & Street**: Trees (`park-tree`, `park-tree-large`, `park-pine`), bushes, hedges, street lamps, benches, planters, bike racks, sidewalk tiles.
   - Character body foundations (`packages/sprites/src/characters/staff.px`, `looks/`):
     - 16×32 human chibi body rigs, directional walk/sit/type frames, hairstyle silhouettes, and palette definitions.

2. **Compilation Tooling (`packages/sprites/scripts/compile.ts`, `src/px.ts`, `src/png.ts`)**:
   - The `.px` compiler that converts plain-text ASCII pixel art into a PixiJS-compatible packed texture atlas (`atlas.png`, `atlas.json`, and `meta.json`).

---

## 3. Strict Exclusions & Prohibitions

The following assets must **NEVER** be imported or used in `bahay-ni-kuya`:

1. **Audio Tracks (`apps/office/static/audio/`, `apps/site/static/audio/`)**:
   - All 25 audio tracks are reserved by New Altitude, Inc. under `LICENSE-ASSETS`.
   - *Status*: **Zero audio files copied.** `bahay-ni-kuya` uses native browser Web Speech API for TTS and no background music tracks.

2. **Oddboro Trademark, Logos & Brand Mark (`scripts/mark.ts`, `logo.png`, `lobby-sign`)**:
   - Apache 2.0 Section 6: *"This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor..."*
   - `CONTRIBUTING.md`: *"The license covers the code, not the Oddboro name. A fork needs a name of its own."*
   - Specific branded sprites:
     - `lobby-sign.px`: Spells "ODDBORO" in backlit aqua letters.
     - `street-front-door.px`: Spells "ODDBORO" on the awning.
     - `street-bus-shelter.px`: Contains the glowing "O" roundel poster.
   - *Status*: **Excluded.** Custom signs in `bahay-ni-kuya` will use Pinoy Big Brother / Bahay ni Kuya parody styling ("BAHAY NI KUYA") and will never contain "Oddboro" or its logo.

---

## 4. Legal Obligations & Compliance Checklist

When incorporating Apache 2.0 assets from Oddboro into `bahay-ni-kuya`:

| Requirement | Apache 2.0 Clause | Implementation in `bahay-ni-kuya` |
| :--- | :--- | :--- |
| **Include License** | Section 4.a | Include full text of Apache License 2.0 in `assets/third-party/oddboro/LICENSE`. |
| **Notice & Attribution** | Section 4.d | Reproduce Oddboro's `NOTICE` file in `assets/third-party/oddboro/NOTICE` and credit New Altitude, Inc. in root `NOTICE` and `README.md`. |
| **State Changes** | Section 4.b | Mark all copied or modified files with prominent notices documenting changes made. |
| **Preserve Copyrights** | Section 4.c | Preserve original copyright headers on all imported `.px`, `.ts`, and JSON files. |
| **No Trademark Use** | Section 6 | Strip or redraw all "ODDBORO" logos and signs. |

---

## 5. Audit Conclusion

All sprite definitions (`.px`), tiles, and props in `packages/sprites/src/` are fully licensed under Apache License 2.0 and are free to reuse, modify, and distribute commercially or non-commercially under Apache 2.0 terms.

Audio files and branding are strictly excluded. The licensing status is unambiguous and cleared for reuse under the documented terms.
