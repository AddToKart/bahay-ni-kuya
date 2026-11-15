# Bahay ni Kuya — Asset Manifest

All visual assets, procedural sprite sheets, tilemaps, and audio interfaces used in **Bahay ni Kuya** are documented below in compliance with licensing and distribution policies.

---

## 1. Summary of Licensing

| Category                       | Source / Author                                                                  | License                   | Description                                                                                                                                                                                                                           |
| :----------------------------- | :------------------------------------------------------------------------------- | :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Oddboro Sprite Library**     | New Altitude, Inc. (`github.com/New-Altitude/Oddboro`)                            | **Apache-2.0**            | Curated 16x16 tile and prop sprites from Oddboro: office desks, chairs, computers, plants, lamps, bookshelves, whiteboards, outdoor trees, grass, streetlamps, wall faces and bitmasked caps. See `assets/third-party/oddboro/`. |
| **Original House Pixel Art**   | Original Pixel Art (`assets/house/`)                                             | **CC0 1.0 Universal**     | Hand-crafted 16x16 / 32x32 / 48x32 pixel sprites: bunk beds, confession chair, spotlight, pool table, arcade cabinet, kitchen stove, treadmill, weights rack, sectional couch, TV media unit, checkered floor, emotes, house sign. |
| **Character Sprites**          | Oddboro Base + Original Harness Motifs (`assets/house/`, `public/anim.ts`)       | **Apache-2.0 / CC0**      | Chibi pixel art characters with harness motifs (Beaver, Octopus, Hamster, Raccoon, Owl), 4 directions, walk cycles, typing, sitting, sleeping, and chore animations.                                                                 |
| **Tilemap & Furniture Layout** | Tiled Map (`public/map/house.json`, `scripts/generate-map.ts`)                  | **CC0 1.0 Universal**     | 42x27 orthogonal Tiled map layout covering 8 distinct rooms + connecting checkered hallway + outdoor perimeter.                                                                                                                      |
| **Icons & Emotes**             | Original Pixel Art (`assets/house/emotes.px`, `public/anim.ts`)                  | **CC0 1.0 Universal**     | Emote speech bubbles: thumbs up, facepalm, question, exclamation, sweat drop, heart; Tool indicators for CLI harnesses.                                                                                                               |
| **Audio / Speech**             | Browser Web Speech API (`SpeechSynthesisUtterance`)                              | **System / Native**       | Client-side text-to-speech synthesis without external audio files or trademarked assets. Zero Oddboro audio tracks used.                                                                                                             |
| **Fonts**                      | System monospace stack (`ui-monospace`, `SFMono-Regular`, `Consolas`, monospace) | **System / Native**       | Cross-platform monospace pixel rendering with zero external web fonts.                                                                                                                                                                |

---

## 2. Character Sprite Specifications

All character sprites are compiled into the texture atlas (`public/atlas/atlas.png`) and rendered via PixiJS with nearest-neighbor integer scaling, guaranteeing crisp pixel aesthetics without blur or distortion.

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

- **Directions**: `down` (facing camera), `up` (facing north), `left` (mirrored side), `right` (side).
- **Action States**: `idle`, `walk`, `sit`, `type`, `sleep`, `wash`, `cook`, `tv`, `pool`, `arcade`, `exercise`, `water`, `read`.
- **Emotes**: `thumbs_up` (👍), `facepalm` (🤦), `question` (❓), `exclamation` (❗), `sweat` (💧), `heart` (❤️).
- **Subagents**: Scaled mini-chibi characters (~16px tall) spawned at parent coordinates with soft tether lines.

---

## 3. Map & Furniture Atlas Specifications

Compiled atlas (`public/atlas/atlas.png` + `public/atlas/atlas.json`, 172 sprites, 2,142 frames):

- **Floors**:
  - `floor-oak`: Parquet oak wood planks (Office, Bedroom)
  - `floor-tile`: Clean ceramic floor tiles (Kitchen, Dining)
  - `floor-carpet`: Soft textured carpet (Lounge, Bedrooms)
  - `floor-checkered`: High-contrast obsidian & cream marble tiles (Hallway)
  - `floor-grass`: Lush outdoor grass lawn (Garden, Perimeter)
  - `floor-path`: Garden stone path (Perimeter, Garden)
  - `floor-sidewalk`: Concrete pavement bordering the street
  - `floor-asphalt`: Dark street asphalt with crosswalk stripes
- **Walls & Openings**:
  - `wall-plaster-face`: 2-tile tall interior wall face with depth shading
  - `wall-plaster-window`: Interior windows revealing exterior sky and daylight
  - `wall-plaster-cap`: Complete 16-mask bitmasked wall cap set (`m0` through `m15`)
  - `street-sconce`: Backlit brass wall sconce fixtures
  - `house-sign`: Backlit gold wall sign "BAHAY NI KUYA" on dark walnut plaque
- **Furniture & Dense Props**:
  - `bed-bunk`: Double-decker wooden bunk bed with ladder, pillows, and blue quilts
  - `confession-chair`: Solitary high-backed crimson leather confessional armchair
  - `confession-spotlight`: Ceiling stage spotlight fixture with high-intensity downbeam
  - `pool-table`: Regulation 48x32 billiards table with emerald baize felt, walnut rails, brass pockets, cue ball, and cue stick
  - `arcade-cabinet` & `break-arcade`: Retro arcade machines with glowing marquee and CRT game graphics
  - `kitchen-stove`: Stainless steel stove with 4 burners and glass oven door
  - `kitchen-fridge` & `break-fridge`: Stainless steel and white refrigerators
  - `kitchen-counter`, `kitchen-counter-sink`, `kitchen-counter-end`: Modular kitchen counter unit
  - `kitchen-microwave`, `kitchen-kettle`, `kitchen-coffee`: Small kitchen appliances
  - `kitchen-table` & `kitchen-chair`: Wooden lunch dining table and matching chairs
  - `break-vending`: Vending machine with illuminated beverage/snack display
  - `kitchen-cooler`: Bottled water cooler dispenser with water jug
  - `treadmill` & `gym-treadmill`: Digital cardio treadmills with running belt
  - `weights-rack` & `gym-kettlebells`: Heavy iron dumbbells and kettlebells
  - `gym-bike` & `gym-bench`: Gym exercise cycle and workout bench
  - `couch-sectional` & `break-couch`: Large rust-crimson sectional sofa and lounge chairs
  - `tv-unit` & `break-tv`: Widescreen television media console displaying broadcast scanlines
  - `desk`: Wooden office desks with walnut and ash variants, laptops, monitors, lamps, and mugs
  - `chair`: Ergonomic office swivel chairs with teal, rust, and sage fabric variants
  - `bookshelf` & `library-shelf`: Tall multi-tiered oak bookshelves filled with colorful book spines
  - `whiteboard`: Large collaborative dry-erase whiteboard with colorful marker diagrams
  - `filing-cabinet` & `bin`: Office storage drawers and wastebaskets
  - `park-tree`, `park-tree-large`, `park-pine`: Outdoor shade trees and evergreens
  - `park-bush`, `park-flowers`, `plant-tall`, `plant-small`: Varied indoor and outdoor potted plants
  - `rug` & `library-rug`: Persian and geometric accent rugs

---

## 4. Parody Compliance & Trademark Notice

- **Independent Project**: Bahay ni Kuya is an independent developer visualizer inspired by reality TV house observation formats.
- **No Trademarked Assets**: Zero official logos, trademarks, copyrighted brand names, or protected audio files are used.
- **Excluded Assets**: All 25 Oddboro audio tracks and Oddboro trademarked names/branding have been strictly excluded from this repository.
- **Original Content**: All Taglish announcement lines (`config/kuya-lines.json`) and art assets are 100% original creations.
