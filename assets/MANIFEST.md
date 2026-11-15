# Bahay ni Kuya — Asset Manifest

All visual assets, procedural sprite sheets, tilemaps, and audio interfaces used in **Bahay ni Kuya** are documented below in compliance with licensing and distribution policies.

---

## 1. Summary of Licensing

| Category | Source / Author | License | Description |
| :--- | :--- | :--- | :--- |
| **Character Sprites** | Original Procedural Canvas 2D (`public/sprites.ts`, `public/anim.ts`) | **CC0 1.0 Universal** | 5 unique species (Beaver, Octopus, Hamster, Raccoon, Owl), 4 directions, 13 action animations, 6 emotes, instance variants. |
| **Tilemap & Furniture** | Original Procedural Canvas 2D (`public/renderer.ts`, `scripts/generate-map.ts`) | **CC0 1.0 Universal** | 16x16 px floor tiles, walls, bunk beds, CRT monitors, sofa, TV, pool table, arcade, stove, sink, confession spotlight. |
| **Tiled Map Layout** | Generated JSON (`public/map/house.json`) | **CC0 1.0 Universal** | 42x27 orthogonal Tiled map layout covering 7 distinct rooms + connecting checkered hallway. |
| **Icons & Emotes** | Procedural Vector Canvas (`public/anim.ts`) | **CC0 1.0 Universal** | Emote bubbles: thumbs up, facepalm, question, exclamation, sweat drop, heart; Tool icons for CLI harnesses. |
| **Audio / Speech** | Browser Web Speech API (`SpeechSynthesisUtterance`) | **System / Native** | Client-side text-to-speech synthesis without external audio files or trademarked assets. |
| **Fonts** | System monospace stack (`ui-monospace`, `SFMono-Regular`, `Consolas`, monospace) | **System / Native** | Cross-platform monospace pixel rendering with zero external web fonts. |

---

## 2. Character Sprite Specifications

All character sprites are generated dynamically at runtime using Canvas 2D procedural rendering (`public/sprites.ts`), guaranteeing crisp integer scaling (3x) without asset distortion.

### Harness Species & Color Signatures:
1. **OpenCode (`opencode`)**:
   - **Species**: Canadian Beaver (`#d97706` amber fur, `#b45309` shadow, `#fffbeb` front teeth)
   - **Traits**: Broad flat tail, energetic posture, blueprint tool.
2. **Codex CLI (`codex`)**:
   - **Species**: Deep-sea Octopus (`#8b5cf6` violet body, `#6d28d9` shadow, `#ede9fe` suction cups)
   - **Traits**: 6 animated tentacles, fluid typing rhythm.
3. **Pi (`pi`)**:
   - **Species**: Golden Hamster (`#f59e0b` honey coat, `#d97706` cheeks, `#fef3c7` paws)
   - **Traits**: Puffy cheeks, compact size, rapid scurrying.
4. **OMP (`omp`)**:
   - **Species**: Mischievous Raccoon (`#64748b` slate fur, `#1e293b` bandit mask, `#cbd5e1` rings)
   - **Traits**: Masked face, ringed bushy tail, stealthy movements.
5. **Hermes Agent (`hermes`)**:
   - **Species**: Scholarly Barn Owl (`#78716c` taupe plumage, `#f5f5f4` heart face, `#eab308` eyes)
   - **Traits**: Spectacles, feathered tufts, routes to library reading nook when researching.

### Animations:
- **Directions**: `down` (facing camera), `up` (facing north), `left`, `right`.
- **Action States**: `idle`, `walk`, `sit`, `type`, `sleep`, `wash`, `cook`, `tv`, `pool`, `arcade`, `exercise`, `water`, `read`.
- **Emotes**: `thumbs_up` (👍), `facepalm` (🤦), `question` (❓), `exclamation` (❗), `sweat` (💧), `heart` (❤️).
- **Subagents**: Scaled procedural mini-avatars (22px) spawned at parent coordinates.

---

## 3. Map & Furniture Tileset Specifications

16x16 px tiles generated via `public/renderer.ts`:
- **Floors**:
  - GID 1: Bedroom cool night-slate planks (`#8ba1b8`)
  - GID 2: Living room warm golden wood (`#b48455`)
  - GID 3: Office parquet sage wood (`#967554`)
  - GID 4: Kitchen ceramic checkerboard (`#dedad1`, `#cfcac0`)
  - GID 5: Game room mauve felt (`#a66882`, `#985c76`)
  - GID 6: Confession room dark obsidian (`#1b1d24`)
  - GID 7 & 8: Hallway checkered black and white (`#2c2d33`, `#e0dcce`)
  - GID 9: Gym rubber green turf (`#5a825e`, `#507554`)
- **Walls & Doors**:
  - GID 11: Dark navy structural walls (`#1b212f`) with deep top trim (`#10141d`)
  - GID 15 & 16: Door thresholds and frames
- **Furniture**:
  - Bunk beds with blue duvets and wooden frames (GID 31, 32)
  - Nightstands with glowing lamps (GID 33)
  - Modular blue sectional sofas (GID 34, 35, 36)
  - CRT TV console with glowing scanlines (GID 38)
  - Bookshelf with colored spines (GID 39)
  - 8 primary office desks with amber CRT monitors (GID 41)
  - 4 subagent compact desks with green phosphor screens (GID 43)
  - Stainless steel refrigerator (GID 44), stove (GID 45), and sink (GID 46)
  - Dining table with chairs (GID 48, 49)
  - Regulation pool table with green baize felt (GID 50)
  - Retro fighting arcade cabinet and maze arcade cabinet (GID 51, 52)
  - Gym exercise treadmill (GID 53)
  - Potted monstera / ficus foliage (GID 54)
  - Solitary spotlight confession chair (GID 55)

---

## 4. Parody Compliance & Trademark Notice

- **Pinoy Big Brother (PBB) Parody**: Bahay ni Kuya is an independent, non-commercial developer visualization tool inspired by reality TV formats.
- **No Trademarked Assets**: No official logos, sound effects, theme music, or trademarked assets are included or distributed.
- **Original Content**: All Taglish announcement lines (`config/kuya-lines.json`) and audio representations are satirical, original compositions.
