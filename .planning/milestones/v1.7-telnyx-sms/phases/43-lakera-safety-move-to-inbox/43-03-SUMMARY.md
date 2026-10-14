---
phase: 43-lakera-safety-move-to-inbox
plan: 03
subsystem: ui
tags: [workspace, parrot, react, react-router, ops-safety, lakera, vitest, react-dom-server]

requires:
  - phase: 43-02
    provides: POST /api/ops/safety/:eventId/move-to-inbox outcomes (moved, already_in_inbox, elsewhere+folder_name, not_found, ambiguous) and the can_move_to_inbox row flag
  - phase: 43-01
    provides: server-side Mark-all covering the 7-day visible window
provides:
  - apps/parrot/app/lib/safety-log.ts (moveToInbox, markAllReviewed, outcomeMessage, safetyLogReducer + action creators, SafetyEvent type)
  - apps/parrot/app/components/SafetyMoveCell.tsx (idle / moving / done / error)
  - /ops/safety Recover column, inline role=status toast, Mark all that only claims success on server ok, refetch after success
affects: [43-04 PR/CI + build readback (manifest key routes/ops.safety), 43-05 live UAT (visual proof)]

tech-stack:
  added: []
  patterns:
    - "Page state lives in a pure reducer under app/lib, so page wiring reduces to dispatching tested actions"
    - "UI helpers take apiFetch as a parameter so they run in plain Node Vitest; components are checked with react-dom/server renderToStaticMarkup"

key-files:
  created:
    - apps/parrot/app/lib/safety-log.ts
    - apps/parrot/app/components/SafetyMoveCell.tsx
    - apps/parrot/workers/tests/lib/safety-log.test.ts
  modified:
    - apps/parrot/app/routes/ops.safety.tsx

key-decisions:
  - "Success needs BOTH a 2xx status AND a success outcome (moved/already_in_inbox); a 500 whose body claims moved is an error"
  - "Info outcomes are matched to their exact status (elsewhere 200, not_found 404, ambiguous 409); anything else, including 503 unavailable and the 400 eligibility rejections, reads 'Move failed — try again'"
  - "not_found copy: 'Not found — check Spam. It may have been deleted before Oct 9 or purged.'; ambiguous appends '(several similar messages, nothing was moved)'"
  - "A failed refetch keeps the rows on screen (loadFailed); only the first load shows the empty state"
  - "SafetyEvent type moved from the route into app/lib/safety-log.ts (with can_move_to_inbox) so the reducer, the cell and the page share one shape"

patterns-established:
  - "Non-success move results leave the row status 'error' so the button stays available for a retry"

duration: ~6min
completed: 2026-10-13
---

# Phase 43 Plan 03: /ops/safety Move to Inbox UI and honest Mark-all Summary

**The /ops/safety log gets a Recover column. Blocked email rows that the server marks `can_move_to_inbox` show a "Move to Inbox" button. Each server outcome gets its own toast, and a failure never reads as success. "Mark all reviewed" now flips rows and refetches only when the server confirms. Before, it swallowed errors and flipped every row anyway. All page state goes through one tested pure reducer.**

## Performance

- Started: 2026-10-14T03:52:35Z (UTC; 2026-10-13 local)
- Finished: 2026-10-14T03:57Z
- Tasks: 2 of 2, 4 code commits (2 test-first, 2 feat)

## Accomplishments

- Added `moveToInbox(apiFetch, id)`, which POSTs `/api/ops/safety/${encodeURIComponent(id)}/move-to-inbox` with `{}` and returns `{kind, outcome?, message}`. It never throws. A 403 gets "Only operators can move quarantined mail". Network errors, unparsable bodies, 5xx responses and unknown outcomes all get "Move failed — try again".
- Added `markAllReviewed(apiFetch)`. It returns `{ok}` only when `res.ok`. Otherwise it returns "Could not mark all reviewed — try again".
- Added `safetyLogReducer`, which holds events, statusById, toast, loading and marking. Its actions are loaded, loadFailed, moveStarted, moveFinished, markAllStarted, markAllDone and dismissToast.
- Added `SafetyMoveCell`. It shows the button only when `can_move_to_inbox` is set and the status is idle or error. While moving it shows a disabled "Moving…". After a move it shows "Moved". Rows that can't be moved show "—".
- Changed `ops.safety.tsx` to use `useReducer` and to reuse `loadEvents()` for both the initial load and refetches. It adds the Recover column header and cell, and a fixed inline toast with `role="status"` that dismisses after 4 s (the InboxPane pattern). The `.catch(() => null)` that swallowed Mark-all errors is removed. The header comment is updated. The nav, the empty state and the other columns are unchanged.

## Task Commits

Code commits are on `fix/v1.7-43-safety-move-to-inbox` in the worktree `/Users/rajren/internjobs-cms-wt-43`. Nothing was pushed.

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 74aa511 | test(43-03): failing tests for safety log Move to Inbox UI helpers |
| 1 GREEN | 2f34ad7 | feat(43-03): safety log helpers and Move to Inbox cell |
| 2 RED (wiring) | 57c213b | test(43-03): failing test for refetch failure keeping rows on screen |
| 2 GREEN | eb16fa7 | feat(43-03): Move to Inbox button, toasts and honest Mark-all in /ops/safety |

## TDD Evidence (RED before GREEN)

The evidence files are in `evidence/` in this phase dir.

**Task 1 RED** (`43-03-red.txt`, captured before safety-log.ts and SafetyMoveCell.tsx existed):
```
Error: Cannot find module '../../../app/lib/safety-log' imported from .../safety-log.test.ts
Test Files  1 failed (1)   Tests  no tests
```
**Task 1 GREEN** (`43-03-green-task1.txt`):
```
✓ workers/tests/lib/safety-log.test.ts (9 tests)
Test Files  1 passed (1)   Tests  9 passed (9)
```
**Task 1 negative controls** (`43-03-mutations.txt`). Each mutation was applied, run and then restored from a backup. After restoring, the file passed 9 of 9 tests.
- M1: with the `can_move_to_inbox` condition in SafetyMoveCell removed, "renders a Move to Inbox button only for movable rows" fails (1 failed).
- M2: with Mark-all made optimistic again (rows flip whatever `ok` is), "markAllReviewed only clears local rows when the server confirmed" and "safetyLogReducer drives the page state" fail (2 failed).
- M3: with the HTTP status ignored so the body outcome alone decides success, "failures never read as success (negative control)" fails (1 failed).

**Task 2 RED (wiring)** (`43-03-red-wiring.txt`). Wiring turned up a transition the tests did not cover: a failed refetch must not wipe the table. The test was written first and failed:
```
× safetyLogReducer > a failed load ends loading without wiping rows already on screen
```
**Task 2 GREEN** (`43-03-green-all.txt`): 10 of 10 tests in safety-log, then the whole suite in batches.

## Verification

- **All 28 `workers/tests` files were run in 10 explicit batches of 3 or fewer** (`43-03-green-all.txt`): 28 files passed and 0 failed, 211 tests passed. The results for each file are in the evidence file. The batches were run explicitly because `local-suite-guard` blocks whole-suite and glob runs. Unlike 43-02, this time every file ran locally.
- `npm run typecheck` exited 0. `npm run build` exited 0.
- Build readback for 43-04:
  - manifest `build/client/assets/manifest-f2082f7c.js`
  - **manifest key `routes/ops.safety`**
  - module `/assets/ops.safety-B_eB2QFc.js`
  - `grep -c move-to-inbox` on that chunk = 1, and it contains "Move to Inbox" once
  - The hashes change with every build, so 43-04 should resolve the chunk through the manifest key, not the file name.
- JSX in the `.ts` test: the test builds elements with `React.createElement`, and Vitest/esbuild transformed the imported `.tsx` component without any config change. `vitest.config.ts` is untouched.
- Frontend: no `any` casts were added, and `can_move_to_inbox` is typed as `boolean`. `required_steps` is unit_tests only, and no Playwright or chrome_visual_check ran. The on-screen proof belongs to the 43-05 UAT. The JSX rendering of the page itself is an accepted untested gap, as the plan states.
- No deploys, pushes, third-party writes or secrets. All fixtures are synthetic.

## Decisions Made

See key-decisions in the frontmatter. The main one is that success requires both a 2xx status and a success outcome. Mutation M3 proves this.

## Deviations from Plan

1. **SafetyEvent interface moved, not extended in place.** The plan said to extend the `SafetyEvent` interface in `ops.safety.tsx`. Instead it now lives in `app/lib/safety-log.ts`, with `can_move_to_inbox: boolean`, and the route imports it. That gives the reducer, the cell and the page one shared type. The file is in the plan's `files_modified`.
2. **`loadFailed` action added (Rule 2, missing critical).** The page was wired so that a failed refetch after a move or Mark-all would replace the visible rows with `[]`. The test was added first (RED at 57c213b) and the fix followed. The initial-load behaviour is unchanged: a 403 or error still shows the empty state.
3. **`markAllStarted` action and `loading`/`marking` live in the reducer.** The plan listed the actions loaded, moveStarted, moveFinished, markAllDone and dismissToast. With these additions the page keeps no `useState` at all.
4. Not-found copy follows the executor rule: "Not found — check Spam. It may have been deleted before Oct 9 or purged." It still contains the plan's "Not found — check Spam" string.

No files outside `files_modified` were touched.

## Rulings

None. No plan conflicts arose.

## Next Phase Readiness

- 43-04 can use the manifest key `routes/ops.safety` for the build readback. The full suite should still run on CI when the branch is pushed.
- 43-05 UAT should check that the button appears on a blocked email row and not on SMS or soft-flag rows, that each outcome shows its own toast, and that Mark-all on a failing server keeps the rows amber.
