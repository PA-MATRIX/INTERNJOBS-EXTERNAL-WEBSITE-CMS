---
phase: 43-lakera-safety-move-to-inbox
plan: 01
verified: 2026-10-13T00:00:00Z
status: passed
score: 8/8 must-haves verified
gaps: []
---

# Plan 43-01 Verification Report

**Goal:** student-app source_id end to end (LAK-02) plus student-app half of LAK-04 (7-day mark-all, apps/app tests in CI).
**Code:** /Users/rajren/internjobs-cms-wt-43, branch fix/v1.7-43-safety-move-to-inbox, HEAD eab1d07.

## Architectural Context Loaded

No locked sources found in this repo (.planning/NORTH-STAR.md absent). Plan's rule_dispositions table followed.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST stores source_id | VERIFIED | test 1 passes; INSERT has source_id as 9th column ($8) |
| 2 | Bad source_id normalised to NULL, row kept; 512 kept | VERIFIED | test 2 passes; normaliseSourceId trims, 1..512 else null |
| 3 | GET returns source_id | VERIFIED | test 3 passes; LIST_COLUMNS includes source_id |
| 4 | Bad/missing bearer -> 401, zero queries | VERIFIED | test 4 passes |
| 5 | INSERT 42703 fallback; other errors 500 write_failed | VERIFIED | test 5 passes; code retries legacy 8-col insert once, rethrows non-42703 |
| 6 | GET 42703 fallback; non-42703 -> 200 query_failed | VERIFIED | tests 6, 7 pass |
| 7 | Real Postgres round trip, 0009+0015 twice | VERIFIED | Re-ran with disposable postgres:16: 14/14 pass. With 0015 removed the round trip fails (RED); migration uses add column / create index if not exists |
| 8 | Mark-all uses 7-day window (1h, 3d marked; 8d not) | VERIFIED | integration test passes; negative control (VISIBLE_WINDOW set to 24 hours) makes unit test 10 and integration test 2 fail; file restored |
| 9 | npm test lists VERIFY-03a, auth, events-api, exits 0 | VERIFIED | Ran the script's three files with LAKERA_GUARD_API_KEY unset: 34 tests, VERIFY-03a present, 0 failures; package.json test script is an explicit file list |

(Plan's 8 truths; the npm-test truth is the 8th, rows above split truth 6/7 for clarity. Score 8/8.)

## Other checks

- TDD order: commit order cf0fcf2 (test only, 427 lines) -> 7ea78e3 (extract) -> 6bb5c08 (feat) -> 44c5ff4 -> eab1d07. red0 (import error) and red1 (assertion failures, e.g. `column "source_id" does not exist`, 24 hours vs 7 days) evidence files exist; red1 predates green-task1/green-npmtest/green-final.
- Migration 0015: nullable text column plus partial index, idempotent.
- CI: ci.yml parses (7 jobs, includes app-tests) with postgres:16 service, node 22, npm ci, `npm test --workspace apps/app`, TEST_DATABASE_URL set. Other jobs untouched. Note: the `app-tests` CI run itself is observed in plan 43-04 as stated.
- Scope: git diff --stat origin/main..HEAD touches exactly the 6 files_modified; apps/parrot untouched; worktree clean.
- Security pass: handler uses parameterised queries; only interpolated value is the constant VISIBLE_WINDOW; Bearer check uses safeStringEqual; warn log carries no source_id. No secrets or real emails in test/evidence files. No production writes (only a disposable local docker postgres, stopped and removed).

## Advisories (non-blocking)

- Full `npm test` was not run through npm (local-suite-guard); the equivalent node --test invocation of the script's exact file list was used.
- The 42703 retry in GET/INSERT relies on pg code only; fine for the stated deploy-order scenario.

## Gaps

None.

_Verifier: Claude (rrr-verifier)_
