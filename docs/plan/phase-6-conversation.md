# Phase 6 — Conversation layer (branch `conversation`)

## Goal and why it matters

Squad work is invisible without its talk. Phase 6 makes housemates communicate through the house:
turn-end updates, role-addressed messages delivered in the next turn, a watchable eavesdrop feed
with Kuya announcing and interrupting, all persisted (survives restarts) and redacted. The spec's
fixture requirement — backend posts an API contract that the frontend's next turn uses — is the
acceptance demo.

## Prerequisites and dependencies

- P5 complete (rounds/turns exist; `kuya` CLI exists; DB tables exist). Depends on no other open
  phase.
- Files: `src/messages.ts` (new), `src/db.ts` (messages migration), `src/jobs/prompts.ts`
  (inbox section), `src/jobs/engine.ts` (turn contract + interrupt), `public/eavesdrop.ts`
  (new), `public/main.ts`, `public/index.html`, `public/style.css`, `public/flow.ts`,
  `scripts/kuya-cli.ts` (`update`, `message` subcommands).

## Standing rules (verbatim from master-plan §1)

Rules 1–11 apply. Specific to P6: Rule 7 (Kuya input box and interrupt are control actions →
Bearer + rate limit + audit), Rule 9 (persistence survives restart — tested), Rule 3 (folder
walk-over reuses the P2 folder prop; no new art needed), Rule 11 (the message layer is the ONLY
cross-housemate channel — delivery, summaries and routing are deterministic code; no helper
agents are spawned to deliver or summarize messages).

## Ordered task list

| ID | Task | Files |
| --- | --- | --- |
| P6-T1 | `messages` schema (master-plan §8 DDL) implemented with migration; record `{id, jobId, round, turnId, from, to, type, text≤400, details_json?, replyTo?, ts, deliveredInTurn}`; `from` ∈ `housemate:<key>` \| `kuya` \| `house`; `to` ∈ `housemate:<key>` \| `role:<role>` \| `all` \| `kuya`; `type` ∈ `update|question|answer|finding|handoff|gate|system|kuya`; persisted in `data/bahay.db` (WAL); survives restarts (tested) | `src/messages.ts`, `src/db.ts` |
| P6-T2 | Turn contract: every housemate turn MUST end with `kuya update "<summary>" [--to <role|housemate|all|kuya>] [--needs <…>] [--blocked <…>]`; engine detects missing update at turn end: posts a `system` message "walang update si <name>" and re-prompts that role **once**; a second miss becomes a `minor` finding (`raisedBy: house`) | `src/jobs/engine.ts`, `src/jobs/prompts.ts`, `scripts/kuya-cli.ts` |
| P6-T3 | Update quality rule (enforced as guidance, not a hard block): `update` summaries MUST mention interfaces/contracts created or changed (prompt section tells the role; a summary that names no artifact and no interface is flagged by the engine as a `nit` finding "vague update") and reference artifacts (file paths, artifact ids) instead of pasting content (text >400 chars is rejected by the CLI with guidance to attach via `details` path reference) | `scripts/kuya-cli.ts`, `src/jobs/prompts.ts` |
| P6-T4 | Inbox: messages addressed to a role (or to the housemate) are included in its next turn prompt — unresolved (replied-to=false) first, then latest N (default 5, `config/house.json.inboxN`); delivery never interrupts a running turn (delivery happens at turn assembly); each delivered message sets `delivered_in_turn`. Rule 11: inbox delivery is deterministic code inside the prompt assembler — no agent session, no summarizer LLM, no helper process is ever spawned to deliver, filter or summarize the inbox. | `src/jobs/prompts.ts`, `src/messages.ts` |
| P6-T5 | Stand-up at the start and end of every round: living-room meeting animation — participating housemates walk to `living_sofa_*` POIs (or stand), Kuya banner "Round N start (stand-up)"; end-of-round stand-up summarizes gate results as `gate` type messages from `house` (the summary is string formatting over gate records — deterministic code, Rule 11) | `src/jobs/engine.ts`, `public/main.ts`, `public/flow.ts` |
| P6-T6 | Limits and safety: max 3 messages per turn per housemate (CLI rejects the 4th with guidance); text ≤400 chars (hard); thread depth 4 (reply chains) then escalate to Kuya (a `question` asking Kuya to arbitrate, thread locked); per-round chatter budget (default 20 messages/round, `config/house.json.chatterBudget` — excess messages dropped with a `system` note); no tool-output dumps (text matching `^\s*(bun|npm|tsc|git)\b.*\n(\s|.{200,})` heuristics or >800 chars of console-like output is refused by the CLI); **secret redaction** before store/display: keys/tokens/passwords/env values/private keys (patterns: `sk-…`, `Bearer …`, `AKIA…`, `-----BEGIN … PRIVATE KEY-----`, `password=…`, `token=…`, `apiKey` JSON fields, long base64/hex ≥32) replaced with `[REDACTED:<type>]`; redaction applied to every message path (CLI, API, engine-generated) with tests using sample secrets | `src/messages.ts`, `scripts/kuya-cli.ts`, `config/house.json` |
| P6-T7 | Eavesdrop mode (T hotkey, docked feed `#eavesdrop`): rows with avatar (chibi head frame), housemate color, type tag chip, text, round, time; filters by housemate, job, type; search box; pause + auto-scroll toggle; thread view per pair (click a row to expand its `replyTo` chain); click-through to the finding (findings panel), diff (turn diff stat view), or raw turn transcript (read-only, from turn records); Kuya input box (target: housemate / role / all) with two actions: **Announce** (queued for next turn — becomes a `kuya` type message delivered in inbox) and **Interrupt** (abort the target's running turn and re-prompt, with confirm); export to markdown (`GET /api/eavesdrop/export`); replay with a timeline scrubber (messages joined to round/turn times; scrubbing shows the state at that ts) | `public/eavesdrop.ts`, `public/index.html`, `src/server.ts` |
| P6-T8 | Scene: speech bubbles with truncated text (≤2 lines, 32 chars), dotted line to the recipient while delivering, folder walk-over for handoffs (P2 prop), and a `CAM: CHAT` feed mode that pans the camera to the pair currently talking (auto-cut with manual override, like P2 confession) | `public/main.ts`, `public/flow.ts`, `public/renderer.ts` |
| P6-T9 | Tests (named): `test/phase6-inbox.test.ts` (order: unresolved first then latest N; no interrupt of running turn; deliveredInTurn stamping), `test/phase6-limits.test.ts` (3/turn, 400 chars, chatter budget, dump refusal), `test/phase6-thread.test.ts` (depth 4 → escalation), `test/phase6-missing-update.test.ts` (system message + one re-prompt; second miss → finding), `test/phase6-redaction.test.ts` (sample secrets list redacted in store and display paths), `test/phase6-restart.test.ts` (messages survive restart), `test/phase6-interrupt.test.ts` (interrupt aborts turn, re-prompt recorded, audited) | test dir |
| P6-T9b | Fixture demo: a fixture job where the backend posts an API contract (a `handoff` message with artifact path) and the frontend's next turn prompt contains it and references it in its update — asserted in `test/phase6-inbox.test.ts` + shown in the demo recording | `test/phase6-inbox.test.ts` |
| P6-T10 | Standing rules 1–11 checklist (incl. Rule 11: message layer only — no helper agents for delivery/summary) | report |
| P6-T11 | STOP: demo recording (contract handoff + eavesdrop + interrupt) + screenshots | screenshots |

## Data formats

**Message record (DB row / API JSON):**

```jsonc
{ "id": "msg_1794..._017", "jobId": "job_..._1", "round": 4, "turnId": "turn_..._09",
  "from": "housemate:hm_ben_a1b2", "to": "role:frontend",
  "type": "handoff",
  "text": "API contract: POST /api/widgets now returns {id,name}; see src/api/widgets.ts",
  "details": { "artifact": "src/api/widgets.ts", "kind": "contract" },
  "replyTo": null, "ts": 1731739200000, "deliveredInTurn": "turn_..._12" }
```

**CLI contract (housemate side):**

```
kuya update "<summary>" [--to <target>] [--needs "<…>"] [--blocked "<…>"]
kuya message --to <target> --type <type> "<text>"
kuya finding add --severity <sev> --path <p> --evidence "<…>" [--repro "<…>"]
kuya ask "<question>"            # confession-room question
kuya handoff --to <target> "<text>" [--artifact <path>]
kuya roster | kuya status
```

**Redaction patterns (documented, tested):** `sk-[A-Za-z0-9_-]{8,}`, `Bearer\s+\S+`,
`AKIA[0-9A-Z]{16}`, `-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[^-]+-----`,
`(?i)(password|passwd|token|secret|api[_-]?key)\s*[=:]\s*\S+`, base64/hex runs ≥32 chars
bounded by whitespace/quotes. Redaction is idempotent and applied before any write or render.

## Endpoints (P6 additions)

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| POST | /api/kuya/messages | Bearer (per-housemate scope for CLI; full token for Kuya UI) | message payload | 201 Message / 400 limit violated |
| GET | /api/messages | Bearer | `?jobId&from&to&type&q&since&limit` | Message[] |
| POST | /api/kuya/announce | Bearer | `{to, text}` | 202 (queued for next turn) |
| POST | /api/kuya/interrupt | Bearer | `{housemateKey}` | 202 (abort + re-prompt; audited) |
| GET | /api/eavesdrop/export | Bearer | same filters as /api/messages | text/markdown |

## State machines

- Message: `created → (queued) → deliveredInTurn → (replied | unresolved)`.
- Thread: `depth 1..4 → at depth 4: escalate-to-kuya, locked`.
- Turn (extends P5): `running → (update received | missing → re-prompt once → update |
  second miss → finding)`.
- Interrupt: `running → aborted → re-prompt queued → running'` (audited; confirm in UI).

## UI components and interactions

Eavesdrop feed (docked right, 320px, collapsible; T toggles): filter row (housemate/job/type
dropdowns + search), pause/play, auto-scroll; rows; thread drawer; click-through targets; Kuya
composer at bottom (target dropdown + text + Announce/Interrupt buttons with confirm). Replay
bar with scrubber appears when replay mode is on (data from `/api/messages` + turn timestamps).

## Scene and animation behavior

P6-T8 as listed. Speech bubble queue per character (existing pattern) so multiple messages don't
flicker; dotted line follows the current delivery only (2 s).

## Configuration files and fields

- `config/house.json` additions: `inboxN: 5`, `chatterBudget: 20`, `redaction: {enabled: true}`
  (never disabled in this plan; field exists for future scope changes only with Kuya approval),
  `maxMessagesPerTurn: 3`, `threadDepthMax: 4`.

## Security considerations

- Redaction before persistence and before render (both) — tests with sample secrets; also
  redacts `details_json` string fields recursively.
- Kuya Announce/Interrupt are control endpoints: Bearer + rate limit (10/min) + audit.
- Eavesdrop is read-only for message data; click-through views (transcript/diff) are read-only
  renders of already-collected house data.
- CLI per-housemate scoping (from P5) applies to `message`/`finding`/`update` (can only act as
  its own housemate key).

## Test plan

Named files listed in P6-T9. All deterministic (fake housemate clients); restart test reopens
the same DB file in a second store instance. Redaction test includes the sample secret corpus
(12 patterns) and asserts zero leaks in stored rows and rendered payloads.

## Verification steps with evidence to capture

1. Demo recording: backend handoff → frontend next-turn uses it → eavesdrop shows the thread →
   Kuya interrupt demo → replay scrubber walkthrough.
2. DB dump of `messages` table for the demo job.
3. Redaction test output (corpus table with before/after).
4. `bun test` full pass.

## Acceptance criteria

- Every housemate turn ends with a `kuya update` or triggers exactly one re-prompt then a
  finding on the second miss.
- Inbox order matches spec; running turns are never interrupted by delivery.
- Limits enforced (3/turn, 400 chars, depth 4, chatter budget, dump refusal).
- Secrets redacted before store AND display (sample corpus test passes).
- Messages survive restart; replay scrubber reproduces the demo timeline.
- Rule 11 held: delivery, stand-up summaries and the eavesdrop render are deterministic code;
  no agent session is spawned for any message purpose (guard stays green).
- Standing rules 1–11 signed.

## Risks with fallbacks

- Over-eavesdropping clutter → filters + pause + `CAM: CHAT` auto-cut has manual override.
- CLI contract ignored by models → prompt section is explicit; missing-update detection makes
  non-compliance visible; escalation path exists (Kuya arbiters at depth 4).
- Redaction false positives (long hashes look like tokens) → pattern list is conservative
  (prefix-anchored) and `[REDACTED:<type>]` keeps the type visible for humans; document overrides
  as NEEDS HUMAN DECISION only if a real case appears.

## Effort estimate

M (~4–5 working sessions).

## STOP gate

User reviews: demo recording (contract handoff + eavesdrop + interrupt + replay), redaction
table, tests list, visual-check. Phase 7 starts after this review.
