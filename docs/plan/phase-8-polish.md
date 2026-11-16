# Phase 8 — Polish and backlog (branch `polish`; each item needs approval before it starts)

## Goal and why it matters

The house works end-to-end after Phase 7; Phase 8 is a curated backlog of comfort, authenticity
and hardening items. **Every item starts only with explicit approval** (one item = one decision =
one commit series), so this phase is a menu, not a plan to execute blindly.

## Prerequisites and dependencies

- P7 complete. Items are independent of each other; order is by user preference. The final
  security review (P8-T9) must be the LAST item executed.

## Standing rules (verbatim from master-plan §1)

Rules 1–11 apply. Specific to P8: Rule 2 (garden area must not break the structure lock — see
the constraint below), Rule 3 (all new props authored properly with MANIFEST rows; the P1
visual-leftover fixes go here per D11, some via the E editor), Rule 6 (before/after screenshots
per item), Rule 11 (all P8 items are client-side visuals/config — no sessions or agents involved;
the final security review re-verifies the Rule 11 guard), Rule 10 (report per item).

## Backlog items (each = one task with its own approval)

| ID | Item | Detail |
| --- | --- | --- |
| P8-T1 | Real garden chill area | Benches and a fire pit in the gym/garden room's outdoor strip (grass columns x38–40). Constraint: structure lock hashes floor/walls/doors — adding props is fine (they live in the editable furniture surface), but *floor* tiles in the strip are hashed, so benches/pit must sit on existing grass tiles. If a floor change is genuinely wanted, propose the structure-lock baseline regeneration in the report (Rule 2) and wait for approval. New props needed: `park-bench`, `fire-pit` (authored, MANIFEST rows). Ambient behavior: housemates may pick `garden_bench_*` POIs with a `sit`/`read` action |
| P8-T2 | Ambient chatter bubbles | Between housemates at social POIs, from `config/chatter.json` (lines keyed by POI tag pairs like `sofa+tv`), **no LLM** — pure weighted random from config; rate-limited (default 1 bubble / 20 s house-wide); bubbles render via the existing speech-bubble path; off-switch in `config/house.json.ambientChatter: false` |
| P8-T3 | Walking tempo constants in `config/house-life.json` | `walkSpeedPx` (default 50), `dwellMultiplier` (longer POI dwell, default 1.25), `roomChangeBias` (fewer room changes, default 0.8 — implemented as a multiplier on the anti-repeat weights), `pauseWhenIdleMs`; read by `public/life.ts` and `public/main.ts` at load; values are tuned constants, not per-housemate logic |
| P8-T4 | Day/night lighting from the local clock | Renderer global tint interpolates across 4 keyframes (dawn/day/dusk/night) from `new Date()`; confession spotlight and emissives stay constant; `config/house.json.dayNight: true` to enable (off = fixed dusk, the current approved look) |
| P8-T5 | Animated details and shadows | Small authored animations where assets exist (TV static jitter already present; add fire-pit flicker, tree sway only if Oddboro-derived frames exist — otherwise STOP and list per Rule 3); contact shadows: a flat 1px-tall ellipse under characters/props, alpha 0.25, no blur (DESIGN.md bans gradients/blur) |
| P8-T6 | Performance pass | Target 60 fps with 20 characters + overlays open (eavesdrop + job panel); measures: existing benchmark re-run + a browser DevTools trace capture recorded in the report; pause-when-hidden already exists (`visibilitychange`) — verify and extend to overlay timers; if a hotspot appears (e.g. debug overlay), fix with container culling, never by removing validators |
| P8-T7 | README with screenshots or a GIF | README gains a visual tour (house view + confession + squad panel), updated Quick Start, and the current feature list; GIF via a short screen capture converted to an optimized GIF/MP4, committed under `docs/screenshots/` |
| P8-T8 | License file, NOTICE and assets manifest review | Confirm every new sprite from P2–P8 is in `assets/MANIFEST.md` with the right license (Oddboro-derived → Apache-2.0 with change note; original → CC0), root `NOTICE` still correct, `docs/oddboro-license-audit.md` still accurate; fix drift found |
| P8-T9 | Final security review | Every control endpoint (summon, evict, call, answer, chat, dispatch, job control, layout save, season actions): loopback + Host/Origin + Bearer + rate limit + audit verified by a checklist walk; token handling (file perms, never in query strings/logs); redaction coverage (messages, transcripts, audit, gate logs); worktree/merge safety (no auto-delete/merge anywhere); Rule 11 re-verification (`bun run guard` green; guests observed-only; no house-created child sessions; wildcard path manual-only); secrets scan of the repo (`rg` for key patterns); results recorded as a table with PASS/FIXED/ACCEPTED-RISK rows |
| P8-T10b | P1 visual leftovers (D11 RESOLVED: accept for now, moved into this backlog) | Dining-chair symmetry, bin/cup wall-pinning and gym-bin placement are fixable with the E layout editor (validator-verified); gym mirror offset, pool-table scale, confession spotlight cone and the missing gym cooler need art/structure decisions and are re-proposed individually | `public/map/house.json` via editor, P8 report |

## Order and approval protocol

1. The user picks items from this menu (any order); P8-T9 last.
2. Each item: branch stays `polish`, one commit per milestone step, screenshots per Rule 6 where
   visuals change, report section per Rule 10.
3. An item not approved is simply not done — no partial starts.

## Data formats

- `config/house.json` additions: `ambientChatter: {enabled, minIntervalMs}`,
  `dayNight: {enabled, keyframes: [{hour, tint, brightness}]}`, `houseLife: {walkSpeedPx,
  dwellMultiplier, roomChangeBias, pauseWhenIdleMs}` (or the standalone
  `config/house-life.json` per P8-T3 — recommend the standalone file to match the spec name).
- `config/chatter.json`: `{ "sofa+tv": ["Grabe 'yang episode ngayon no?", …], "table+dining":
  [...] }` — plain lines, ≤80 chars, no template vars needed.

## Endpoints

None new (P8-T9 only reviews existing ones). No protocol changes.

## State machines

None new. (P8-T4/P8-T6 modify existing render loop behavior; no states added.)

## UI components and interactions

Only additive overlays (fridge/crown/poster already exist from P7; garden POIs appear in the
existing POI system; chatter bubbles reuse speech bubbles).

## Scene and animation behavior

As per items; all subject to DESIGN.md bans (no gradients, no blur, integer pixel grid).

## Configuration files and fields

`config/house-life.json`, `config/chatter.json`, `config/house.json` flags — all optional and
off-by-default except where the item is approved.

## Security considerations

P8-T9 is the capstone; no new attack surface introduced by other items (all are client-side
visuals or config-driven behavior; ambient chatter is config text — treat as data, render as
textContent).

## Test plan

- `test/phase8-tempos.test.ts` — house-life constants read and applied (dwell/room-change math).
- `test/phase8-chatter.test.ts` — chatter selection respects POI tags, rate limit, off-switch.
- `test/phase8-daynight.test.ts` — tint interpolation across keyframes (deterministic clock
  injection).
- `test/phase8-perf.test.ts` — re-run the 20-character benchmark with overlays simulated; assert
  the <5 ms/tick budget.
- P8-T9: `test/phase8-security-walk.test.ts` — automated rejected-request matrix re-run for
  every control endpoint + token-file permission check + redaction corpus re-run.

## Verification steps with evidence to capture

Per item: before/after screenshots (visual items), benchmark numbers (P8-T6), security checklist
table (P8-T9), MANIFEST diff (P8-T8).

## Acceptance criteria (per item)

- Item does exactly its approved scope; structure-lock and validate-furniture pass; `bun test`
  passes; visual-check updated and free of fixable items for that item; report written.

## Risks with fallbacks

- Garden floor-tile change would break the structure lock → prop-only placement; structure
  change only via proposal + approval.
- Performance pass tempted to remove validators/overlays → forbidden; optimize draw paths.
- Ambient chatter annoyance → config off-switch + rate cap.

## Effort estimate

S–M total; each item S (P8-T9 is S–M).

## STOP gate

Per item: approve → implement → review. P8-T9's checklist table is the final review of the whole
project; after it, the season arc is complete.
