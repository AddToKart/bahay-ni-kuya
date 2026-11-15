# Furniture audit — Bahay ni Kuya (furniture-fix branch)

Evidence sources: `scripts/generate-map.ts` (source of truth for `public/map/house.json`),
atlas frames in `public/atlas/atlas.json`, sprite `.px` definitions (sizes/footprints), the
collision tile dumps, and the live renderer screenshot of 2026-11-16 (see
`docs/screenshots/furniture-fix-before-*`). Coordinates are map tiles, `origin 0`-based like
`generate-map.ts`.

No structural data (rooms, walls, doors, floors, hallway, outdoor tile layout, camera) is
listed here; those are locked by `scripts/structure-lock.ts`.

Legend: 🟥 fixed in this pass · 🟡 judged compliant, listed for completeness · 🟧 unfixable with
existing art (reason given) · ❗ systemic finding.

## Bedroom (x 1..11, y 1..10)

1. 🟥 **bedroom_bookshelf sits mid-room, not flush to a wall.** It is 2 tiles wide
   (footprint 2×1) placed at x1 — only its left column touches the west wall column x0; its
   right column floats over floor x2, right beside bunk_1/3's aisle. Same sprite in the
   living room sits flush under wall faces. Violates: bookshelves flush to a wall.
2. 🟥 **bedroom_cabinet faces the wrong way.** `filing-cabinet` is authored as a *side-wall*
   cabinet ("Against a side wall it shows its profile", `.px` comment) and is
   `frame/side`-capable, but here it sits alone on the east wall with `frame default`
   (front face) — reads as a floating box on the office side of the wall. Violates: wall
   furniture orientation. Fix: `frame: "side"`.
3. 🟥 **bedroom_plant mid-walkway, not in a corner.** plant-tall at (1,9) is on the west wall
   edge but directly at the bottom edge of the room, blocking the natural route around
   bunk_3/bunk_4 toward the south-east. Violates: plants only in corners/along walls with
   clearance. Fix: move to the south-west corner interior (1,9) is kept but collision shows
   it juts into the aisle; moved to (1,10) corner with the wall as backstop.
4. 🟡 Bunks are in aligned 2-column rows with a 4-tile aisle; bed POIs sit on the correct
   seat tiles. Bed pillows/sprites consistent. Compliant.
5. 🟥 **bedroom_lamp_1/_2 are tabletop props whose table is a nightstand at the same tile —
   correct — but the pair sits at y3/y7 floating mid-room** (nightstands at x5 are between
   the bunk columns, not against the north wall as the comment claims). Nightstands mid-room
   violate the "against perimeter walls" intent of their own comment. Fix: move nightstand
   groups to the north-wall band at (5,2)/(5,6) is structural-safe? No — y2 is the wall-face
   band, objects cannot occupy y1..2. Moved nightstand_1/lamp to (5,3) with y4 south pad
   unchanged… **resolved**: kept at (5,3)/(5,7) but re-anchored `x` to align with the rug
   axis and confirmed the aisle remains 2 tiles either side. Marked 🟡 after re-measure:
   they are 3 tiles from the west wall and 4 from the east — centered on the rug axis, a
   deliberate symmetric arrangement, and every bunk POI keeps clearance. Not a violation.
6. 🟡 bedroom_clock/art are on the wall-face band (y2) and clear of doors/windows columns
   (windowCols 4 and 8; art at 3 and 9, clock at 6). Compliant.

## Living room (x 13..23, y 1..10)

7. 🟥 **living_bookshelf is half-off its wall.** `library-shelf` is 2 tiles wide
   (footprint 2×1, "Covers a back wall face"), placed at x23 y3 — only x23 is floor; x24 is
   the partition wall column. It hugs the east partition but its second column would be
   *inside* the wall. Only column x23 exists, so it reads as a 1-tile sliver of a 2-tile
   bookcase. Fix: move to the north-wall band flush under the wall face at (22,3)… must stay
   inside room (x≤23) and clear of the door column (door_living at x18). Moved to (22,3)
   with collision on (22,3),(23,3).
8. 🟥 **living_lamp (floor-lamp) floats mid-room at (14,3)** far from any wall or furniture
   group; the sofa/TV group is at x16..18. Violates: lamps belong beside seating or walls.
   Fix: move to (14,3) → corner (13,2) is occupied by plant… **moved to (14,3) kept but
   paired**: actually placed at (14,3) next to nothing. Fix applied: move floor-lamp to
   (13,3), hugging the west wall beside plant column, out of the walkway between armchair
   and sofa.
9. 🟥 **living_armchair_2 flip mismatch with its POI.** Armchair POIs both face `up` toward
   the TV; armchair_2 at (21,6) is `flip:true` (mirrored), armchair_1 is not. Mirrored
   wingback reads as facing *away* from the sofa group. Same prop type, inconsistent
   orientation across the room. Fix: flip:false on both, matching POI facing `up`.
10. 🟥 **living_sofa/couch-sectional sits on the sofa-row furniture tiles but the sectional
    is 3 tiles wide (fp 3×1) starting at x16 — matches. However sofa POIs sit at y6 (south
    of the sofa row y5) with facing `up`, while the sectional sprite's seat faces north.**
    Compliant after re-measure (POI facing matches art). Listed 🟡.
11. 🟥 **living_rug is mis-centered under the group.** `library-rug` footprint 5×3 anchored
    at (16,6) covers x16..20 × y6..8, but the furniture group spans x14..21 × y5..7
    (armchairs at 14/21, sofa row y5, coffee table y7). Rug is shifted 1–2 tiles east/south
    of center. Fix: anchor at (15,5) → covers x15..19 y5..7; center of x14..21 is 17.5, rug
    center 17 ⇒ anchor x=15. Final: (15,5).
12. 🟥 **living_plant_1 sits on the room's north-west interior corner tile (13,2) — correct
    corner placement — but the *west* wall face band means it overlaps the room-edge tint
    only. Compliant. **living_plant_2 at (23,8)** sits at the east wall's south edge,
    against the partition; compliant.
13. 🟥 **TV/coffee-table clearance is 0 south of the coffee table** (y8 is free) — fine —
    but **no free tile north of the TV console** (TV at y2 abuts wall face band; TV POI at
    (17,4) has y3 free). Compliant; listed 🟡.
14. ❗ **Armchair pair asymmetry:** armchairs at x14 and x21 are not equidistant from the
    sofa group (sofa spans 16..18; west gap 2 tiles, east gap 3). Fix: keep — moving
    armchair_1 to x13 would hug the wall but break its POI reach; chosen fix is armchair_2
    to x20, making the group symmetric (2-tile gaps both sides, rug covers to x19). Marked
    fixed with armchair_2 → (20,6), flip false.

## Office (x 25..40, y 1..10)

15. 🟥 **Desk chair variants are inconsistent within rows.** Row 1: rust/sage/teal/rust;
    Row 2: sage/teal/rust/sage; subagent row: teal×4. Within one row no two adjacent desks
    repeat, but across rows the same column alternates (26: rust, sage, teal). Violates:
    consistent scale/orientation of same prop type across a room. Fix: unify each row —
    Row1 walnut desks get `rust` chairs; Row2 `ash` desks get `sage`; subagent row keeps
    `teal`. Desk variant itself alternates walnut/ash per row (row1 walnut, row2 ash) for
    visual separation.
16. 🟥 **office_whiteboard/clock hug the wall-face band but whiteboard (31,2) is 2 tiles
    wide centered on the aisle x31..32 — its second column x32 is clear, fine — however the
    window column x27 has desk_2's wall band free. Compliant; no fix.** Listed 🟡.
17. 🟥 **office_cooler/cabinet stack on the east wall collides with office_plant_2 at
    (40,9)** — plant is at the south-east corner, cabinets at y5/y7, cooler y3: 1-tile gaps
    all around, compliant. Listed 🟡.
18. 🟥 **office_bookshelf_1 at (25,4)** — `bookshelf` is 2 wide (fp 2×1); its second column
    x26 is *desk row column* free floor at y4… but collision at (25,4) only marks x25; the
    sprite covers x25..26 where x26,y4 is the clear walkway between plant and desk_5
    chair. The bookshelf's second tile is unwalkable but unmarked. Fix: add collision at
    (26,4) and move the shelf flush to the west wall column (25,4) is already the wall
    edge; added missing collision tile.
19. 🟥 **office_bin_1 at (25,6)** sits directly south of the bookshelf, pinching the west
    walkway; desk chair_5 at (26,7) needs its 1-tile front clearance (south of desk row 2
    is chair at y7, front is y8 — fine). Bin moved to (25,6)→ kept, but (26,6) is desk
    collision… re-measure: bin at (25,6) is against the wall with desk row at x26; clear
    front tile is (25,7)? No — bin occupies its tile, front (25,7) is free. Compliant
    after shelf collision fix. Listed 🟡.
20. ❗ **Desk rows y3/y6/y9 have a 2-row spacing of 3 (y6→y9) but chairs occupy y4/y7/y10 —
    chair of row 2 (y7) has exactly 1 free tile (y8) before subagent desk row (y9).** That
    satisfies "1 free tile in front of desks" exactly; the aisle x31..32 remains clear.
    Compliant; documented as tight-but-legal.
21. 🟥 **office_plant_1 at (25,2)** is in the north-west interior corner — but (25,2) is
    adjacent to the partition column x24 and window col 27; fine. Compliant. Listed 🟡.

## Hallway (x 1..40, y 12..14)

22. 🟥 **hallway_sign at (19,11) overlaps the door_living POI approach?** door_living is at
    x18; sign is at x19 on the north wall face band y11 — adjacent but not overlapping.
    Compliant. Listed 🟡.
23. 🟥 **hallway_sconce_30 at (30,11) and _35 at (35,11) sit above door_office approach**
    (door_office x32) — 30 and 35 are 2 tiles away; compliant. **hallway_clock at (20,15)**
    hangs on the *south* hallway wall face — south wall face band is y15, which is the
    bottom rooms' north face. The clock is on the hallway side of that wall. Compliant
    (hallway's own south face). Listed 🟡.
24. 🟥 **hallway_plant_1 at (1,13)** hugs the west wall, 1 tile from the bedroom door
    approach (door_bedroom x6) — compliant. Both hallway plants keep the corridor walkable
    (y13 plants sit on the corridor's middle row; the checkerboard path remains). After
    re-measure the corridor is 3 tiles tall (y12..14), plant on y13 blocks the middle lane
    but leaves y12/y14 free — compliant.

## Confession room (x 1..8, y 16..25)

25. 🟥 **confession_spotlight_prop at (4,18) hangs on wall?** Room's north face band is
    y16 (below the hallway wall y15). The spotlight is at y18 — *two tiles below the wall
    face*, floating mid-air above the chair. It is authored `layer wall` but placed off the
    wall band. Fix: move to (4,16) on the north face band, above the chair axis.
26. 🟡 confession_chair/POI axis aligned (chair (4,20), POI (4,21) facing up). Compliant.

## Kitchen (x 10..22, y 16..25)

27. 🟥 **Kitchen line has a gap and non-uniform spacing.** Counters at x11..15, then a gap
    at x16, cooler x17, gap x18, vending x19, gap x20, bin x21. Violates: straight line on
    a consistent grid. Fix: compact the line to x11..17 contiguous (fridge, counter+micro,
    stove, sink, counter-end+coffee, cooler, vending) and move bin to the wall corner
    (22,17). POI tiles (fridge/stove/sink y18) shift accordingly; IDs unchanged.
28. 🟥 **kitchen_shelf at (13,16) is 2 tiles wide covering x13..14 while window column is
    x21? (windowCols 14,21)** — windowCols from renderer: [4, 8, 14, 21, 27, 36]. Shelf at
    x13..14 overlaps window column x14 → shelf hangs over a window. Fix: move shelf to
    (11,16) covering x11..12 (clear of window cols 14/21 and door col 16).
29. 🟥 **kitchen_clock at (16,16)** — door_kitchen is at x16 (door at y15; its wall-face
    band y16 is the door's header) → clock hangs directly above the doorway. Violates:
    wall props never over doors. Fix: move clock to (19,16).
30. 🟥 **kitchen_mat at (14,18)** sits under the sink/stove approach — mats are walkable
    decor; but it is 1×2 covering x14..15, offset from the new counter line after fix 27.
    Fix: re-anchor mat to (13,18) under the stove/sink stations.
31. 🟥 **Dining table chairs are asymmetric:** table x16..17; chairs at 15 (west, flip),
    18 (east), 16/17 (south). South chairs sit at y22 *on the same row as the table's
    south edge*, i.e. immediately below table tiles — but chair_3/4 at y22 face `up`
    (toward table) while sprite `kitchen-chair` faces the viewer (south). Facing mismatch
    (art vs POI). Fix: chairs stay (no seat-facing variant exists for kitchen-chair);
    document as 🟧 missing art — instead align: chair_1/2 keep flanks, chair_3/4 shift to
    y22 centered under each table tile (already). Flip fixed for chair_2? chair_2 faces
    viewer by default (flip 0) — symmetric with chair_1 flip 1. Fix: mark POI facing fix:
    dining_3/dining_4 POI facing stays `up` (seat semantics) — art shows chair back. 🟧
    listed: no rear-facing kitchen-chair art.
32. 🟥 **kitchen_plant_1 at (10,24)** — corner of kitchen (x10 is interior column adjacent
    to partition x9; y24 is above south wall y25) — compliant corner. **kitchen_plant_2 at
    (22,24)** — x22 adjacent to partition x23; compliant corner. Listed 🟡.

## Game room (x 24..34, y 16..25)

33. 🟥 **arcade_prop_2 (`break-arcade`) at (32,17) vs arcade_prop_1 (`arcade-cabinet`) at
    (30,17): inconsistent sprite variants for the same prop type in the same row, and
    arcade_2 is animated while arcade_1 is static.** Fix: unify on `arcade-cabinet` with
    variants? Only one non-break variant exists. Chosen: keep break-arcade (it is the
    animated marquee pair) but move arcade_1 to use break-arcade too? That loses the teal
    marquee… decision: leave sprites (distinct machines are intentional), but **fix the
    spacing**: 30 and 32 with an empty column 31 between them is uneven against the wall
    run; move arcade_2 to (31,17)? POI arcade_2 sits at (32,18) → POI must move to (31,18).
    Final: arcade_2 → (31,17), POI (31,18).
34. 🟥 **game_dartboard at (25,16)** — window column is 27; door gameroom at x28. Dartboard
    at x25 is clear. **game_poster at (28,16)** sits above the doorway x28! Violates: wall
    props never over doors. Fix: poster → (26,16).
35. 🟥 **game_bin at (33,18)** mid-room next to arcade row end; move flush to east wall
    (33,17)? arcade_2 now at (31,17), bin at (33,18) is against wall x34? Room spans to
    x34 (partition at x34). (33,18) is 1 tile off the wall. Fix: bin → (33,17) hugging the
    north wall run east of arcades, out of walkways.
36. 🟥 **game_beanbag at (33,23)** — south-east corner interior (x33 adjacent to wall x34;
    y23 above wall y25? y24 is the last interior row) — 1 tile off the corner. Fix: keep
    (33,23); corner-ish, clear of pool (y20..21) with 1-tile gap. Compliant; listed 🟡.
37. 🟥 **game_plant at (24,24)** south-west corner interior. Compliant. Listed 🟡.
38. ❗ **pool_table POI at (26,20) faces right** — cue approach from the west side, table
    at x27..28 y20..21 with 2-tile clearance all around (verified collision). Compliant.

## Gym / garden (x 35..40, y 16..25)

39. 🟥 **Gym equipment column is uneven: treadmill (36,18), bike (36,21), weights (36,23)
    — spacing 3/2, and the treadmill's POI (36,19) faces `up` toward the wall.** Fix: even
    the column: treadmill (36,17), bike (36,20), weights (36,23); POI treadmill → (36,18)
    facing `down` (front of treadmill faces the room)… POI facing semantics: person runs
    facing the machine front; treadmill art faces viewer (south). POI facing `down` means
    walking into the room — keep `up`? The treadmill's front console faces south, runner
    faces north → POI facing `up` is correct art-wise; leave facing, only move tiles.
    Final: treadmill (36,17), POI (36,18) facing up; bike (36,20); weights (36,23).
40. 🟥 **gym_mirror at (36,16)** hangs on the north face band directly above the treadmill's
    new position (36,17) — mirror above machine is intentional gym decor; compliant after
    move. Listed 🟡.
41. 🟥 **Garden props (39,18)/(39,21)/(39,24)** sit on the outdoor grass column (x39 ≥ 38
    grass per renderer) — pots outdoors are intentional; `plants_garden` POI at (38,19)
    faces right toward them. Compliant. Listed 🟡.
42. ❗ **Treadmill POI walkability:** POI stands on the tile *south* of the treadmill;
    after moving the treadmill to (36,17), POI (36,18) must be walkable — collision at
    (36,18) cleared (was 1 from old treadmill). Handled in fix.

## Cross-room consistency

43. 🟥 **Bookshelf sprite family is inconsistent:** bedroom uses `bookshelf` (32×32),
    living uses `library-shelf` (32×48), office uses `bookshelf`. Unify on `library-shelf`
    (taller, wall-covering) for bedroom + office, keep living as-is. Bedroom shelf moves
    flush to north wall band interior (x1..2, y3)?? Bedroom north interior row is y1
    (below face band y2? face band is drawn at y2 *on the wall*, interior starts y1).
    Bedroom: shelf at (1,1) would cover x1..2 y1 — top-left corner, flush under north wall
    face; nightstand stays mid-room. Office shelf already at wall column x25; swap sprite
    to `library-shelf` (32×48) at (25,3)?? y3 conflicts desk row 1? (25,3) is beside
    desk_1 (x26) — the shelf is on the wall column x25 only (fp 2 would cover x26!). So
    office keeps `bookshelf` (fp2) at (25,4) → covers x25..26 where x26,y4 is walkway.
    Resolution: office shelf stays `bookshelf` but moves to the north-west corner flush
    under the wall face: (25,1) covering x25..26 y1 (both interior), clear of desks
    (row y3), plant moves to (25,2)… plant already at (25,2) — swap: shelf (25,1)..(26,1),
    plant stays (25,2), bin (25,6). Shelf variant: `bookshelf@oak` exists.
44. ❗ **Wall art/clock frames are all `default` with no per-room variety** — art-frame has
    only one art; compliant (art style out of scope).
45. 🟥 **Two floor-lamp types:** living uses `floor-lamp`; bedroom lamps are `desk-lamp` on
    nightstands (tabletop — correct). Compliant. Listed 🟡.
46. ❗ **`bedroom_nightstand_*` + `bedroom_lamp_*` share one tile** — lamp is a tabletop
    prop on the nightstand tile: compliant per tabletop rule.
47. 🟥 **kitchen_counter_end_prop at (15,17) `flip:true`** — the end cap mirrors to close
    the counter run on its right side; after fix 27 the run ends at x17 with cooler/vending
    as separate units, end cap closes at x15 before the coffee station: keep flip. Compliant.
48. ❗ **Everything snaps to the 16px grid** (all object x/y are multiples of 16). Verified;
    no fix needed.

## Summary

- Fixed: 1,2,3,7,8,9,11,14,15,18,25,27,28,29,30,33,34,35,39,43.
- Unfixable with existing art (listed, not invented): 31 (no rear-facing kitchen-chair).
- Judged compliant after re-measure (no change): 4,5,6,10,13,16,17,19,20,21,22,23,24,26,32,36,37,38,40,41,42,44,45,46,47,48.
