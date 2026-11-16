# Phase 4 report — real opencode housemates (2026-11-16)

Branch: `opencode-housemates`. Scope: managed opencode control, summon/evict/call, question and
permission bridging, console controls, security/audit/caps. No structure, map, art, doors or
camera changes.

## What works (observed, not inferred)

| Flow | Evidence |
|---|---|
| Managed `opencode serve` on `127.0.0.1:40051`, health/log capture, state-file reuse | Server start log; `/api/housemates` calls |
| Summon → worktree `kuya/<name>-<id>` under `.kuya-worktrees/`, branch, real session with agent/model | `hm_eli_e0t4`, `kuya/eli-e0t4`; `/state` showed `arriving`→`idle` |
| Call → house `called` state, chat message, prompt delivered, real model reply | Tokens updated (`input 2416`, `cache read 12288`); chat showed Kuya message |
| Event stream mapping | `/global/event` payloads are wrapped `{directory, project, payload}`; client unwraps. Before the fix, state/usage never updated |
| Permission ask → Confession Room `in_confession`, options `["Allow once","Reject"]` | `/state`; panel screenshot |
| Answer via panel → scoped opencode reply → bash tool actually runs | Clicked **Allow once**; tool part `status: "completed", output: "hi\n"`; question `answered`; session `idle` |
| Evict → abort, session removed, worktree + branch kept, diffstat returned | `DELETE` returned `{ok, worktree, branch, diffStat}`; `git worktree list` still had it |
| Security | Bearer token from `%USERPROFILE%\.bahay-ni-kuya\token`, Host/Origin, cwd allowlist, rate limit, audit log; rejected requests covered by tests |
| Caps | 6 housemates, 3 concurrent turns, FIFO prompt queue |

Critical finding: opencode **permissions and questions are directory-scoped**. Replying without
`?directory=<worktree>` returns HTTP 200 but does nothing; the tool stays `running` forever. The
client now passes the housemate worktree on both reply routes. This was verified by direct
`/permission?directory=` inspection and by the completed `echo hi` tool part.

`session.idle` arrives while a permission is open; `task_completed` now leaves
`in_confession`/`queued_for_confession` intact until the question is answered.

## What is stubbed or missing

1. **Summon/evict UX is inline in the console, not a styled dialog.** Name, agent, model, folder
   and buttons work; feedback uses `alert`/`confirm`. Folder defaults server-side to the house repo.
2. **No agent/model badge on the hover card.** The session already carries `agent`/`model`; the
   card renderer was not extended.
3. **Guest flow not exercised with a real child session.** `guest_arrived`/`guest_left` mapping and
   the lanyard visual existed from Phase 2; no real `parentID` session was summoned in Phase 4
   (the client still never sends `parentID`). No visual proof.
4. **Model picker lists all 281 models** with no search. Defaults to `opencode/mimo-v2.6-flash-free`
   when present.
5. **No `GET /api/opencode/logs`**; managed-server stderr is captured in memory only, so diagnosing
   a failed turn requires the process window.
6. **Chat panel is the Phase 2 diary panel**; live token streaming is not rendered (only final
   assistant text is ingested by the store).
7. **Evict was tested on an idle session.** Process-tree kill for an actively running turn is
   unit-covered by `procutil` tests but not exercised against a live long-running tool in this pass.

## Files changed (this pass)

- `src/opencode-client.ts` — global event subscription + unwrap; directory-scoped permission and
  question replies.
- `src/housemates.ts` — permission options; route directory; scoped replies.
- `src/questions.ts` — store options for non-choice questions; `hasOpen(sessionId)`.
- `src/store.ts` — `task_completed` does not clear an open confession.
- `public/confession.ts` — real answer endpoint; option buttons for permissions.
- `public/console.ts` — real summon/evict/call; agent/model/folder/housemate selectors.
- `public/index.html` — new console controls.
- `docs/screenshots/phase-4/*.webp` — real captures at 1024×711 (viewport 1440×1000).
- `docs/visual-check.md` — Phase 4 section.

Earlier in the branch: `src/opencode-supervisor.ts`, `src/audit.ts`, `src/ratelimit.ts`,
`src/procutil.ts`, `src/security.ts`, `src/server.ts`, `src/types.ts`, configs, installer cleanup,
removal of the dead opencode plugin.

## Verification run

- `bun test` — 47 pass, 0 fail (1125 expectations).
- `bun run guard` — OK.
- `bun build public/main.ts --target browser` — OK (verification only; no build step added).
- Live: summon → call → permission → UI answer → `echo hi` completed; evict kept worktree/branch.

## UNVERIFIED

- Guest child-session lifecycle end to end (no real child session created).
- Evict during a running bash/tool turn (only idle evict observed).
- opencode server restart adoption with an in-flight turn (state-file reuse observed, not a crash).
- Codespaces/Unix behavior (Windows only by design).

## NEEDS HUMAN DECISION

1. **Keep the model picker unfiltered?** 281 models is unusable; recommend a short allowlist in
   `config/models.json` (default `opencode/mimo-v2.6-flash-free`, plus your paid choices).
2. **Permission policy default.** All sessions currently ask for bash. Keep per-session, or add a
   preset that allows read-only commands? No auto-approve is implemented.
3. **Guest sessions.** Wire real `parentID` guests in Phase 5, or drop the guest visual? Recommend
   wiring them; the schemas already carry `harness`/`guest`.
4. **Summon dialog styling.** Keep the inline console form (works) or spend an iteration on a modal
   matching the diary panel?
