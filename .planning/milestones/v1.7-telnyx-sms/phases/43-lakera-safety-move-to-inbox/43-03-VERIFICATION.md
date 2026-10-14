---
phase: 43-lakera-safety-move-to-inbox
plan: 03
verified: 2026-10-13T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
gaps: []
---

# Phase 43 Plan 03: Verification Report

**Goal:** /ops/safety Move to Inbox UI (LAK-01 UI) and honest Mark-all (LAK-04). Code: `/Users/rajren/internjobs-cms-wt-43`, commits 74aa511, 2f34ad7, 57c213b, eb16fa7 on 8c6b66e.
**Status:** passed
**Re-verification:** No (initial)

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` in this repo.
- Locked source: `43-CONTEXT.md` D31 (operators may move any employee's quarantined mail, audited), D32 (best-effort match, UI message "not found — check Spam"), D10 (no merge or deploy). Nothing here contradicts them.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Button only for movable rows | VERIFIED | SafetyMoveCell renders the button only when `can_move_to_inbox` is true; otherwise "—". The UI does not re-derive eligibility from channel or action. I re-applied the negative control (`if (false)` in place of the gate): "renders a Move to Inbox button only for movable rows" failed, 1 failed / 9 passed. After `git checkout` the worktree was clean and 10/10 passed. |
| 2 | Every outcome has its own message; failures never read as success | VERIFIED | `moveToInbox` needs a 2xx and a moved/already_in_inbox outcome for success. elsewhere, not_found (404) and ambiguous (409) map to `info`. 403 maps to "Only operators can move quarantined mail". Everything else, including network errors, maps to "Move failed — try again". Not-found copy starts with "Not found — check Spam" (plus a purge hint) and ambiguous appends "(several similar messages, nothing was moved)". |
| 3 | Mark-all only clears rows on server confirmation | VERIFIED | `markAllReviewed` returns ok only for `res.ok`. The reducer `markAllDone(ok=false)` leaves rows unreviewed and sets an error toast. The page refetches only when ok. The `.catch(() => null)` that swallowed errors is gone. Negative control M2 recorded in 43-03-mutations.txt. |
| 4 | Reducer drives the page | VERIFIED | The page keeps no useState. It uses `useReducer` and dispatches moveStarted, moveFinished, markAllStarted, markAllDone, loaded, loadFailed and dismissToast. |
| 5 | moving disables the button; done shows Moved | VERIFIED | SafetyMoveCell: status moving gives a disabled "Moving…" button; done gives "Moved" text. Both are covered by a test. |
| 6 | typecheck + build pass; bundle references the endpoint | VERIFIED | `npm run typecheck` exit 0; `npm run build` exit 0. Manifest `build/client/assets/manifest-f2082f7c.js`, key `routes/ops.safety`, module `/assets/ops.safety-B_eB2QFc.js`. `grep -c move-to-inbox` on that chunk = 1, and it contains "Move to Inbox" once. |

## Additional checks requested

- **Failed reload keeps rows:** `loadFailed` only clears `loading`; events are kept. RED test 57c213b was written first and the fix is in eb16fa7.
- **No leak to the browser:** `source_id` does not appear in `safety-log.ts`, `SafetyMoveCell.tsx` or `ops.safety.tsx`. The server list route strips it (`const { source_id: _sourceId, ...rest } = row`) and clips preview to 80 chars. The move request body is `{}` and no email content is sent. The `SafetyEvent` type has no source_id field.
- **Deviations:** `SafetyEvent` moved into `app/lib/safety-log.ts`, plus the `loadFailed` and `markAllStarted` actions. Both are within files_modified. `git diff --stat 8c6b66e HEAD` touches exactly the 4 listed files (3 code files and the test file). `vitest.config.ts` is untouched.
- **RED before GREEN:** commit order is test 74aa511, feat 2f34ad7, test 57c213b, feat eb16fa7. 43-03-red.txt shows the module-not-found failure. 43-03-red-wiring.txt shows 1 failed of 10. Test-first ordering holds.
- **Test runs:** safety-log passes 10/10. All 28 `workers/tests` files were run in 10 batches of 3 or fewer: 28 passed, 0 failed, 211 tests (201 in the 27 other files plus 10 here). This matches the SUMMARY.
- **Security pass (Pass 1):** no findings. The files are pure UI/helpers with no SQL, shell or LLM boundary. Path ids are passed through `encodeURIComponent`.

## Accepted gap (not a failure)

The JSX rendering of the page `ops.safety.tsx` (column placement, toast display and auto-dismiss timing, refetch ordering) is proven only through the reducer and cell tests. The on-screen proof belongs to the 43-05 UAT (button on a blocked email row, absent on SMS and soft-flag rows, per-outcome toasts, Mark-all against a failing server keeps rows amber).

## Human verification

Covered by 43-05 (visual UAT). No new items.

## Notes for 43-04

Resolve the chunk through manifest key `routes/ops.safety`. Hashes change per build.

_Verifier: Claude (rrr-verifier)_
