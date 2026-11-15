# Bahay ni Kuya — Asset Manifest

All visual assets, procedural sprite sheets, tilemaps, and audio interfaces used in **Bahay ni Kuya** are documented below in compliance with licensing and distribution policies.

---

## 1. Summary of Licensing

| Category | Source / Author | License | Description |
| :--- | :--- | :--- | :--- |
| **Character Sprites** | Original Procedural Canvas 2D (`public/sprites.ts`, `public/anim.ts`) | **CC0 1.0 Universal** | Human chibi pixel art characters with harness motifs (Beaver, Octopus, Hamster, Raccoon, Owl), 4 directions, 13 action animations, 6 emotes, instance variants. |
| **Tilemap & Furniture** | Original Procedural Canvas 2D (`public/renderer.ts`, `scripts/generate-map.ts`) | **CC0 1.0 Universal** | 16x16 px floor tiles, cutaway navy walls, dual computer desks with monitors, red lounge sofa, green pool table, retro arcade cabinet, water cooler, snack vending machine, conference table, whiteboard. |
| **Tiled Map Layout** | Generated JSON (`public/map/house.json`) | **CC0 1.0 Universal** | 42x27 orthogonal Tiled map layout covering 7 distinct rooms + connecting checkered hallway. |
| **Icons & Emotes** | Procedural Vector Canvas (`public/anim.ts`) | **CC0 1.0 Universal** | Emote speech bubbles: thumbs up, facepalm, question, exclamation, sweat drop, heart; Tool indicators for CLI harnesses. |
| **Audio / Speech** | Browser Web Speech API (`SpeechSynthesisUtterance`) | **System / Native** | Client-side text-to-speech synthesis without external audio files or trademarked assets. |
| **Fonts** | System monospace stack (`ui-monospace`, `SFMono-Regular`, `Consolas`, monospace) | **System / Native** | Cross-platform monospace pixel rendering with zero external web fonts. |

---

## 2. Character Sprite Specifications

All character sprites are generated dynamically at runtime using Canvas 2D procedural pixel rendering (`public/anim.ts`), guaranteeing crisp integer scaling without asset distortion.

### Human Chibi Characters & Harness Motifs:
1. **OpenCode (`opencode`)**:
   - **Motif**: Canadian Beaver amber-gold hair (`#e67e22`), fair skin, emerald green button-down shirt (`#27ae60`), khaki slacks, brown oxford shoes.
   - **Traits**: Side-swept bangs, typing at dual monitors in the open office.
2. **Codex CLI (`codex`)**:
   - **Motif**: Deep-sea Octopus violet anime hair (`#7d44aa`), porcelain skin, dark purple hoodie/sweater (`#4834d4`), charcoal jeans, white sneakers.
   - **Traits**: Wavy fringe, expressive dark eyes, fluid typing rhythm.
3. **Pi (`pi`)**:
   - **Motif**: Golden Hamster peach skin, messy black/dark-brown anime spikes (`#2c3e50`), vibrant red hoodie (`#e74c3c`), blue denim jeans, white sneakers.
   - **Traits**: Playful spikes, energetic movements around game room and kitchen.
4. **OMP (`omp`)**:
   - **Motif**: Mischievous Raccoon charcoal spiky hair (`#34495e`), warm tan skin, charcoal biker jacket with cyan inner shirt (`#2c3e50` / `#00cec9`), black slim pants, skater shoes.
   - **Traits**: Cool stance, stylish dark jacket.
5. **Hermes Agent (`hermes`)**:
   - **Motif**: Scholarly Barn Owl silver/white parted hair (`#dfe6e9`), fair skin, slate gray sweater vest over white collared shirt (`#636e72` / `#f5f6fa`), navy slacks, mahogany shoes, silver spectacles.
   - **Traits**: Round silver glasses, distinguished demeanor, routes to library reading nook.

### Animations:
- **Directions**: `down` (facing camera), `up` (facing north), `left`, `right`.
- **Action States**: `idle`, `walk`, `sit`, `type`, `sleep`, `wash`, `cook`, `tv`, `pool`, `arcade`, `exercise`, `water`, `read`.
- **Emotes**: `thumbs_up` (👍), `facepalm` (🤦), `question` (❓), `exclamation` (❗), `sweat` (💧), `heart` (❤️).
- **Subagents**: Scaled mini-chibi characters (~16px tall) spawned at parent coordinates with soft tether lines.

---

## 3. Map & Furniture Tileset Specifications

16x16 px tiles generated via `public/renderer.ts`:
- **Floors**:
  - GID 1: Bedroom cool slate wooden planks (`#5a6e85`)
  - GID 2: Blue Lounge deep navy square tiles (`#2b4868` / `#243d59`)
  - GID 3: Open Office warm parquet oak wood (`#785338` / `#6c4930`)
  - GID 4: Breakroom clean cream ceramic tiles (`#ded5c6` / `#d2c6b4`)
  - GID 5: Game Room dusty rose / mauve pink tiles (`#a66e85` / `#986278`)
  - GID 6: Confession Room dark obsidian floor (`#181a22`)
  - GID 7 & 8: Hallway high-contrast checkered black and white (`#1a1c22`, `#dedcd5`)
  - GID 9: Conference Room slate steel-blue tiles (`#355474` / `#2d4763`)
- **Walls & Doors**:
  - GID 11: Deep navy structural walls (`#161b26`) with beveled blue-gray top rim (`#2c394f`, `#3e4e6c`)
  - GID 12: Vertical wall column with depth shading
  - GID 21: Door thresholds where hallway floor connects into rooms
- **Furniture**:
  - Oak wood computer desks with silver monitors, keyboard, succulent pot, and white coffee mug (GID 41)
  - Compact subagent terminal desks with green phosphor screens (GID 43)
  - Crimson/ruby cushioned sofa and armchairs with wood armrests (GID 34, 35, 36)
  - Low oak coffee table with ceramic teacups (GID 37)
  - Regulation pool table with dark mahogany rails, brass corners, green felt, cue ball, and cue stick (GID 50)
  - Purple retro arcade cabinet with glowing yellow marquee and CRT game graphics (GID 51, 52)
  - Breakroom water cooler dispenser with blue water jug bottle (GID 47)
  - Blue snack vending machine with glass display window showing snack packages (GID 57)
  - Conference table with open silver laptops and dark green swivel chairs (GID 48, 49)
  - Whiteboard on wall with colorful marker diagrams and sticky notes (GID 55)
  - Kitchen counter with stainless sink, gooseneck faucet, and white refrigerator (GID 44, 46)
  - Bunk beds with blue duvets and nightstand lamps (GID 31, 32, 33)
  - Bookshelves with multi-colored book spines (GID 39)
  - Indoor potted plants in terracotta pots (GID 54)
  - Solitary high-backed confession chair under the spotlight beam (GID 56)

---

## 4. Parody Compliance & Trademark Notice

- **Independent Project**: Bahay ni Kuya is an independent developer visualizer inspired by reality TV house observation formats.
- **No Trademarked Assets**: Zero official logos, trademarks, copyrighted brand names, or protected audio files are used.
- **Original Content**: All Taglish announcement lines (`config/kuya-lines.json`) and art assets are 100% original creations.
