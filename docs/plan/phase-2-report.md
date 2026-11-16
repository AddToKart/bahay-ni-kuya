# Phase 2 report — PBB flow (branch `pbb-flow-visual`)

Status: **core implemented and tested; stopped at the D2 art gate.** D1 (front door) is
implemented with the required structure-diff proof. D2 (sprite sheet) awaits KUYA approval.

## What works (verified)

- **Protocol v2** (`src/types.ts`, `src/store.ts`, `CONTRACT.md`): `housemate_summoned/arrived`,
  `housemate_evict_started/evicted`, `question_asked/answered`, `kuya_call/call_ended`,
  `chat_message`, `guest_arrived/left`; states `arriving`, `evicting`, `queued_for_confession`,
  `in_confession`, `called`. Held states do not decay; v1 behavior unchanged.
- **Confession queue** (`src/questions.ts`): single chair, FIFO, promotion on answer, skip
  re-queue, dead-session cleanup with promotion; recent-answered retention for the panel.
- **Server**: `POST /api/confession/answer`, `POST /api/confession/skip` (Bearer + Host/Origin),
  demo-only `POST /api/simulate` (Bearer; v2 event names only; P4 replaces it); snapshot now
  carries `questions` and `chat`.
- **Diary-room panel** (`public/confession.ts` + `#diary-panel`): driven by snapshot
  questions/chat; option buttons for `choice`, free-text otherwise; queue indicator; closing
  never answers; chat mode for a Kuya call.
- **Scene/flow** (`public/main.ts`): summon walks in from the front door, evict walks out,
  confession chair + east-wall queue positions (7,19), called sessions route to the
  Confession Room; Kuya banners for summon/evict/call/question.
- **Console**: Summon / Evict (confirm) / Call buttons via `/api/simulate`.
- **Rule 11 guard** (`scripts/guard-no-custom-subagents.ts`, `bun run guard`): fails on a
  parented session create or a harness spawn outside the allowed path; tests include negative
  cases.
- **Front door (D1)**: one opening at (26,26) in the south exterior wall. Evidence:
  `docs/plan/phase-2-door-diff.txt` — exactly two tile changes: `walls (26,26) 11 -> 0` and
  `doors (26,26) 0 -> 21`; no other structural tile changed. Baseline regenerated to
  `1c033b45783ebb0b` after that evidence was captured; `structure-lock` passes.
- **Fake flow**: `scripts/fake-events.ts` now plays the full v2 sequence after the day
  (summon ×2 → questions + queue → answers → call + chat → guest in/out → evict).
- **Sprites drafted**: `assets/house/prop-{bag,suitcase,folder,lanyard-badge,onair-sign}.px` and
  the review sheet — NOT compiled or used (D2 gate).

## Commands run

| Command | Result |
| --- | --- |
| `bun test` | 46 pass / 0 fail |
| `bun run guard` | OK |
| `bun run structure-lock` | OK (1c033b45783ebb0b) |
| `bun run validate-furniture` | OK (drawn bounds) |
| `bun run generate-map` + `structure-diff` | 2 tiles only (door) |
| HTTP smoke (test port) | see below |

## What is stubbed / not done

- **D2 iteration (open)**: the five sprites are compiled into the atlas and wired (bag on
  arrival, suitcase on eviction, lanyard + folder on guests, ON AIR sign on the confession
  wall). Visual review found: ON AIR sign barely legible at 1×, guest badge/tether too small.
  Art iteration pending; nothing is blocked functionally.
- **Guest desk**: the office is fully furnished, so guests reuse the existing subagent
  companion placement at the host desk instead of four new `guest_desk_*` POIs (no map churn,
  validator-clean). Recorded deviation from P2-T13; revisit if visual review wants separate
  desks.
- **Panel timing**: the diary panel opens on `question_asked` before the asker reaches the
  chair (≈8 s walk). Listed in `docs/visual-check.md`; fix by gating the panel on arrival.
- **Hover-card Call/Evict buttons**: console buttons implemented; the hover-card duplicates were
  not added yet (same handlers, straightforward follow-up).
- **Rate limit / audit** on the new endpoints: P4 scope; they use the standard Bearer +
  Host/Origin gate today.

## HTTP smoke + visual proof (done)

- `docs/plan/phase-2-http-smoke.txt`: test-port run — summon → question → queued second asker →
  answer → promotion → chat, all correct; bearer token redacted.
- Browser captures (real page, 1280×900): `docs/screenshots/phase-2/01-arrival.webp`,
  `02-confession-queue.webp`, `03-answer-promote.webp`, `04-guest-office.webp`,
  `05-evict-door.webp`, `08-onair.webp`. `docs/visual-check.md` lists the remaining visible
  problems (ON AIR legibility, panel-before-arrival, guest/tether size, watcher-session banner
  noise, pre-existing confession camera framing).

## Fixes made during visual verification

- Summoned/guest sessions are now protected from the process-gone sweep (they are owned by the
  event stream, not a real process); test added.
- ON AIR sign moved below the CCTV HUD and into the top scene layer so it is visible.
- New Kuya lines receive `{name}` (banner previously showed the literal placeholder for
  evict/call/confession).

## NEEDS HUMAN DECISION

1. **D2 (open)**: approve or iterate the sprite sheet
   `docs/screenshots/phase-2/sprite-sheet-draft.png` (see its README).
2. **Guest seating**: reuse host-desk companions (current) vs adding four guest desks by
   reshaping the office (furniture-layer only, validator-gated).
