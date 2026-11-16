# Phase 4 report — real opencode housemates (2026-11-16)

Branch: `opencode-housemates`. Scope: managed opencode control, summon/evict/call, question and
permission bridging, observed subagent guests, styled summon dialog, security/audit/caps. No
structure, map, art, doors or camera changes.

## What works (observed, not inferred)

| Flow | Evidence |
|---|---|
| Managed `opencode serve` on `127.0.0.1:40051`, health/log capture, state-file reuse | Server start log; `/api/housemates` calls |
| Summon → worktree `kuya/<name>-<id>`, branch, real session with agent/model | `hm_eli_e0t4`, `kuya/eli-e0t4`; `/state` showed `arriving`→`idle` |
| Summon dialog | Styled modal: name, 19 agents, **all 281 models** with filter, folder, inline error; summon closed the modal and created `hm_hana_3zrw` (`arriving`) — screenshots `summon-dialog`, `after-modal-summon` |
| Call → house `called` state, chat message, prompt delivered, real model reply | Tokens updated (`input 2416`, `cache read 12288`); chat showed Kuya message |
| Event stream mapping | `/global/event` payloads are wrapped `{directory, project, payload}`; client unwraps. Before the fix, state/usage never updated |
| Permission ask → Confession Room `in_confession`, options `["Allow once","Reject"]` | `/state`; panel screenshot |
| Answer via panel → scoped opencode reply → bash tool actually runs | Clicked **Allow once**; tool part `status: "completed", output: "hi\n"`; question `answered`; session `idle` |
| **Guest from a native child session** | Host called with `subagent_type: "explore"` after the model override was removed; `/state` showed a child with `parentId` = host + `guest: true`; child inherited `opencode/mimo-v2.6-flash-free`, ran `glob`, returned the `src/` list; host `task` completed; guest left after the 3 s minimum — screenshot `guest-office` |
| Guest visual | 3 px dashed blue tether, 0.9 badge, larger GUEST tag, folder carry; office zoom capture |
| Evict → abort, session removed, worktree + branch kept, diffstat returned | `DELETE` returned `{ok, worktree, branch, diffStat}`; `git worktree list` still had it |
| Security | Bearer token from `%USERPROFILE%\.bahay-ni-kuya\token`, Host/Origin, cwd allowlist, rate limit, audit log; rejected requests covered by tests |
| Caps | 6 housemates, 3 concurrent turns, FIFO prompt queue |

Critical finding: opencode **permissions and questions are directory-scoped**. Replying without
`?directory=<worktree>` returns HTTP 200 but does nothing; the tool stays `running` forever. Both
reply routes now pass the housemate worktree. Verified by direct `/permission?directory=` inspection
and by the completed `echo hi` tool part.

`session.idle` arrives while a permission is open; `task_completed` now leaves
`in_confession`/`queued_for_confession` intact until the question is answered.

Guest finding (resolved 2026-11-16): the global config overrode `explore` with
`omniroute-local/oc/deepseek-v4-flash-free`, whose endpoint `http://localhost:20128` is offline;
the child retried forever and the host `task` tool hung. Removing `agent.explore.model` from
`~/.config/opencode/opencode.json` makes `explore` inherit the parent session model. Verified with
host `opencode/mimo-v2.6-flash-free`: the child session reported the same model, ran `glob`
(`completed`), returned the file list, and the host `task` completed.

## Decisions applied (2026-11-16)

1. **All 281 models stay.** The modal exposes every model and adds a text filter; no allowlist.
2. **Keep `bash: ask` per session.** No auto-approve preset; the permission panel offers Allow once
   / Reject.
3. **Guests are real observed child sessions.** The house never creates a child session and never
   sends `parentID`; it only maps `session.created` with `parentID` to a guest and `guest_left`
   after the native child ends.
4. **Summon is a styled dialog, not alert().** Implemented with a modal matching the diary panel;
   success/error are inline. Evict still uses `confirm` for the destructive confirmation.

## Files changed (this pass)

- `src/opencode-client.ts` — global event subscription + unwrap; directory-scoped replies.
- `src/housemates.ts` — permission options; route directory; scoped replies.
- `src/questions.ts` — options for non-choice questions; `hasOpen(sessionId)`.
- `src/store.ts` — `task_completed` keeps an open confession.
- `public/confession.ts` — real answer endpoint; permission option buttons.
- `public/console.ts` — styled summon dialog, filter, real call/evict, housemate picker.
- `public/index.html` — modal markup, cleaner console row, hover-card agent/model rows + actions.
- `public/main.ts` — agent/model metadata, card action API, Call/Evict buttons.
- `public/renderer.ts` — guest tether (dashed, 3 px), badge scale, GUEST tag.
- `public/style.css` — modal and card-action styles.
- `docs/screenshots/phase-4/*.webp` — real captures.
- `docs/visual-check.md` — Phase 4 section.

Global config (outside the repo): `~/.config/opencode/opencode.json` — removed
`agent.explore.model`; backup at `opencode.json.bak-2026-11-16-explore-model`. The app's managed
server was restarted and the child session inherited the parent model, verified above.

Earlier in the branch: `src/opencode-supervisor.ts`, `src/audit.ts`, `src/ratelimit.ts`,
`src/procutil.ts`, `src/security.ts`, `src/server.ts`, `src/types.ts`, configs, installer cleanup,
removal of the dead opencode plugin.

## Verification run

- `bun test` — 47 pass, 0 fail (1125 expectations).
- `bun run guard` — OK.
- `bun build public/main.ts --target browser` — OK (verification only; no build step added).
- Live: modal summon → `hm_hana_3zrw`; host → `general` guest → child completed → guest left;
  permission → UI Allow once → `echo hi` completed; evict kept worktree/branch.

## Still missing

1. **Guest caps/time limit not enforced.** `config/guests.json` holds `maxPerHost: 3`,
   `maxTotal: 8`, `maxDepth: 2`, `timeLimitMs: 300000`; the code only uses the fixed 3 s minimum
   visible time. Over-cap or over-time guests are not queued/reported.
2. **Hover card visual not captured.** Agent/model rows and Call/Evict buttons are wired and
   compile; click targeting in the automated browser missed the sprites, so no screenshot.
3. **No `GET /api/opencode/logs`**; managed-server stderr is captured in memory only.
4. **Chat panel shows final text only**, not streaming deltas.
5. **Evict was tested on an idle session.** Process-tree kill for an active long tool is
   unit-covered but not exercised live.
6. **`maxDepth`/anomaly path** (unexpected child session) is not implemented; only parentID-linked
   children are rendered.

## UNVERIFIED

- Guest caps and 5-minute overrun reporting (not implemented).
- Evict during a running bash/tool turn (only idle evict observed).
- opencode server restart adoption with an in-flight turn (state-file reuse observed, not a crash).
- Hover-card Call/Evict buttons clicked successfully in a live browser.

## NEEDS HUMAN DECISION

1. **Guest caps/overrun.** Implement the `config/guests.json` caps and the 5-minute Confession Room
   overrun report, or accept the current unlimited observation? Recommend implementing the caps
   before leaving agents running unattended.
