# Phase 2 sprite drafts — approval sheet (D2 gate)

`docs/screenshots/phase-2/sprite-sheet-draft.png` renders the five Phase 2 props at 6× on the
dark page background. Order, left to right:

1. `prop-bag` — duffel carried by a summoned housemate walking in.
2. `prop-suitcase` — carried out by an evicted housemate.
3. `prop-folder` — handed by a guest to its host when the guest finishes.
4. `prop-lanyard-badge` — GUEST badge worn by a visiting subagent character.
5. `prop-onair-sign` — wall sign above the Confession Room door while the chair is occupied.

Source drafts live in `assets/house/prop-*.px` (16×16, Oddboro palette keys) and are NOT yet
compiled into `public/atlas/*` and NOT referenced by any scene code — that happens only after
KUYA approves this sheet (D2). Re-render with:

```powershell
bun run scripts/preview-sprites.ts
```

Art notes for review: the suitcase currently reads slightly like a small chest of drawers; the
ON AIR sign uses blocks instead of lettering to stay legible at 16×16. Both can be iterated
before approval; rejected drafts will be redrawn, not substituted with unrelated props.
