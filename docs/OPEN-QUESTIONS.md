# OPEN-QUESTIONS.md — things the plan could not decide alone or cannot verify yet

Each entry states the question, what is known, options, and the recommendation. Items that are
true decisions for the human are ALSO in master-plan §13 (NEEDS HUMAN DECISION).

## A. Questions for KUYA (decisions)

| # | Question | Known | Options | Recommendation |
| --- | --- | --- | --- | --- |
| OQ-A01 (D1) | Add a real exterior front door to the map? | Perimeter has no opening (STATE §4); P2 uses a marked spawn/exit overlay unless approved. | (a) overlay forever; (b) real door + walkway now (requires one-time structure-lock baseline regeneration, documented in a proposal). | (b) — the summon/evict metaphor deserves a real door; do it once, before P2 builds overlays on top. |
| OQ-A02 (D2) | Author the 5 missing sprites (bag, suitcase, folder, lanyard, ON AIR) + P7's crown/rules poster? | None exist (verified against atlas sprite list). | (a) author originals (recommended); (b) block P2/P7 on art; (c) substitute unrelated props (not recommended — breaks the metaphor). | (a). |
| OQ-A03 | `assets/third-party/oddboro/` appears to contain only the license/NOTICE files (listing was empty of extra files in the audit); confirm the Apache-2.0 license text + Oddboro NOTICE files are actually present there. | NOTICE references them; audit doc describes them. | (a) confirm and keep; (b) if missing, add them (docs task, allowed in a docs-only pass — but the planning pass did not touch assets). | Confirm during P2's Rule-3 audit; add if absent. |
| OQ-A04 (D3) | Where do queued askers stand? | Confession room is 8×10 with one chair. | (a) queue line inside the room's east wall; (b) queue outside the room in the hallway; (c) overflow spots in adjacent rooms. | (a) inside, along the east wall — keeps them visible on CAM CONFESSION. |
| OQ-A05 (D4) | Approve the P3 spend (harmless prompts, ≤6 turns, plus up to 3 concurrent sessions)? | The whole P4+ plan depends on real API evidence. | (a) approve; (b) limit to 2 sessions; (c) no real spend (spike degrades to CLI-only evidence — much weaker). | (a). |
| OQ-A06 (D5) | Run managed opencode servers with `--pure`? | Flag exists (`serve --help`); effect = no external plugins. | (a) `--pure` for managed housemates; (b) allow plugins. | (a) — determinism + isolation; the user's own TUI keeps its plugins. |
| OQ-A07 (D6) | Default housemate cap? | Spec says "housemate cap (config)". | 2 / 4 / 6. | 4. |
| OQ-A08 (D7) | First-squad mapping + new `proofreader.md` agent file? | 11 agents exist; no proofreader (STATE §11). | see master-plan D7 options. | As recommended there; approve the new agent file at P5 STOP. |
| OQ-A09 (D8) | Exact gate commands for this repo? | No lint/build scripts exist today; validators + tests exist. | (a) tsc + validators + bun test (+ a `generate-map --check` mode to be added in P5); (b) add a lint config first. | (a); adding eslint can be a P8 candidate. |
| OQ-A10 (D9) | Default Approve target branch? | Spec: "never main by default". | `kuya/ready` staging branch vs per-job `kuya/job-<id>-approved`. | `kuya/ready`. |
| OQ-A11 (D10) | Nomination cadence? | Spec offers per-job or weekly. | per-job / weekly. | per-job. |
| OQ-A12 (D11) | Accept the 5 P1 visual debts (dining chairs, gym mirror, gym cooler, pool scale, spotlight cone)? | Listed in `docs/visual-check.md`. | (a) accept; (b) commission art; (c) propose structure change for the mirror. | (a) now, revisit in P8. |
| OQ-A13 (D12) | Default per-job token budget? | Spec: token or cost budget from verified usage. | 0.5M / 1.5M / no cap. | 1.5M input + 300k output, hard stop + confession escalation. |
| OQ-A14 | Should P4 also retrofit rate-limit + audit to the v1 endpoints beyond what P4-T30/31 already include? | P4-T31 covers all endpoints. | yes (default) / minimal. | yes. |

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
| OQ-B08 | Are subagent (guest) sessions visible to the parent server as separate sessions with `parentID` on create (and do their permissions surface via the parent)? | P3-T11 | probe9 evidence. |
| OQ-B09 | Does the layout editor need "add new prop" (the spec only says remove/move/rotate)? Adding changes the props count and could collide with POI placement rules. | P4/P5 (editor maintenance) | Only if a phase needs it; current editor is move/rotate/delete as spec'd. |
| OQ-B10 | Will the P2 guest desks pass `validate-furniture` (clearance + reachability) at their chosen tiles? | P2 | Validator run + overlay screenshot during P2. |
| OQ-B11 | Is there a rear-facing kitchen chair variant to fix the P1 dining-chair debt without new art? | P2/P8 art audit | Atlas frame list check (currently no; listed as art debt D11). |
| OQ-B12 | Does the 12 GB opencode DB slow the 3 s DB poller enough to matter once real event streaming exists? | P4 | The DB watcher is replaced by the live stream in P4 (kept as fallback); measure only if the fallback path is used. |

## C. Plan-internal notes (resolved here, recorded for the trace)

- **P2 vs P4 confession ownership**: specified once in P2 (queue + panel + payloads), consumed
  by P4. No second mechanism will be built (master-plan §15).
- **Dispatcher auto-delete vs Rule 8**: fixed in P4 for both the housemate path and the legacy
  console path (master-plan §15) so there is one behavior everywhere.
- **Audit log duplication (file + DB)**: file is always-on truth for non-job actions; DB
  `audit_log` mirrors job-scoped actions (master-plan §15).
- **P1 delivered**: the spec's Phase-1 branch name `furniture-fix-2` matches the existing branch
  exactly; the plan's P1 tasks are verification/reopen tasks, and the residual art debts are
  decisions, not silent scope cuts (A-01, OQ-A12).
