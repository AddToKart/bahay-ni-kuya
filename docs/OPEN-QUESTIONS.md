# OPEN-QUESTIONS.md — things the plan could not decide alone or cannot verify yet

Each entry states the question, what is known, options, and the recommendation. Items that are
true decisions for the human are ALSO in master-plan §13 (NEEDS HUMAN DECISION).

## A. Questions for KUYA (decisions)

| # | Question | Known | Options | Recommendation |
| --- | --- | --- | --- | --- |
| OQ-A01 (D1 RESOLVED) | Real exterior front door approved — tiny change only: exactly one door opening in the south exterior wall; the agent must show that the structure diff is only those tiles before `docs/structure-baseline.json` is regenerated; if anything else changes, STOP and re-propose. | Perimeter had no opening (STATE §4); D1 reply. | — | Implemented in P2-T8/T8b with the diff gate. |
| OQ-A02 (D2 RESOLVED) | Author the 5 missing sprites (bag, suitcase, folder, lanyard, ON AIR) + P7's crown/rules poster, original and in the existing style — with a mandatory sprite-sheet approval by KUYA before use. | None exist (verified against atlas sprite list). | — | P2 §Art workflow; preview sheet at `docs/screenshots/phase-2/sprite-sheet-draft.png`. |
| OQ-A03 | `assets/third-party/oddboro/` appears to contain only the license/NOTICE files (listing was empty of extra files in the audit); confirm the Apache-2.0 license text + Oddboro NOTICE files are actually present there. | NOTICE references them; audit doc describes them. | (a) confirm and keep; (b) if missing, add them. | Confirm during P2's Rule-3 audit; add if absent. |
| OQ-A04 (D3 RESOLVED) | Confession queue stands inside the room along the east wall (POIs `confession_queue_1..4`) — keeps the hallway clear. | Confession room is 8×10 with one chair; D3 reply. | — | P2 data formats. |
| OQ-A05 (D4 RESOLVED) | Spike spend approved: harmless prompts, ≤6 turns, 3 sessions, cheapest connected model for bulk probes. | Whole P4+ plan depends on real API evidence; D4 reply. | — | P3 safety section. |
| OQ-A06 (D5 RESOLVED with condition) | `--pure` accepted for the spike; the spike must report what the flag disables and whether the user's agents rely on anything it turns off before P4 pins it. | Flag exists (`serve --help`); P3-T11b probe (probe13-pure-flag.ts). | — | P3/P4 tasks updated. |
| OQ-A07 (D6 RESOLVED) | Housemate cap = 6; guests capped separately (8); ≤3 turns running at once. | The example squad is 5 housemates; D6 reply. | — | P4-T21, P5-T8. |
| OQ-A08 (D7 RESOLVED with condition) | Squad mapping approved with the user's own agent files; proofreader drafted as a PROPOSED review-only file (`docs/housemates/proofreader-PROPOSED.md`), never installed; tester-2 uses a model from a different provider than tester-1. | 11 agents exist; no proofreader; D7 reply. | — | P5-T9/T10. |
| OQ-A09 (D8 RESOLVED) | Default gates: `bunx tsc --noEmit`, `bun run structure-lock`, `bun run validate-furniture`, `bun test`. | D8 reply; no lint/build exist today. | — | P5 template. |
| OQ-A10 (D9 RESOLVED) | Approve merge target: `kuya/ready`, never `main`/`master`. | D9 reply. | — | P5-T19. |
| OQ-A11 (D10 RESOLVED) | Nominations per job. | D10 reply. | — | P7-T3. |
| OQ-A12 (D11 RESOLVED) | The 5 P1 visual debts accepted for now and moved into the P8 backlog; dining-chair/bin-cup items fixable with the E editor. | `docs/visual-check.md`; D11 reply. | — | P8-T10b. |
| OQ-A13 (D12 RESOLVED with condition) | Default budget 1.5M in / 300k out; the FIRST fixture job runs 500k in / 100k out. | D12 reply. | — | P5-T8, template `firstRunBudget`. |
| OQ-A14 | Should P4 also retrofit rate-limit + audit to the v1 endpoints beyond what P4-T30/31 already include? | P4-T31 covers all endpoints. | yes (default) / minimal. | yes. |
| OQ-A15 (D13 OPEN) | Denied guest types: after P3-T11b shows what opencode natively supports, KUYA chooses (a) an opencode permission/task config change proposed in docs and applied by KUYA himself, or (b) house-side abort of observed denied-type guests via the verified abort call (banner + Confession Room notice). Rule 11 forbids a house-made replacement subagent in both cases. | P3-T11b will capture native mechanisms; D13 opened by the Rule 11 directive. | (a) config proposal; (b) verified abort with banner/audit. | Decide at the P4 STOP gate with the P4-T20b proposal in hand; if opencode supports neither cleanly, prefer documenting the limitation over inventing a mechanism. |

## B. Technical questions the phases must answer (verification tasks)

| # | Question | Owner | How it gets answered |
| --- | --- | --- | --- |
| OQ-B01 | What exactly are opencode's server routes for: health, session create, prompt send, event stream, permission/question answer, abort, usage? | P3-T3..T9 | Captured transcripts under `spikes/opencode-control/evidence/` → FINDINGS table. |
| OQ-B02 | Do `question`-type asks exist as a distinct opencode concept (vs permission asks), and what payload distinguishes them? | P3-T5/T8 | Event samples; if absent, house synthesizes `kind:"question"` from free-text asks (documented fallback). |
| OQ-B03 | Does per-request model/variant override the agent's configured model, and which wins? | P3-T12 | probe10-override.ts result. |
| OQ-B04 | Is `/event` ingest auth a real risk worth hardening (local fake-event spoofing)? | P4 security review | Threat note in the P4 report; default stays ingest-unauthenticated (A-06) unless P4 finds a cheap token scheme that keeps all five adapters working. |
| OQ-B05 | Can one opencode server safely host sessions in different worktrees of the same repo simultaneously (DB contention)? | P3-T4/T11 | Concurrency probe + DB lock observation. |
| OQ-B06 | What is the cheapest reliable way to detect "retry/rate-limit" state for the P7 brownout? | P3-T5/T7 + P7 | Event sample; fallback = error-event string matching, documented. |
| OQ-B07 | Does `opencode export <sessionID>` give a stable transcript for the read-only eavesdrop click-through, or is the live stream the only source? | P3-T7 | probe5 evidence; P6 implements whichever is verified. |
| OQ-B08 | Are subagent (guest) sessions visible to the parent server as separate sessions with `parentID` on create (and do their permissions surface via the parent)? How does a NATIVE subagent differ from a direct session create with a parentID (Rule 11 evidence)? | P3-T11, P3-T11b | probe9 + P3-T11b evidence. |
| OQ-B08b | What does opencode natively support for restricting subagent agent types (permission config? task config? nothing)? — feeds D13. | P3-T11b | probe9/probe13 evidence; if none found, D13 falls to option (b) or documented limitation. |
| OQ-B09 | Does the layout editor need "add new prop" (the spec only says remove/move/rotate)? Adding changes the props count and could collide with POI placement rules. | P4/P5 (editor maintenance) | Only if a phase needs it; current editor is move/rotate/delete as spec'd. |
| OQ-B10 | Will the P2 guest desks pass `validate-furniture` (clearance + reachability) at their chosen tiles? | P2 | Validator run + overlay screenshot during P2. |
| OQ-B11 | Is there a rear-facing kitchen chair variant to fix the P1 dining-chair debt without new art? | P2/P8 art audit | Atlas frame list check (currently no; listed as art debt D11). |
| OQ-B12 | Does the 12 GB opencode DB slow the 3 s DB poller enough to matter once real event streaming exists? | P4 | The DB watcher is replaced by the live stream in P4 (kept as fallback); measure only if the fallback path is used. |

## C. Plan-internal notes (resolved here, recorded for the trace)

- **Rule 11 guest correction (2026-11-16)**: the user clarified that opencode housemates summon
  their own subagents/houseguests natively — "we don't touch what opencode does". The earlier
  wording that implied house-side `allowed`/`denied` session filtering (and any house-created
  guest session) is superseded: guests are observed-only renderings of child sessions created by
  the housemates themselves; type denial rides opencode config or a verified abort (D13), and
  the guard/tests enforce the boundary (A-16, A-32).
- **P2 vs P4 confession ownership**: specified once in P2 (queue + panel + payloads), consumed
  by P4. No second mechanism will be built (master-plan §15).
- **Dispatcher auto-delete vs Rule 8**: fixed in P4 for both the housemate path and the legacy
  console path (master-plan §15) so there is one behavior everywhere.
- **Audit log duplication (file + DB)**: file is always-on truth for non-job actions; DB
  `audit_log` mirrors job-scoped actions (master-plan §15).
- **P1 delivered**: the spec's Phase-1 branch name `furniture-fix-2` matches the existing branch
  exactly; the plan's P1 tasks are verification/reopen tasks, and the residual art debts are
  decisions, not silent scope cuts (A-01, OQ-A12).
