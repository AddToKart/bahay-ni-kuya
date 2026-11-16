# Phase 1 — Visual stabilization (branch `furniture-fix-2`)

Status: **delivered at audit time** (see `docs/STATE.md` §3, §7 and the commit trail
`fd5d129 → 39df6e2`); this document records the as-built design, the verification evidence, and
the residual tasks. The spec's branch name and scope match what exists on disk; nothing here
re-opens closed work unless verification fails.

## Goal and why it matters

The previous furniture pass reported 0 violations while the screen still showed floating and
overlapping props, because the validator checked 1×1 tile footprints instead of drawn sprite
rectangles, and the agent dismissed findings itself ("judged compliant"). Phase 1 makes the
validator look at what is actually rendered, gives a safe dev-only editing surface, and locks the
loop (edit → validate → screenshot → fix) so later phases inherit a visually stable house.

## Prerequisites and dependencies

- Phase 0 audit complete (this branch). No dependency on other phases; Phases 2+ depend on P1.
- Validators available: `bun run structure-lock`, `bun run validate-furniture`, `bun test`.

## Standing rules (verbatim from master-plan §1)

Rules 1–11 apply. Specific to P1: Rule 2 (structure lock), Rule 3 (no new art invented — the one
art gap found is listed, not invented), Rule 5 (no judged-compliant escapes), Rule 6 (visual
proof), Rule 7 (endpoint security for the save endpoint). (Rule 11 is irrelevant to P1: no
sessions or agents are touched.)

## Ordered task list

| ID | Task | Files | Status at audit |
| --- | --- | --- | --- |
| P1-T1 | Compute every prop's DRAWN rectangle from atlas meta (`public/atlas/meta.json`: `width,height,origin,footprint`), converted to tile space; anchors: object/wall props anchor top-left at tile origin; flip mirrors in place and never moves the rect | `scripts/validate-furniture.ts` | done (validator v2 header + `drawn` map) |
| P1-T2 | FAIL on overlapping drawn rects of floor props, with exactly three flagged pair exemptions: tabletop item fully on its carrier (table/desk/counter), rug under furniture, chair tucked into the desk's seat tile | `scripts/validate-furniture.ts` (`overlaps`, `rug`, `tabletopOn`, `chairOnDesk`) | done |
| P1-T3 | FAIL on wall-type props (clock, whiteboard, poster, picture/art, window, wall shelf, wall lamp, spotlight, mirror — the `WALL_PROPS` set) not fully inside their own room's north-wall face band (band rows 1..2 top rooms, 15..16 bottom, 11/15 hallway faces) or crossing walls, doors, archways | `WALL_PROPS`, band math in the `layer === "wall"` branch | done |
| P1-T4 | FAIL on floor props whose drawn rect crosses a wall edge, room boundary, door or archway, or whose base is not on a floor tile of its room | room-bounds loop, `wall-overlap`, `door-overlap`, `room-boundary` rules | done |
| P1-T5 | FAIL on tabletop props not fully on a table, desk or counter drawn rect (`TABLETOP` × `CARRIER` `contains`) | `tabletop` rule | done |
| P1-T6 | FAIL on tall props (plants, lamps, shelves) visually overlapping another prop — covered by the universal drawn-overlap rule (documented equivalence, no separate allowlist) | `drawn-overlap` rule | done |
| P1-T7 | FAIL on missing 1-tile clearance in front of desks, sofas, beds, counters, machines (`CLEARANCE` set: desk, couch-sectional, bed-bunk, kitchen-fridge/stove/counter*/cooler, break-vending, treadmill, pool-table, kitchen-table) | `clearance` rule | done |
| P1-T8 | FAIL on chairs not centered on the desk's seat tile, not facing it (POI facing must be `up` for office/subagent desk chairs), or differing in offset within a desk row | `chair-desk`, `chair-center`, `chair-row`, `chair-facing` rules | done |
| P1-T9 | FAIL on props off the 16px grid | `grid` rule | done |
| P1-T10 | FAIL on unreachable POIs (standing tile or facing-approach tile solid; door tiles must be walkable) | `poi-blocked` rule | done |
| P1-T11 | G overlay draws DRAWN rectangles (yellow) + nav solid tiles (red), doors (cyan), POIs (green + ids), violations (red + rule/prop labels), selection rect (cyan) | `public/renderer.ts refreshDebugOverlay` | done |
| P1-T12 | Dev-only layout editor on key E: click-select via `propAt`, arrow keys move one tile, drag with grid snap, R rotates/flips between existing sprite variants (variants cycle first, else flip), Delete removes, Ctrl+Z/Ctrl+Y undo/redo (60-deep) | `public/layout-editor.ts` | done |
| P1-T13 | Live red highlight from the SAME validator in the editor HUD + G overlay while editing | `layout-editor.violations()` → `furniture-validate.ts` mirror | done |
| P1-T14 | Save writes ONLY furniture-related layers (props objectgroup + mirrored top-level props + regenerated collision); timestamped backup to `docs/layout-backups/` first; refuses to save when the structural hash would differ from `docs/structure-baseline.json`; atomic write (tmp + rename); nav regenerates from collision on reload | `src/layout.ts saveLayout` | done |
| P1-T15 | Nav regen correctness: collision rebuilt from walls/doors + prop footprints (walkable meta respected); A* grid is built from the collision layer at load, so regen is implicit | `src/layout.ts buildCollision` | done |
| P1-T16 | Endpoint rules from Global Rule 7: `POST /api/layout/save` is loopback-bound, Host/Origin-checked, Bearer-token-gated, 1 MB body cap | `src/server.ts`, `src/security.ts` | done (partial — rate limit + audit log missing; closed by P4-T30/31) |
| P1-T17 | Fix every validator failure with the smallest change; keep all POI IDs working (fixes touched only prop x/y/variant/flip and POI coords, never ids) | `scripts/generate-map.ts`, `public/map/house.json` | done (20 prop fixes, `docs/furniture-audit.md`) |
| P1-T18 | Known visible problems resolved or listed: living floor-lamp vs plant; office NW bookshelf/plant/bin; bedroom SW plant + stools/lamps; kitchen clock ×2 + wall-pinned bin/cup; dining chair alignment (missing rear-facing sprite listed); confession spotlight floating; game room pool scale + floaters; gym equipment alignment | `docs/furniture-audit.md` items 1–48, `docs/visual-check.md` | done (5 items listed as NEEDS HUMAN DECISION, see master-plan D11) |
| P1-T19 | Visual proof per Rule 6: before/after per CCTV view in `docs/screenshots/furniture-fix-2/`, `docs/visual-check.md` written from opened AFTER images | screenshots dir | done |
| P1-T20 | Out of scope (respected): structure, doors, camera, server, protocol, behavior, art | — | respected (spotlight cone, mirror offset, chair art, pool scale, gym cooler all listed, not "fixed") |

## Data formats

- Validator input: `public/map/house.json` (`props` objectgroup entries with properties
  `sprite,frame,variant,layer,flip`; `pois` objectgroup with `room,facing,label,action,tags`)
  + `public/atlas/meta.json` `sprites` map. No new files.
- Violation shape (`Violation`): `{prop: string, room: string, tile: [number, number], rule:
  string, detail: string}`; exit 1 prints `  - [rule] prop (room) @ (x,y): detail`.
- `LayoutProp` (save payload): `{id: string, sprite: string, x: int, y: int, variant?: string,
  frame?: string, layer?: "object"|"floor"|"wall", flip?: boolean}`.
- Save response: `{ok: true, backup: string, props: number}`; errors 400
  `{error}` (invalid entry, duplicate id, unknown sprite, out of bounds, bad layer, too many
  props >400, structural hash mismatch), 401 (bad/missing token), 413 (>1 MB).

## Endpoints

See master-plan §7.2 rows for `/api/layout/save` (v1). Only furniture layers are writable;
`rooms`, `floor`, `walls`, `doors`, `furniture`, `pois` layers are immutable through this path.

## State machines

N/A (no behavioral states in P1). The editor is a two-state machine: `off → (E) → on → (E) → off`;
saving is `idle → saving… → saved(reload)|failed(status line)`.

## UI components and interactions

- `#layout-editor-hud` (fixed bottom-left, dev only): selection id/sprite/tile/layer, drawn rect,
  violation count + first 3, save status. Key map: E toggle, arrows move, drag move, R
  variant/flip, Delete remove, Escape deselect, Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y undo/redo, Ctrl+S save.
- G overlay (key G): as listed in P1-T11.

## Scene and animation behavior

None changed. (Character/scene code untouched in this phase.)

## Configuration files and fields

None added. (Rule 7 security is code, not config, at this phase; `config/runners.json
allowlistedRoots` wiring is fixed later in P4 — tracked as F-SEC-03.)

## Security considerations

- Save endpoint: loopback bind + Host/Origin check + Bearer token + size cap + prop-shape
  validation + duplicate-id rejection + structural-hash refusal. Backups written before every
  write; no path traversal (map path is a constant; prop fields are validated values, not paths).
- Gaps (documented, fixed in P4): no rate limit, no audit log entry per save, `/api/auth/token`
  is unauthenticated by design (same-origin bootstrap).

## Test plan

- `test/furniture.test.ts` (exists): validator returns `[]` on the real map; baseline file
  exists with 42×27.
- Named test files for P1-era behavior (all exist and pass):
  - `test/milestone2.test.ts` — map format, 12 office desks, confession seat, kitchen/game POIs.
  - `test/milestone3.test.ts` — nav through doors, snap-to-walkable, updated for the moved desks.
- New tests added in this phase would have been: fixture-map validator unit tests (violation per
  rule). **Gap (P1-GAP-1):** the validator is only tested against the real (clean) map — a rule
  regression that stops detecting violations would pass the suite. Recommend (P4/P5 follow-up,
  no code now): add `test/validator-rules.test.ts` with a fixture map exercising each rule. This
  is recorded in OPEN-QUESTIONS and will be picked as a P4 task if approved.

## Verification steps with evidence to capture

1. `bun run structure-lock` → `structure-lock OK (990d961c8f3ea7f0)` (captured in STATE §2).
2. `bun run validate-furniture` → `validate-furniture OK (drawn bounds)` (captured).
3. `bun test` → 37 pass / 0 fail (captured).
4. Screenshots: `docs/screenshots/furniture-fix-2/before-*.png` vs `after-*.png` for bedroom,
   living, office, kitchen, gameroom, gym, confession, house, plus `after-overlay-house.png`
   showing drawn rects. `docs/visual-check.md` records per-room pass + 5 NEEDS HUMAN DECISION
   items (master-plan D11).

## Acceptance criteria

- All three commands pass (structure-lock, validate-furniture, bun test) — VERIFIED.
- No prop drawn rect crosses walls/doors/room bounds; no unflagged overlaps — VERIFIED by
  validator + overlay screenshot.
- Every POI id from the pre-pass map still exists — VERIFIED via `docs/furniture-audit.md`
  (POI ids unchanged; only coords moved).
- Visual-check list contains no fixable items (the 5 remaining are art/structure/lighting scope
  items, explicitly out of scope by the spec) — VERIFIED.
- Standing rules 1–11 hold (no structure change: hash `990d961c8f3ea7f0` unchanged since
  baseline; NOTICE/MANIFEST untouched and still accurate).

## Risks with fallbacks

- **Validator too strict for legitimate art overlaps** → pair-exemption mechanism exists
  (tabletop/rug/chair) and is the ONLY escape; any new legitimate case must become an explicit
  flagged pair, never a silent allowlist (Rule 5).
- **Editor save corrupts map** → timestamped backup + atomic write + structural-hash refusal;
  backups accumulate in `docs/layout-backups/` (gitignored).
- **Validator and browser mirror drift** → both derive from the same rule set; a future task
  (P5, if approved) extracts shared constants; today the mirror is byte-for-byte the same logic.

## Effort estimate

S (as executed: 7 commits, ~2 working sessions). Residual (art debts + validator rule-fixture
tests): S if approved.

## STOP gate (what the user reviews before Phase 2 starts)

1. This phase doc + `docs/STATE.md` §3/§7/§13.
2. `docs/furniture-audit.md` (48 findings, fixes + lists) and `docs/visual-check.md` (5 items).
3. The after screenshots, especially `after-overlay-house.png`.
4. Decisions D11 (art debts) and any appetite for the validator rule-fixture test suite.
