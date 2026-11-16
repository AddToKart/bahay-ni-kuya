# Phase 2 — PBB flow, visuals with fake events (branch `pbb-flow-visual`)

## Goal and why it matters

The house is a display today: sessions appear at desks, blocked sessions sit in the confession
room, subagents tether to parents — but nothing ever *enters or leaves like a housemate*, there is
no confession-room queue, no diary-room panel, no call-to-talk, and guests are just small tethered
characters. Phase 2 builds the full PBB choreography and its protocol contract **against fake
events**, so Phase 4 can replace the fake source with real opencode control without touching
visuals or contracts. This is the phase that turns the display into the stage.

## Prerequisites and dependencies

- P1 complete (validators pass; stable map). Depends on nothing else.
- No real opencode work in this phase (P3 runs in parallel; P4 consumes both).
- Uses: `src/store.ts` (event ingest), `src/server.ts` (routes), `public/main.ts`
  (`reconcile`), `public/life.ts` (POI reservation), `public/renderer.ts` (props, overlays),
  `public/kuya.ts` (banners), `scripts/fake-events.ts` (fake engine).

## Standing rules (verbatim from master-plan §1)

Rules 1–10 apply. Specific to P2: Rule 2 (structure lock — the entrance solution must not change
the map structure unless D1 is approved; the "door opens" overlay is not a structure change),
Rule 3 (missing art ⇒ STOP and list), Rule 6 (screenshots + visual-check), Rule 7 (security for
the new control endpoints), Rule 9 (no required build step).

## Ordered task list

### A. Protocol extension (v2, additive)

| ID | Task | Files |
| --- | --- | --- |
| P2-T1 | Add event types `housemate_summoned`, `housemate_arrived`, `housemate_evict_started`, `housemate_evicted` to `EventType` + `validTypes` in store; payload `{housemateKey, name?, harness, presetId?}` for summoned; `{housemateKey}` otherwise; `housemate_summoned` creates a `HousemateRec` in a new in-memory registry (`src/housemates.ts` skeleton) with state `arriving` | `src/types.ts`, `src/store.ts`, `src/housemates.ts` (new) |
| P2-T2 | Add `question_asked` with payload `{id, harness, session, kind: "permission"\|"question"\|"choice"\|"text", text, options?: string[]}`; store keeps a `questions` registry keyed by `id`; a session that asks transitions to `queued_for_confession` (or straight `in_confession` if the chair is free and queue empty) | `src/types.ts`, `src/store.ts`, `src/questions.ts` (new) |
| P2-T3 | Add `question_answered` payload `{id, option?: number, text?: string}`; resolves the question, frees the chair, moves next queued asker to `in_confession`, emits banner "salamat, aalis ka na" and the housemate walks out relieved | `src/questions.ts`, `src/store.ts` |
| P2-T4 | Add `kuya_call` payload `{housemateKey, reason?}` and `kuya_call_ended {housemateKey}`; `kuya_call` stops current activity (releases POI), sets state `called`, routes to confession room in chat mode; `kuya_call_ended` returns to previous POI | `src/types.ts`, `src/store.ts` |
| P2-T5 | Add `chat_message {role: "housemate"\|"kuya", text}` (≤400 chars, clipped); diary panel appends; nothing else changes state | `src/types.ts` |
| P2-T6 | Add `guest_arrived {guestKey, hostKey}` and `guest_left {guestKey}`; guest registry entry with tether to host | `src/types.ts`, `src/store.ts` |
| P2-T7 | Add states `arriving`, `evicting`, `queued_for_confession`, `in_confession`, `called` to `SessionState`; `workingUntil` semantics: `arriving`/`evicting`/`called`/`in_confession` persist until their paired end event (no auto-decay); `queued_for_confession` persists until promoted. Backward compat: unknown states in v1 consumers are rendered as idle (frontend default), and v1 events never emit the new states | `src/types.ts`, `src/store.ts` |
| P2-T8 | Entrance: scan the map for an existing exterior opening (verified: none — perimeter walls are solid at rows 0/26 and columns 0/41, `docs/STATE.md` §4). Therefore: marked spawn/exit point on the building edge + "door opens" overlay, NO structure change. Proposal for a real door goes in the phase report (decision D1). Implementation: `config/house.json` (new) `entrance: {tileX: 26, tileY: 26, facing: "up", overlaySprite: null}` + `public/flow.ts` draws an opening overlay (2-tile dark opening + light spill) at the marked tiles when someone is entering/leaving | `config/house.json`, `public/flow.ts` |
| P2-T8b | Spawn/exit path: walk route enters at the marked edge tile → nearest hallway tile (y 12–14) → target room door → POI. Implemented as explicit waypoint injection in `calculateAStarPath` when state is `arriving`/`evicting` (edge tile is off the nav grid; route = fixed hallway approach + A* from hallway) | `public/flow.ts`, `public/main.ts` |

### B. Choreography (frontend)

| ID | Task | Files |
| --- | --- | --- |
| P2-T9 | SUMMON: on `housemate_summoned`, spawn character at the entrance edge tile with a **bag** (see Art), Kuya welcome banner (`kuya.announce` line `summon_welcome`), walk in through the marked entrance → hallway → living room POI (`living_sofa` family), on arrival emit `housemate_arrived` (fake script) and start house life (life manager picks up as idle) | `public/flow.ts`, `public/main.ts`, `public/kuya.ts` |
| P2-T10 | EVICT: on `housemate_evict_started`, Kuya banner (`evict_line`), emote `exclamation` 3 s, pick up **suitcase** (see Art), walk to entrance, `housemate_evicted` → character removed (poof fade 300 ms) | `public/flow.ts`, `public/main.ts` |
| P2-T11 | CONFESSION: on `question_asked` → if chair free: walk to `confession_chair`, ON AIR light on, diary panel opens; else: state `queued_for_confession`, stand in queue spots (D3), show queue position in HUD. Enter one at a time (promotion when chair frees). On `question_answered`: ON AIR off, relieved exit (emote `thumbs_up` 2 s), walk back to previous POI. If the asker was working, return to its desk; if idle, resume house life | `public/confession.ts` (new), `public/main.ts`, `public/flow.ts` |
| P2-T12 | CALL: on `kuya_call` → stop activity (release POI, remember it), walk to confession room, diary panel in chat mode (no options), `ON AIR` on for the called housemate; replies posted as `chat_message`; on `kuya_call_ended` walk back to the remembered POI | `public/confession.ts`, `public/main.ts` |
| P2-T13 | GUESTS: on `guest_arrived` → GUEST lanyard character (see Art) enters through the front entrance, **dotted tether line to host** (reuses subagent tether renderer), sits at a **guest desk near the host** (new POIs `guest_desk_1..4` in the office, see Data), on `guest_left` hands **folder** to host (folder sprite hops guest→host, 600 ms), then walks out and disappears | `public/guests.ts` (new), `public/flow.ts`, `public/main.ts` |

### C. UI

| ID | Task | Files |
| --- | --- | --- |
| P2-T14 | Diary-room panel (HTML overlay, `#diary-panel`): header (harness • agent • model • project folder — agent/model placeholders "n/a" until P4), question text (wrap, ≤400 chars), option buttons (for `choice`), free-text box (for `text`/`permission`), queue indicator (`#diary-queue`: "2 waiting outside"), chat view (scrollback of `chat_message`s for this session), Close (answers nothing; question stays queued — explicit rule: closing never answers) | `public/confession.ts`, `public/index.html`, `public/style.css` |
| P2-T15 | Console additions: Summon (preset-less fake summon: name + harness), Evict (with confirm dialog), Call to Confession Room; the same Call/Evict buttons appear on the hover card (`#char-card` footer) | `public/index.html`, `public/console.ts`, `public/main.ts` |
| P2-T16 | Taglish lines in `config/kuya-lines.json`: new categories `summon_welcome`, `evict_line`, `confession_call`, `call_to_confession`, `guest_arrival`, `guest_departure`, `question_waiting` with `{name}`, `{harness}`, `{position}` template vars; mirror to `public/kuya-lines.json` (the frontend fetches the public copy); existing categories untouched | `config/kuya-lines.json`, `public/kuya-lines.json`, `public/kuya.ts` |

### D. Fake engine

| ID | Task | Files |
| --- | --- | --- |
| P2-T17 | Extend `bun run fake` to play the full flow: summon two housemates → housemate 1 asks a question (`choice`) → housemate 2 asks while 1 is inside (queue) → answer 1 → housemate 2 enters → answer → kuya call for chat (2 chat_messages) → guest arrives and leaves → one housemate evicted. Timings ~35 s total, `FAKE_SCALE` respected; each step logs `label` | `scripts/fake-events.ts` |

### E. Verification & rules

| ID | Task | Files |
| --- | --- | --- |
| P2-T18 | STOP deliverable: screen recording or screenshot sequence of the whole fake flow into `docs/screenshots/phase-2/` + updated `docs/visual-check.md` (Rule 6) | screenshots dir |
| P2-T19 | Standing rules 1–10 acceptance checklist in the phase report; `CONTRACT.md` updated with the v2 table (contract file is docs — editing it is in scope for the protocol phase; it lives at repo root, the ONLY non-docs file this phase touches, per the spec's "Extend the wire protocol in CONTRACT.md") | `CONTRACT.md` |

## Data formats

**New event payloads (exact shapes, all additive):**

```jsonc
{ "harness": "opencode", "sessionId": "ses_x", "type": "housemate_summoned",
  "housemateKey": "hm_opencode_a1", "name": "Bea", "presetId": null }
{ "type": "question_asked", "harness": "opencode", "sessionId": "ses_x",
  "id": "q_1794...01", "kind": "choice", "text": "Ito ay magsusulat sa lib/…, ituloy?",
  "options": ["Yes, ituloy", "Hindi, skip"] }
{ "type": "question_answered", "id": "q_1794...01", "option": 0 }
{ "type": "chat_message", "sessionId": "ses_x", "role": "housemate",
  "text": "Natapos ko na ang schema, tignan nyo po." }
{ "type": "guest_arrived", "sessionId": "ses_child_1", "guestKey": "hm_guest_01",
  "hostKey": "hm_opencode_a1" }
```

**State table (new states, full machine):**

| State | Entered by | Exits via | Visual |
| --- | --- | --- | --- |
| `arriving` | `housemate_summoned` | walk completes → `idle` (frontend) / `housemate_arrived` event | walk-in with bag, door overlay |
| `evicting` | `housemate_evict_started` | `housemate_evicted` → character deleted | banner, suitcase, walk-out |
| `queued_for_confession` | `question_asked` when queue non-empty | promotion when chair frees | standing at queue spot, queue HUD |
| `in_confession` | chair acquired (on `question_asked` when free, or promotion) | `question_answered` (ask mode) / `kuya_call_ended` (call mode) | chair + ON AIR + diary panel |
| `called` | `kuya_call` | `kuya_call_ended` | walk to confession, chat panel |

Full store-level transition rules (who promotes whom, what happens when a queued asker's session
dies: `session_end`/`subagent_ended`/`housemate_evicted` removes it from the queue silently and
posts a system `chat_message` "session died — tinanggal sa pila") live in `src/questions.ts`.

**Confession queue data model (`src/questions.ts`):**

```ts
interface Question {
  id: string;                    // q_<ts>_<n>
  harness: string; sessionId: string; housemateKey?: string;
  kind: "permission" | "question" | "choice" | "text";
  text: string;                  // clipped 400
  options?: string[];            // kind=choice, max 6
  askedAt: number;
  status: "queued" | "in_confession" | "answered";
  answer?: { option?: number; text?: string };
}
class ConfessionQueue {
  queue: Question[];             // FIFO
  active: Question | null;       // chair occupant
  promote(): Question | null;    // queue head → active, emits store state change
  answer(id, a): boolean;        // resolves, frees chair, promote()
  drop(sessionId): void;         // dead session cleanup
}
```

**Guest desks (map POIs, config/pois.json addition — furniture-layer only, structure untouched):**
`guest_desk_1..4` at office tiles adjacent to the subagent desks (tile coords chosen during
implementation; must pass `validate-furniture` clearance + reachability rules). POI schema:
`{id:"guest_desk_n", room:"office", facing:"up", action:"type", minSec:5, maxSec:30, capacity:1,
tags:["guest"]}`.

**Entrance config (`config/house.json`, new):**

```jsonc
{ "entrance": { "tileX": 26, "tileY": 26, "facing": "up",
                "hallwayApproachX": 26, "hallwayApproachY": 13 },
  "housemateCap": null, "guestPolicy": null }
```

(P4 fills `housemateCap`/`guestPolicy`; P2 uses only `entrance`.)

## Endpoints

| Method | Path | Auth | Request | Response | Notes |
| --- | --- | --- | --- | --- | --- |
| POST | /event | none (ingest, v1 rule) | any v2 event | 204/400 | new types validated in store |
| POST | /api/confession/answer | Bearer + Host/Origin (Rule 7) | `{questionId, option?, text?}` | `{ok:true}` / 400 unknown id / 401 / 429 | the diary panel's submit path (the fake script answers via /event directly; the human panel uses the API) |
| POST | /api/confession/skip | Bearer | `{questionId}` | `{ok:true}` | close-without-answer is NOT skip; skip re-queues (0 of 1 used in demo) |

Rate limiting + audit log land in P4 (P2 records this in the report; P2 keeps the same Bearer +
Host/Origin gate as `/api/layout/save`).

## State machines

Covered above (state table). Additional small machines:
- ON AIR light: `off → on (chair occupied) → off`; rendered as a sprite overlay above the
  confession door (wall-band decoration, not structure).
- Queue promotion: `empty chair + non-empty queue → promote head` triggered on answer, on asker
  death, and on server tick (reconcile).

## UI components and interactions

- Diary panel layout (640×420, bottom-center overlay): header row (badges), question box,
  options grid (2 cols), textarea + submit, queue pill, chat log (last 50), close button.
- Console row: `[Summon ▢ name] [Evict ▢ (confirm)] [Call to Confession ▢]`.
- Hover card footer: `Call` and `Evict` buttons when the card target is a housemate (not guests).
- Queue HUD: small badge above queued characters: `pila #n`.

## Scene and animation behavior

- Walk-in: entrance overlay opens (two-tile dark opening + warm light spill, 250 ms), character
  walks 50 px/s, bag bobs (2 px, 6 fps), banner slides in.
- Evict: suitcase in hand (single sprite attached to character anchor, no new rig), character
  walks out, door overlay closes, character fades 300 ms then despawns.
- Confession: camera auto-cut to CAM CONFESSION on first asker entering (manual override restores
  all-view after 4 s); ON AIR sign pulses (alpha 0.7–1.0, 1 Hz); queue line stands along the room
  facing the chair; relieved exit emote `thumbs_up`.
- Guests: lanyard = small badge sprite on the chest (no new rig); tether is the existing dashed
  parent line, colored guest-accent; folder handoff is a 24×16 sprite hopping guest→host over
  600 ms with a `thumbs_up` on the host.

## Art (Rule 3 check)

Required new sprite props, none of which exist today (verified against atlas sprite list in
STATE §3 and map props list in STATE §4): `prop-bag` (duffel), `prop-suitcase`, `prop-folder`,
`prop-lanyard-badge`, `prop-onair-sign`. **STOP check per Rule 3: these are listed here as
missing art; the phase must not proceed to the affected tasks until they are authored or
approval to substitute existing props is given (decision D2).** Recommendation: author 5 original
sprites in Oddboro conventions (16×16 / 32×16, shared 88-color palette, `.px` + compile step),
add MANIFEST rows. Substitution fallback (if declined): bag→`bin` tinted? No — recommend
proceeding with authored art; the metaphor items are the phase's point.

## Configuration files and fields

- `config/house.json` (new): `entrance {tileX, tileY, facing, hallwayApproachX,
  hallwayApproachY}`. Validated at load (tiles inside map bounds, approach tile walkable).
- `config/kuya-lines.json` + `public/kuya-lines.json`: new categories listed in P2-T16 (schema:
  `{category: string[]}`, every line starts `KUYA:` per existing test convention).
- `config/pois.json` + `public/pois.json`: `guest_desk_1..4`.

## Security considerations

- New `/api/confession/*` endpoints follow Rule 7: loopback bind (already global), Host/Origin
  check, Bearer token, request body ≤64 KiB, no tokens in query strings, `questionId` validated
  against the live registry (unknown ⇒ 400). Rate limit + audit log deferred to P4 (documented
  gap, tracked as P4-T30/31 scope).
- The diary panel renders question text as textContent only (no innerHTML) — question text comes
  from harnesses and could contain markup; XSS guard by construction.

## Test plan

Unit (new test files):
- `test/phase2-protocol.test.ts` — store accepts each new v2 event type with its exact payload;
  rejects malformed ones (missing `id` on question_asked, unknown `kind`, >6 options, >400 text);
  v1 events still behave identically (re-run key `milestone5` assertions against the new store).
- `test/phase2-confession.test.ts` — queue machine: FIFO order; promotion on answer; death
  cleanup drops the queued asker; answer to unknown id fails; two askers never occupy the chair
  simultaneously; `queued_for_confession`/`in_confession` states persist without decay.
- `test/phase2-flow.test.ts` — (jsdom-free pure logic) entrance waypoint injection produces a
  path that starts at the entrance approach tile; guest tether/target desk assignment picks the
  nearest free guest desk to the host; evict removes the character and frees its POI.

Integration:
- `bun run fake` against a spawned server (manual step in the STOP demo; automated smoke:
  `test/phase2-fake-smoke.test.ts` posts the 12 scripted events to a test-port server and asserts
  store snapshot states after each).

Visual:
- Screenshot sequence of the fake flow (`docs/screenshots/phase-2/`), at minimum: arrival walk-in
  with bag + door overlay; two askers (one in chair, one queued); diary panel with options;
  answered/relieved exit; chat call in progress; guest tethered at guest desk; folder handoff;
  evict walk-out. `docs/visual-check.md` updated.

## Verification steps with evidence to capture

1. `bun run structure-lock` passes (unchanged hash) — capture output.
2. `bun run validate-furniture` passes after guest desks are placed — capture.
3. `bun test` all pass including new phase-2 files — capture.
4. Fake flow recording/screenshots + visual-check list (fixable items must be zero at STOP).
5. `CONTRACT.md` diff showing only additive protocol rows.

## Acceptance criteria

- All v2 events accepted by the store with exact payload validation; v1 behavior regression-free
  (existing tests pass).
- Full fake flow plays end-to-end (~35 s) with every listed beat visible on screen.
- Diary panel opens for `permission/question/choice/text`, renders options, accepts an answer
  through `/api/confession/answer`, and closing never answers.
- Queue: two simultaneous askers demonstrable in one run; one at a time inside.
- No structure-lock violation; no new art invented beyond the D2 decision.
- Standing rules 1–10 checklist signed in the phase report.

## Risks with fallbacks

- R7 (structure lock): the entrance overlay must live in an overlay/HUD container, not the map's
  structural layers. Fallback if the overlay approach reads badly: propose the real door (D1)
  and wait for approval — never touch the baseline.
- R14 (missing art): bag/suitcase/folder/lanyard/ON AIR do not exist; STOP per Rule 3 and decide
  D2 before P2-T9/10/13 render.
- Protocol creep: fake-only events could later mismatch real opencode payloads; mitigation —
  `question_asked` fields are exactly the fields P3 must map from real opencode data; P4 adapts
  the mapper, not the protocol.
- Camera auto-cut annoyance: manual override always wins; auto-cut only on first asker.

## Effort estimate

M (~3–4 working sessions): protocol + store ~0.5, choreography ~1.5, UI ~0.5, fake script +
tests + screenshots ~1.

## STOP gate

User reviews: (1) the recording/screenshot sequence, (2) `CONTRACT.md` v2 table, (3) decisions
D1 (real door now or later), D2 (art), D3 (queue spots) as recorded in the phase report, (4)
visual-check list empty of fixable items. Next phase branches only after this review.
