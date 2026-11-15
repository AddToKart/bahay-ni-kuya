# Bahay ni Kuya

Status: active. Built 2026-11-16 from `plan/bahay-ni-kuya-plan.md`.
Owner: Kurt. Surface: local web app, `http://localhost:4777`, opened in Orca's embedded browser.

## What

A local-only, single-page visualizer that shows every AI coding harness installed on this PC
as a pixel/emoji character inside a cross-section house.

- Not running → asleep in the **Bedroom**
- Running but idle or waiting → hanging out in the **Living Room**
- Thinking / calling tools → at a desk in the **Office**
- Subagents → smaller characters tethered to their parent session, same room rules
- Characters walk between rooms through doorways

Harnesses in scope: opencode, codex, pi, omp (oh-my-pi), hermes. No Claude Code.

## Why

While working across several harnesses in parallel, "who is actually doing work right now?"
is invisible without alt-tabbing through terminals. The house answers that in one glance
from a browser tab that can sit beside the editor.

## Users and scene

One user (Kurt), one machine (Windows 11), often 2–5 harness sessions at once. The page is
glanced at, not operated: success is reading the room states correctly in under two seconds
without touching anything.

## Success

- Every installed harness is represented within 10s of server start.
- Room state matches reality: working sessions in the Office, idle in the Living Room,
  closed harnesses sleeping in the Bedroom.
- Subagents visibly attached to the parent that spawned them.
- Zero measurable impact on the harnesses when the server is down, and no adapter ever
  crashes or blocks a harness (hard requirement).
- Page survives server restarts (reconnect) and harness crashes (sweep).

## Non-goals

No auth, no remote/multi-user access, no persistence across server restarts beyond rebuild
from live events, no history replay, no analytics, no paid assets, no Claude Code support,
no Orca plugin packaging (standalone local app).

## Assumptions (user declined a clarifying interview; brief is the authority)

- Port stays 4777 by default (Orca browser bookmark); override is `BAHAY_NI_KUYA_PORT`.
- Adapters may be installed into global harness config dirs; every install is reversible
  and backed up.
- Hermes runs natively on Windows here, so process scan sees it.
- Pixel-art dollhouse aesthetic is desired (project name: pixel-office).
