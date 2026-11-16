# Visual check — furniture-fix-2

Method: validator v2 (drawn bounds) + opening every `after-*.png` in
`docs/screenshots/furniture-fix-2/` at full size per CCTV view. Before shots are the same
views rendered from the pre-pass map (v1) for comparison.

**Validator status:** `bun run validate-furniture` → 0 violations (drawn rects, no allowlist).
**Structure:** `bun run structure-lock` → OK before and after every change.

## Per-room result

- **Bedroom — pass.** Bunks in two aligned columns; nightstands+lamps sit in one row beside
  the bunks, symmetric; bookshelf flush west, cabinet flush east; SW plant one tile clear of
  the south wall; wall art/clock fully on the wall band. No drawn overlaps or floaters.
- **Living room — pass.** Plant NW clear of the lamp (lamp now on the east wall south of the
  shelf); sofa/coffee-table/TV aligned; armchairs symmetric; rug under the group; wall art on
  the wall band. No drawn overlaps.
- **Office — pass, with HD-1.** Three desk rows aligned, equal spacing; every chair on its
  desk's south seat tile facing the desk; wall board/clock on the band; east-wall units
  stacked without overlap; no plants/shelf overlap. The desk art is two tiles wide with two
  monitors, so the single chair sits on the left monitor's seat tile.
- **Kitchen — pass.** Contiguous counter line (fridge → counter+microwave → stove → sink →
  counter-end+coffee → cooler → vending → bin) with floor under every base; one clock on the
  shared hallway wall (duplicate removed); shelf clear of window/door columns; dining chairs
  in symmetric left/right pairs outside the table's drawn rect.
- **Game room — pass, with HD-3.** Pool table centered (x28..30), arcades adjacent, poster
  clear of the door, bin on the floor, beanbag/plant in corners.
- **Gym — pass, with HD-2/HD-3/HD-4.** Mirror on the wall band clear of the gym door;
  treadmill inside the room with a clear standing tile; bike/weights aligned in the same
  column; garden props untouched.
- **Confession room — pass, with HD-5.** Spotlight moved from mid-air to the wall band; chair
  and light pool centered under it.
- **Whole house / overlay — pass.** G overlay shows prop outlines, nav grid, doors, POIs and
  zero red violations; no prop outline crosses a wall, door or room boundary.

## NEEDS HUMAN DECISION

1. **Dining chairs face the camera while flanking the table (kitchen).** Chairs are drawn in
   symmetric left/right pairs but use the only available kitchen-chair art, which is
   front-facing. Turning them toward the table needs a side/rear-facing kitchen-chair sprite
   variant (art, out of scope for this pass).
2. **Gym mirror vs equipment column are offset by one tile.** The mirror can only occupy
   x38..40 (x37 is the gym door column), while the treadmill/bike/weights must stay at
   x37..38 to avoid the garden props. True alignment needs the gym door or garden layout to
   move (structure / outdoor layout, out of scope).
3. **No water cooler exists in the gym.** The map has no gym cooler prop; adding one would be
   new content. The kitchen cooler was compacted into the kitchen line instead.
4. **Pool table sprite reads small for the room (game room).** It is 3×2 tiles and is now
   centered; scaling it would distort the pixel art (art, out of scope).
5. **Confession spotlight cone does not reach the wall fixture.** The fixture is now attached
   to the wall face row, but the projected cone starts two rows lower. Making the cone
   visually emanate from the fixture is a lighting change (lighting, out of scope).

---

# Phase 2 — PBB flow visuals (fake events)

Evidence: `docs/screenshots/phase-2/` (webp captures from the real page at 1280×900, test port
4777): `01-arrival`, `02-confession-queue`, `03-answer-promote`, `04-guest-office`,
`05-evict-door`, `08-onair`.

## Visible problems still present

1. **ON AIR sign is barely legible.** The 16×16 draft renders as a white/red blob on the wall
   band above the Confession Room door; the red field reads mostly white at 1× camera zoom.
   Fix in the D2 art iteration (larger sign or stronger red field), then re-shoot.
2. **Panel opens before the asker reaches the chair.** The diary panel and queue pill appear
   immediately on `question_asked`, while the housemate is still walking (≈8 s from the front
   door). The Confession Room looks empty for several seconds. Fix: delay panel/ON AIR until the
   asker's `in_confession` char is within arrival distance, or shorten the walk.
3. **Guest is hard to distinguish in the office.** The guest renders as a small subagent beside
   the host with the lanyard badge, but at 1× the tether line is nearly invisible and the badge
   is a few pixels. Fix: thicker/dashed tether and a larger lanyard badge in the D2 iteration.
4. **Scan/watcher session pollutes the demo.** An opencode DB-watcher session (UUID) shows
   "1 working" and fires Kuya task banners during the fake flow ("opencode, may kailangan…").
   Environment artifact of a live opencode DB; P4 replaces the watcher with real control. Not a
   Phase 2 code defect, listed for honesty.
5. **Confession camera framing** includes a wide outdoor strip and the kitchen at the right
   edge. Pre-existing approved camera framing (structure-locked); out of scope here.

## Passed

- Front door renders as a real opening in the south wall; arrival walks through it.
- Suitcase is visible beside the evicted housemate at the door (`05-evict-door`).
- Diary panel: question text, option buttons, free text, queue count, ON AIR header, close.
- Answering through the panel promotes the queued asker (verified by state and screenshot).
- ON AIR sign appears only while the chair is occupied/called.

---

# Phase 4 — real opencode housemates

Evidence: `docs/screenshots/phase-4/` (webp, 1440×1000 viewport, test port 4792):
`after-summon`, `after-summon-2`, `after-permission`, `after-permission-allow`,
`after-permission-answered`, `after-evict`.

## Visible problems still present

1. **Console control row is cramped at 1024 px.** Name, agent, model and Summon wrap onto one
   line; folder, housemate select, Evict and Call wrap onto the next. The model select truncates
   `opencode/mimo-v2.6-flash-free` to `opencode/mimo-v2.6-flash-free` (fits) but 281 options make
   the native dropdown unusable. Fix: a styled summon dialog with searchable model list.
2. **Summon/evict feedback uses browser alerts.** Functional, but it covers the scene; the diary
   panel is the only styled interaction. Fix with the same overlay system.
3. **No agent/model badge on the hover card.** The card still shows harness/state only; the data
   is present in `/state`.
4. **Housemate is hard to spot at 1× zoom in the living room.** The walk-in works, but the sprite
   blends with the rug/sofa. Consider a temporary name tag during `arriving` and after summon.
5. **Header head-count is confusing.** It reads `2 idle · 3 sleeping` with one real housemate
   because it counts harness presences and the opencode scan; not a Phase 4 regression.
6. **No real guest capture.** The guest visual is Phase 2 evidence only; Phase 4 did not create a
   child session, so no new screenshot exists.

## Passed

- Summoned housemate appears in the house; `/state` reaches `idle` from a real session.
- Diary panel shows `permission · hm_…`, the bash command, and **Allow once** / **Reject**.
- Clicking **Allow once** completes the real bash tool (`output: "hi\n"`) and closes the panel.
- Evict removes the session and keeps the worktree and branch.
- ON AIR header, queue line and chat line render without overlap at 1440×1000.
