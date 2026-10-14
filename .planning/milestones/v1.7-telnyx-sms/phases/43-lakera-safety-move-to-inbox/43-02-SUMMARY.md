---
phase: 43-lakera-safety-move-to-inbox
plan: 02
subsystem: api
tags: [workspace, parrot, durable-object, sqlite, lakera, safety-events, hono, vitest]

requires:
  - phase: 43-01
    provides: safety_events.source_id stored and returned by /internal/safety-events
  - phase: v1.5 Phase 36
    provides: Lakera hard-block quarantine into the employee's Spam folder
provides:
  - workers/lib/mailbox-lookup.ts (findEmailBySourceId, findSpamCandidatesByPreview, HEURISTIC_WINDOW_MS)
  - EmployeeMailboxDO RPC methods findEmailBySourceId / findSpamCandidatesByPreview
  - workers/lib/safety-move.ts (moveQuarantinedToInbox, canMoveToInbox, SafetyEventRow)
  - POST /api/ops/safety/:eventId/move-to-inbox (operator-only, audited, D31/D32)
  - GET /api/ops/safety rows carry can_move_to_inbox and the lakera_flagged label, and no longer include source_id
affects: [43-03 ops.safety UI (response contract), 43-04 PR/CI, 43-05 live UAT]

tech-stack:
  added: []
  patterns:
    - "SQL finders take an injectable exec(sql, ...params), so the same code runs against node:sqlite in tests and ctx.storage.sql.exec in the DO"
    - "Real-schema SQLite tests: build the DB from employeeMailboxMigrations[0].sql in node:sqlite (vitest execArgv --experimental-sqlite)"

key-files:
  created:
    - apps/parrot/workers/lib/mailbox-lookup.ts
    - apps/parrot/workers/lib/safety-move.ts
    - apps/parrot/workers/tests/lib/mailbox-lookup.test.ts
    - apps/parrot/workers/tests/lib/safety-move.test.ts
    - apps/parrot/workers/tests/routes/ops-safety-move.test.ts
  modified:
    - apps/parrot/workers/durableObject/index.ts
    - apps/parrot/workers/routes/ops-safety.ts
    - apps/parrot/workers/tests/routes/ops-safety.test.ts
    - apps/parrot/vitest.config.ts

key-decisions:
  - "Audit line is emitted for EVERY attempt after requireOperator, including rejections (unavailable, event_not_found, not_email, not_quarantined, no_target_employee, workspace not_found), not only the four orchestrator outcomes"
  - "elsewhere responds 200 with ok:false plus folder (id) and folder_name (display name); moved/already_in_inbox respond ok:true with reviewed:boolean"
  - "moveEmail returning false is reported as not_found (the row disappeared between lookup and move, e.g. the 30-day purge)"

patterns-established:
  - "Cross-mailbox writes resolve the target via WorkspaceDO.getEmployeeById -> getMailboxStub(env, clerk_user_id), only after requireOperator"

duration: ~25min
completed: 2026-10-13
---

# Phase 43 Plan 02: Operator Move to Inbox (server) Summary

**Operator-only `POST /api/ops/safety/:eventId/move-to-inbox`: it moves a Lakera-quarantined email from the owning employee's Spam folder to their Inbox. It matches by exact `source_id`, or by a unique preview and ±5-minute match for older rows (D32). It never trusts the sender (D31) and writes a JSON audit line on every attempt. The lookup SQL is proven against the real mailbox schema in node:sqlite.**

## Performance

- Started: 2026-10-14T03:43:51Z (UTC; 2026-10-13 local)
- Finished: 2026-10-14T03:50Z
- Tasks: 2 of 2, 4 code commits (2 test-first, 2 feat)

## Accomplishments

- Added `findEmailBySourceId`, which runs `message_id = ? OR id = ?` and returns the newest row. This covers both stored shapes: the RFC Message-ID, and the internal uuid fallback.
- Added `findSpamCandidatesByPreview`, which searches the Spam folder only, within ±5 minutes of `created_at`. It scans at most 200 rows and returns at most 3, with ids and folders only and never the body. The prefix compare happens in JS, so `%` and `_` are matched literally and a split surrogate pair at UTF-16 unit 80 still matches.
- The EmployeeMailboxDO exposes both finders as thin RPC methods. `moveEmail` is unchanged.
- Added the `moveQuarantinedToInbox` orchestrator. When `source_id` is present it does an exact lookup only and never falls through to the heuristic. When it is absent, it moves only if exactly one Spam candidate exists. It moves mail out of Spam only. The possible outcomes are moved, already_in_inbox, elsewhere, not_found and ambiguous.
- Added the route behind the existing `requireOperator`. It finds the target with `WORKSPACE.getEmployeeById(row.employee_id)` and then opens `getMailboxStub(env, employee.clerk_user_id)`. After moved or already_in_inbox it marks the row reviewed with `reviewed_by` set to the operator's email. It returns 200, 404, 409, 400 or 503 depending on the outcome. Responses never include the email id, subject or body.
- The list rows now carry `can_move_to_inbox` and the `lakera_flagged` label "Flagged by Lakera Guard". `source_id` is removed from every row.

## Task Commits

Code commits are on `fix/v1.7-43-safety-move-to-inbox` in the worktree `/Users/rajren/internjobs-cms-wt-43`. Nothing was pushed.

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 0d108d2 | test(43-02): failing tests for mailbox lookup finders |
| 1 GREEN | 3d27e00 | feat(43-02): mailbox lookup by source_id and Spam preview window |
| 2 RED | ca9282a | test(43-02): failing tests for operator Move to Inbox route |
| 2 GREEN | 8c6b66e | feat(43-02): operator Move to Inbox route with audit, D32 matching, lakera_flagged label |

## TDD Evidence (RED before GREEN)

The evidence files are in `evidence/` in this phase dir.

**Task 1 RED** (`43-02-red-lookup.txt`, captured before mailbox-lookup.ts existed):
```
FAIL  workers/tests/lib/mailbox-lookup.test.ts
Error: Cannot find module '../../lib/mailbox-lookup' imported from .../mailbox-lookup.test.ts
Test Files  1 failed (1)
```
**Task 1 GREEN** (`43-02-green-lookup.txt`):
```
✓ workers/tests/lib/mailbox-lookup.test.ts (13 tests)
Test Files  1 passed (1)   Tests  13 passed (13)
```
**Task 1 negative control** (`43-02-negctl-lookup.txt`): with `folder_id = 'spam'` removed from the query, the test fails with `× findSpamCandidatesByPreview > Inbox copy is not a candidate`. The code was then restored.

**Task 2 RED** (`43-02-red-route.txt`, captured before safety-move.ts and the route existed): 2 files failed and 16 of 16 route tests failed. Examples:
```
FAIL workers/tests/lib/safety-move.test.ts  Cannot find module '../../lib/safety-move'
AssertionError: expected 404 to be 403
AssertionError: moved: expected [] to have a length of 1 but got +0
AssertionError: expected undefined to be true   (can_move_to_inbox)
Test Files  2 failed (2)   Tests  16 failed (16)
```
**Task 2 GREEN** (`43-02-green-route.txt`):
```
✓ workers/tests/lib/safety-move.test.ts (11 tests)
✓ workers/tests/routes/ops-safety-move.test.ts (16 tests)
✓ workers/tests/routes/ops-safety.test.ts (1 test)
Tests  28 passed (28)
adjacent regression: inbox-actions (5), spam-purge (13), mailbox-lookup (13) -> Tests 31 passed (31)
```
**Task 2 negative controls** (`43-02-negctl-route.txt`; each mutation was applied, run, and then restored, and a byte compare confirmed the file matched the original):
- NC1: with `requireOperator` removed from the move route, the tests "non-operator gets 403…" and "unauthenticated gets 401" fail (2 failed).
- NC2: with the audit `console.log` replaced by a no-op, the tests "writes an audit line for every outcome" and the heuristic test that reads the audit `match` field fail (2 failed).
- NC3: with the `lakera_flagged` label entry dropped, the list test fails with `expected 'lakera_flagged' to be 'Flagged by Lakera Guard'`.

## Files Created/Modified

- `apps/parrot/workers/lib/mailbox-lookup.ts` (new): SQL finders over an injectable exec.
- `apps/parrot/workers/lib/safety-move.ts` (new): the orchestrator, `canMoveToInbox` and the `SafetyEventRow` type.
- `apps/parrot/workers/durableObject/index.ts`: two RPC methods next to `purgeExpiredSpam`.
- `apps/parrot/workers/routes/ops-safety.ts`: the new POST route, list enrichment, the label, and the header route list.
- `apps/parrot/vitest.config.ts`: `poolOptions.{forks,threads}.execArgv = ["--experimental-sqlite"]`.
- `apps/parrot/workers/tests/routes/ops-safety.test.ts`: the stale `getUnreviewedCount` comment was replaced. Behaviour is unchanged.
- The three new test files are listed in key-files.

## Verification

- Targeted Vitest files pass: lookup 13/13, orchestrator 11/11, route 16/16, existing ops-safety smoke 1/1, inbox-actions 5/5, spam-purge 13/13.
- `npm run typecheck` exited 0 with 0 `error TS` (`43-02-typecheck.txt`).
- `npm run build` exited 0 (`43-02-build.txt`).
- `grep -n trustSender` over safety-move.ts and ops-safety.ts finds nothing (exit 1). Only the tests mention it, to assert it is not called.
- **The whole parrot suite was NOT run locally.** The `local-suite-guard` hook blocks whole-suite and more-than-3-file Vitest runs (Raj: run full suites on RunsOn CI). That hook block is the reason for the gap. Only the files above ran locally. The full suite must run in CI when 43-04 pushes the branch. 18 of the 27 test files did not run here, including the route smoke tests that import `workers/index.ts`.
- Frontend impact: `required_steps` is unit_tests only. No Playwright or chrome_visual_check ran. Visual proof belongs to the 43-05 UAT.
- No secrets, deploys, pushes, or Fly/Cloudflare/Telnyx/GitHub writes. All fixtures are synthetic (`*.example.test`).

## Decisions Made

- The audit line covers every post-auth attempt, including rejections, not only the four orchestrator outcomes. "Audits every attempt" is a superset of the must-have, and the test asserts exactly one line per run.
- `elsewhere` returns `folder` (the id, e.g. `trash`) plus `folder_name` (e.g. `Trash`) so the 43-03 UI can show it without its own mapping.
- In 43-02 the route re-fetches the student API list to find the row (the API has no single-row GET). That list covers the last 7 days and at most 100 rows, so an older event returns `event_not_found`. That matches what the page can show.

## Deviations from Plan

- **[Rule 3 - Blocking] `npm ci` in the worktree's apps/parrot.** node_modules was missing because 43-01 only installed apps/app. The plan's branch_setup lists this step. npm skipped install scripts (esbuild, workerd, sharp postinstalls) by policy, and tests, typecheck and build all worked anyway.
- **Test harness detail:** `node:sqlite` is loaded through a variable specifier (`await import(SQLITE_SPECIFIER)`). The Workers tsconfig has no node types, so a static import would fail `tsc -b`. The SQL still runs for real; there is no fake.
- **Whole-suite GREEN replaced by targeted files.** A hook blocks the whole-suite run (see Verification), so the planned `43-02-green-all.txt` is `43-02-green-route.txt` instead.
- Files outside `files_modified`: none in the code commits.

## Rulings

None. No plan conflicts arose.

## Issues Encountered

- In the first NC2 attempt the mutation (`void (…,)`) was a syntax error, so the run showed "no tests". It was discarded and redone with a no-op function call, which gave a valid failing run. Only the valid run is in the evidence file.

## User Setup Required

None.

## Next Phase Readiness

- 43-03 can use the route contract: `{ok, outcome, reviewed?, folder?, folder_name?}`. HTTP statuses are 200 (moved, already_in_inbox, elsewhere), 404 (not_found, event_not_found), 409 (ambiguous), 400 (not_email, not_quarantined, no_target_employee), 503 (unavailable), and 401/403 from requireOperator. List rows carry `can_move_to_inbox`.
- Open item: the full parrot suite still has to run in CI (43-04).
- Node: CI must run Node 22.5 or later for `node:sqlite`. The `--experimental-sqlite` flag is harmless on later versions.
