# Phase 0 — Audit (delivered as `docs/STATE.md`)

Status: complete on branch `master-plan`. The audit itself is `docs/STATE.md` (475 lines): scene
and art, map and nav, house life, task flow, hover, dispatcher, MCP wrapper, adapters, validators,
tests, the exact current wire protocol (§8), git history (§9), 20 findings (§10), opencode
environment facts (§11), and the DONE/PARTIAL/TODO scorecard (§12) that feeds the master-plan
traceability table.

## What this phase covered (per spec)

| Spec item | Where it landed |
| --- | --- |
| Read README.md, PRODUCT.md, DESIGN.md, CONTRACT.md | STATE §1 (all read; CONTRACT reproduced in §8) |
| Read plan/, docs/ | STATE §1 |
| Read src/, public/, adapters/, scripts/, config/, test/ | STATE §1 (per-file line counts + content claims) |
| List branches and recent commits | STATE §9 |
| Scene and art / map and nav / house life / task flow / hover / dispatcher / MCP / adapters / validators / tests | STATE §3–§7 |
| Exact current wire protocol | STATE §8 (events, hermes mapping, state machine, snapshot, HTTP API, MCP, security posture) |
| What is broken or incomplete | STATE §10 (F-ADP-01 … F-STATE-01) |
| Vision scorecard DONE/PARTIAL/TODO | STATE §12 (33 rows) |
| master-plan reorganization + dependency order + risks | docs/master-plan.md §2, §3, §5, §12 |

## Verification performed (read-only commands)

`git branch -vv`, `git log --oneline -30`, `git worktree list`, `bun --version` (1.3.14),
`opencode --version` (1.18.35), `bun run structure-lock` (OK `990d961c8f3ea7f0`),
`bun run validate-furniture` (OK), `bun test` (37 pass / 0 fail). Side effect recorded in
STATE §2: the milestone7 dispatcher test left a branch + prunable worktree registration
(`kuya/opencode-task_1794772219931_1`) — finding F-SEC-05, deliberately not cleaned by the
planning pass (read-only rule).

## Deliverable order

1. `docs/STATE.md` (this audit) — done.
2. `docs/master-plan.md` — done (same pass).
3. `docs/plan/phase-<n>-<name>.md` for n=1..8 — done.
4. `docs/ASSUMPTIONS.md`, `docs/OPEN-QUESTIONS.md` — done.
5. Commit all docs on `master-plan`, do not push — done as the single docs commit.

## STOP gate

Phase 0's STOP is the review of this planning pack: STATE.md, master-plan.md (phase list,
sizes, risks, traceability, NEEDS HUMAN DECISION D1–D12), the eight phase docs, assumptions and
open questions. Phase 1 work is already delivered at audit time; the next live phase to start is
Phase 2 (branch `pbb-flow-visual`) in parallel with Phase 3 (branch `spike-opencode`), per
master-plan §3.
