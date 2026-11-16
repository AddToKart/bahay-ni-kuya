# Phase 7 — Season 1 (branch `season-1`)

## Goal and why it matters

With jobs and conversation working, the house gets its meta-game: scoring that is transparent and
hard to game, nomination nights where KUYA recasts the house, groceries as the visible cost
budget, brownouts when opencode rate-limits, an automatic Kuya camera, house rules with strikes,
and wildcard specialists. This is the season arc that makes the workspace feel like the show —
without ever giving an agent boss power: every meta decision stays with KUYA.

## Prerequisites and dependencies

- P5 complete (jobs/rounds/findings/turns data + budget enforcement). P6 recommended but not
  blocking (message-derived scoring is additive).
- Files: `src/season.ts` (new), `config/scoring.json` (new), `public/season.ts` (new),
  `public/main.ts`, `public/kuya.ts`, `src/server.ts`, `data/bahay.db` (`scores` table).

## Standing rules (verbatim from master-plan §1)

Rules 1–10 apply. Specific to P7: Rule 5 (scoring is config, transparent, never gamed by agents
— agents cannot write scores; only the engine scores), Rule 7 (nomination actions are control
endpoints with security), Rule 3 (crown = an original sprite/overlay, no PBB trade dress).

## Ordered task list

| ID | Task | Files |
| --- | --- | --- |
| P7-T1 | Scoring in `config/scoring.json`, transparent and hard to game: weights `{gatesFirstTry: +5 per gate, acceptedFixedFinding: +3, testAdded: +2 (testers only), cleanTurn: +1 (turn with no out-of-scope revert and an update)}`; penalties `{failedGate: -4 per role owning it, outOfScopeEdit: -6, wastedTurn: -2 (no-diff turn), stagnantTurn: -2, disputeLost: -3}`; all values in config with a documented scoring algorithm in the file's `_comment` header; scoring computed ONLY by the engine from DB events (agents cannot influence beyond their real actions) | `config/scoring.json`, `src/season.ts` |
| P7-T2 | Per-job and cumulative leaderboard: per-job scores written at `awaiting_kuya` (and recomputed on verdict); cumulative `scores` table updated per event; `GET /api/season/leaderboard` (Bearer) returns `{perJob: [...], cumulative: [...]}`; job panel shows per-job, console footer shows cumulative | `src/season.ts`, `src/server.ts`, `public/jobpanel.ts` |
| P7-T3 | Nomination night: after a job completes (or weekly cadence, D10) a `#nomination-night` overlay shows stats (score, gates, findings, usage per housemate); the lowest scorers are marked NOMINATED; KUYA chooses per nominee: **keep**, **swap model or agent** (opens the casting dialog pre-filled), or **evict and replace** (evict runs the P4 flow; a new housemate then enters via the P2 summon visuals) | `public/season.ts`, `src/season.ts`, `src/server.ts` |
| P7-T4 | Housemate of the week crown: reward, not a boss role — the crown sprite (original art, see Art) is drawn over the winner; effects: queue priority in the confession queue (front of the line) and optionally the strongest model slot on the next job (config `config/scoring.json.hofweek.modelOverride: true|false`); no other privileges, nothing automatic beyond these two | `public/season.ts`, `config/scoring.json` |
| P7-T5 | Groceries: usage budget visualized as a fridge sprite on the kitchen wall (overlay; no structure change) with fill proportional to remaining budget; when the job's budget is exhausted the job pauses (P5 cap behavior) and housemates visibly wait (idle at desks with `question` emote) until KUYA restocks (raises the budget via the panel); uses verified token data from P4 usage; renders `n/a` when usage is unavailable (no estimation) | `public/season.ts`, `src/season.ts` |
| P7-T6 | Brownout: when opencode reports retry or rate-limit state (P3-verified event/shape; detection in `src/opencode-client.ts`), the house lights dim (renderer global tint multiplier 0.6 with warm flicker), housemates stop and wait with `sweat` emote, Kuya banner "brownout — naghihintay", auto-resume on recovery (state restored, job continues) | `src/season.ts`, `public/renderer.ts`, `public/main.ts` |
| P7-T7 | Kuya cam: auto-cut camera to what matters — failing gate (the owning role's desk), dispute (confession room), escalation (confession), completion (winning desk) — with a manual override that wins for 10 s; daily recap panel `#daily-recap` ("Day N: X jobs, Y findings, Z fixed, pass rate P%") built deterministically from the DB (jobs/rounds/findings/aggregates; no LLM) | `public/season.ts`, `src/season.ts` |
| P7-T8 | House rules and strikes: the P5 enforcement rules rendered as a rules poster sprite on the office wall (overlay); violations (out-of-scope edit, test tamper attempt, missed update ×2, dump attempt) produce a Kuya warning line and a strike on the housemate; three strikes ⇒ nominated (appears on the next nomination night regardless of score) | `public/season.ts`, `src/season.ts` |
| P7-T9 | Wildcard housemate: summon a one-job specialist (e.g. security reviewer with a narrow scope) via the casting dialog with `wildcard: true` + a mission note; enters through the P2 entrance (guest-like), does exactly its review/task, hands the folder, leaves; not persisted as a regular housemate (no nomination exposure unless KUYA keeps them — an explicit "keep" action converts them) | `public/season.ts`, `src/housemates.ts` |
| P7-T10 | Optional cheap items (each needs explicit approval at P7 STOP; implement only if cheap): secret mission (red-team tester with hidden brief), whisper corner (side-thread messages visible only to the pair until job end), moods/friendship-rivalry lines (deterministic from score deltas), lights-out and wake-up call for scheduled jobs, finale ceremony on final approval | `config/house.json` flags |
| P7-T11 | Standing rules 1–10 checklist | report |
| P7-T12 | STOP: nomination night + fridge + brownout + kuya-cam demo recording | screenshots |

## Data formats

**`config/scoring.json` (example, all keys required):**

```jsonc
{
  "_comment": "Scoring is computed by the house engine only. Weights are points.",
  "points": { "gatesFirstTry": 5, "acceptedFixedFinding": 3, "testAdded": 2, "cleanTurn": 1 },
  "penalties": { "failedGate": 4, "outOfScopeEdit": 6, "wastedTurn": 2,
                 "stagnantTurn": 2, "disputeLost": 3 },
  "hofweek": { "modelOverride": true, "queuePriority": true },
  "strikes": { "max": 3 },
  "nomination": { "cadence": "per-job", "count": 2 }
}
```

**Score event (internal, from engine → season):**
`{kind: "gatesFirstTry", housemate, jobId, round, value: 5, evidence: "gateA"}`; `src/season.ts`
applies weights and writes `scores.events_json` (append list).

**Leaderboard response:**

```jsonc
{ "perJob": [{ "jobId": "job_1", "rows": [{ "housemate": "hm_bea", "points": 14,
   "detail": {"gatesFirstTry": 2, "testAdded": 2} }] }],
  "cumulative": [{ "housemate": "hm_bea", "points": 41, "strikes": 0 }] }
```

## Endpoints

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| GET | /api/season/leaderboard | Bearer | — | leaderboard |
| GET | /api/season/recap | Bearer | `?day=` | recap panel data |
| POST | /api/season/nominate | Bearer | `{housemateKey, action: "keep"\|"swap"\|"evict", swap?: {agent?, model?}}` | `{ok}` (evict delegates to P4 evict; audited) |
| POST | /api/season/restock | Bearer | `{jobId, addTokens}` | `{ok}` (raises budget; audited) |

## State machines

- Season: `idle → jobRunning → nominationNight → (keep/swap/evict resolved) → idle`.
- Brownout: `normal → brownout (on retry/rate-limit report) → normal (on recovery)`; job state
  unchanged (paused semantics come from P5).
- Groceries/fridge: `stocked → exhausted → restocked` (job pause/resume rides P5).
- Strikes: `0..3` — at 3, housemate marked `nominated` for the next night (cleared after the
  night resolves).

## UI components and interactions

- Nomination night overlay (full-screen dim, stats grid, 3 action buttons per nominee).
- Fridge meter (kitchen wall overlay; hover shows exact tokens/cost remaining).
- Daily recap panel (top-right, collapsible; deterministic numbers only).
- Rules poster (office wall overlay listing the enforcement rules verbatim from P5).
- Crown (drawn over head of the week; tiny sprite).

## Scene and animation behavior

- Nomination night: all housemates summoned to the living room (existing walk system), spotlight
  sweep on nominees (reuse confession spotlight tint on the nominee's position).
- Brownout: global tint + flicker (renderer), no pathing changes.
- Wildcard entry: P2 entrance visuals with a mission banner line.

## Art (Rule 3 check)

New sprites required: `prop-crown` (16×16), `prop-fridge-meter` may reuse `kitchen-fridge` with
an overlay fill (no new art needed for the fridge itself), `poster-rules` (32×32 wall poster).
Crown and rules poster do not exist today → listed per Rule 3; recommend authoring 2 original
sprites (D2-style decision recorded in the phase report). No PBB trade dress anywhere.

## Configuration files and fields

- `config/scoring.json` as above (validated at load; missing keys ⇒ defaults + warning).
- `config/house.json` additions: `season: {nominationCadence: "per-job"\|"weekly", recapEnabled:
  true, optionalFeatures: {secretMission: false, whisperCorner: false, moods: false, schedule:
  false, finale: false}}`.

## Security considerations

- Nomination/evict/restock endpoints: Bearer + Host/Origin + rate limit + audit (Rule 7). Evict
  delegates to the P4 flow including the confirm dialog.
- Scores are engine-computed only; no endpoint lets an agent write score events; the CLI has no
  scoring subcommand.
- Recap/leaderboard read-only.

## Test plan

- `test/phase7-scoring.test.ts` — weight application per event kind; per-job + cumulative math;
  scoring immune to agent-injected messages (only engine events count).
- `test/phase7-nomination.test.ts` — lowest scorers selected; keep/swap/evict flows; evict-and-
  replace walks the new housemate in (state assertions).
- `test/phase7-fridge.test.ts` — budget exhaustion → pause; restock → resume; `n/a` rendering
  when usage unavailable.
- `test/phase7-brownout.test.ts` — fake retry/rate-limit report → brownout state → recovery
  resume.
- `test/phase7-recap.test.ts` — recap numbers match DB aggregates for a scripted day.
- `test/phase7-strikes.test.ts` — violations increment strikes; 3 strikes ⇒ nominated.

## Verification steps with evidence to capture

1. Nomination night demo (stats + one keep + one evict/replace).
2. Fridge restock demo; brownout triggered by a mocked rate-limit report and by a real one if it
   occurs naturally in the demo.
3. Kuya cam auto-cuts recording with manual override.
4. Recap panel vs raw DB query comparison (deterministic proof).
5. `bun test` full pass.

## Acceptance criteria

- Scoring matches config weights exactly for a scripted job; leaderboard shows both views.
- Nomination night offers keep/swap/evict-and-replace; replace enters through the door visuals.
- Fridge reflects verified usage; exhausted budget pauses with visible waiting; `n/a` when data
  is unavailable.
- Brownout engages on rate-limit/retry reports and resumes cleanly.
- Rules poster lists the real enforcement rules; three strikes ⇒ nominated.
- Optional features exist only as config flags (off) unless individually approved.
- Standing rules 1–10 signed.

## Risks with fallbacks

- Gaming the score: mitigated by engine-only scoring and by penalties on out-of-scope/wasted
  turns; if a gaming pattern appears, add a penalty — never remove visibility (Rule 5).
- Usage data unavailable for some models → `n/a` and budget features degrade to wall-time/turn
  caps (already in P5); fridge shows "walang sukli" state.
- Nomination feels arbitrary → it is driven by transparent scores + strikes, and every action is
  KUYA's explicit choice.
- Art risk (crown/poster) → listed per Rule 3; substitution is not allowed for the crown (it is
  the reward symbol); the poster can be text-rendered if art is declined.

## Effort estimate

M (~4 working sessions).

## STOP gate

User reviews: nomination demo, scoring table against config, fridge/brownout/kuya-cam demos,
decisions D10 (cadence) and any optional feature approvals. Phase 8 items then go one-by-one.
