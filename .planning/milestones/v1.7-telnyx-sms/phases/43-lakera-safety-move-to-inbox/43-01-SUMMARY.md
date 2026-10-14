---
phase: 43-lakera-safety-move-to-inbox
plan: 01
subsystem: api
tags: [postgres, safety-events, lakera, node-test, ci, migration]

requires:
  - phase: v1.3 Phase 20 (SAFETY-01)
    provides: safety_events table (migration 0009) and the /internal/safety-events API
provides:
  - migration 0015 (nullable safety_events.source_id + partial index, idempotent)
  - createSafetyEventsHandler in apps/app/src/safety/events-api.mjs (extracted from server.mjs)
  - source_id stored on POST and returned on GET, with a one-shot pg 42703 fallback on both
  - "Mark all reviewed" (no ids) covers the 7-day visible window
  - apps/app `npm test` script and CI job `app-tests` with a postgres:16 service
affects: [43-02 move-to-inbox route, 43-03 ops.safety UI, 43-04 PR/CI, Phase 44 migration numbering (after 0015)]

tech-stack:
  added: []
  patterns:
    - "Route handler factory with injected deps (store, config, readBody, sendJson, safeStringEqual) for node:test unit testing"
    - "Deploy-before-migration safety: catch pg 42703 once and retry with the legacy column set"
    - "Gated real-Postgres integration tests (TEST_DATABASE_URL) applying real migration files into a throwaway schema"

key-files:
  created:
    - apps/app/db/migrations/0015_v1_7_safety_events_source_id.sql
    - apps/app/src/safety/events-api.mjs
    - apps/app/src/safety/events-api.test.mjs
  modified:
    - apps/app/src/server.mjs
    - apps/app/package.json
    - .github/workflows/ci.yml

key-decisions:
  - "Mark-all window and list window share one constant (VISIBLE_WINDOW = '7 days'); badge count stays 24 h"
  - "Bad source_id (non-string, empty, >512 chars) is stored as NULL, never rejected"

patterns-established:
  - "Pattern: assert INSERT column->value by parsing the column list, not SQL text"

duration: ~35min
completed: 2026-10-13
---

# Phase 43 Plan 01: Student-app source_id + Safety tests in CI Summary

**The student app now stores and returns the Worker's `source_id` (Message-ID) on safety events via migration 0015. Inserts and the log both survive a deploy that lands before the migration. "Mark all reviewed" now covers the full 7-day log. All apps/app tests run in a new CI job backed by Postgres.**

## Performance

- **Duration:** about 35 min
- **Completed:** 2026-10-13
- **Tasks:** 2 of 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- LAK-02 (student-app half): `source_id` is carried end to end. The column comes from migration 0015, the POST insert stores it, and the GET select returns it.
- Ordering safety: if the database returns pg `42703` (undefined column), both INSERT and GET retry once with the legacy column set and log the warn event `safety_events_source_id_column_missing`. Any other error keeps its existing response: `500 write_failed` for the insert, `200 query_failed` for the list.
- LAK-04 (student-app half): mark-reviewed with no ids now uses the same 7-day window as the list.
- `apps/app` now has an `npm test` script that runs auth, safety/screen (VERIFY-03*) and events-api. The new CI job `app-tests` runs it against a postgres:16 service.

## Task Commits

The code is on branch `fix/v1.7-43-safety-move-to-inbox` in worktree `/Users/rajren/internjobs-cms-wt-43`. The branch was cut from `origin/main` at d1658aa and has not been pushed.

1. **Task 1: source_id end to end (tests first)**
   - `cf0fcf2` test(43-01): failing tests for safety-events source_id contract
   - `7ea78e3` refactor(43-01): extract safety-events handler (no behaviour change)
   - `6bb5c08` feat(43-01): store and return safety event source_id (migration 0015)
2. **Task 2: 7-day mark-all, npm test, CI job**
   - `44c5ff4` fix(43-01): mark-all-reviewed covers the 7-day visible window
   - `eab1d07` ci(43-01): run apps/app tests incl. safety screen tests in CI (v1.5 gap 6)

The plan metadata commit (SUMMARY, evidence, STATE) is on `docs/v1.7-telnyx-sms`.

## TDD Evidence (RED before GREEN)

Evidence files are in `evidence/` in this phase dir. They are listed in the order they were captured.

1. **RED-0** `evidence/43-01-red0.txt`: captured after the test-only commit `cf0fcf2`. The module did not exist yet:
   ```
   code: 'ERR_MODULE_NOT_FOUND',
   url: 'file:///.../apps/app/src/safety/events-api.mjs'
   # tests 1  # pass 0  # fail 1
   ```
2. **RED-1** `evidence/43-01-red1.txt`: captured after the verbatim extraction `7ea78e3`. It is the RED the verifier checks. Every new-behaviour test fails on an assertion, not an import error, and the characterization tests pass:
   ```
   not ok 1 - POST stores source_id          (+ undefined  - 'abc@mail.example')
   not ok 2 - POST normalises bad source_id  ('insert must carry a source_id column')
   not ok 3 - GET returns source_id          ('SELECT must list source_id')
   ok 4 - rejects missing or wrong bearer
   not ok 5 - INSERT falls back when source_id column is missing   (500 !== 200)
   not ok 6 - GET falls back when source_id column is missing      ('must retry once ...' 1 !== 2)
   ok 7 - GET non-42703 error still returns query_failed
   ok 8 - unreviewed-count keeps the 24 h flagged/blocked rule
   ok 9 - mark-reviewed with ids touches only those ids
   not ok 10 - mark-reviewed with empty body uses the same 7-day window as the list  (+ '24 hours' - '7 days')
   ok 11 - no_database skip responses are unchanged
   ok 12 - bad JSON -> 400, unknown subpath -> 404, other paths not handled
   not ok 1 - real Postgres round trip       ('column "source_id" does not exist', because 0015 was absent)
   not ok 2 - mark-reviewed with empty body covers the whole visible window  (+ 'aged 3 days': false)
   # tests 14  # pass 6  # fail 8
   ```
   This run is also the negative control for several must-haves: without migration 0015 the real round trip fails on `column "source_id" does not exist`; without `source_id` in the INSERT or SELECT, tests 1-3 fail; with the 24-hour window, the 3-day row stays unreviewed.
3. **GREEN (task 1)** `evidence/43-01-green-task1.txt`: 12/14 pass. The only failures are the two task-2 window tests, as planned: the unit test, and the integration test `(real Postgres) mark-reviewed with empty body covers the whole visible window`.
4. **GREEN (npm test)** `evidence/43-01-green-npmtest.txt`: `cd apps/app && npm test` exits 0 with **34 tests, 34 pass**. The output includes auth (15), events-api (12 unit + 2 integration), VERIFY-03a/b/c, VERIFY-04, and the VERIFY-01/02 skip line.
5. **Negative control (npm test script)** `evidence/43-01-negctl-npmtest.txt`: without screen.test.mjs in the file list there are 0 VERIFY-03a lines; with the real script there is 1.
6. **GREEN (final)** `evidence/43-01-green-final.txt`: events-api.test.mjs **14/14 pass**, run on the final code.

**Integration tests ran locally.** They used a throwaway Docker `postgres:16` on port 55432 (`TEST_DATABASE_URL=...?sslmode=disable`), and the container was stopped afterwards. They also run in CI through the `app-tests` postgres service.

## Files Created/Modified

- `apps/app/db/migrations/0015_v1_7_safety_events_source_id.sql`: adds a nullable `source_id text` column and the partial index `safety_events_source_id_idx`. It is idempotent: the integration test applies 0009 and 0015 twice.
- `apps/app/src/safety/events-api.mjs`: `createSafetyEventsHandler`, `normaliseSourceId`, the 42703 fallbacks and the shared `VISIBLE_WINDOW`.
- `apps/app/src/safety/events-api.test.mjs`: 12 unit tests and 2 gated integration tests.
- `apps/app/src/server.mjs`: the inline block of about 125 lines is replaced by `if (await safetyEventsHandler(req, res, url)) return;`, and the handler is built once at startup. A diff against the original block shows the body is verbatim except for the inverted path guard and `return true`.
- `apps/app/package.json`: adds the `test` script as an explicit file list. `test:auth` is kept.
- `.github/workflows/ci.yml`: adds the `app-tests` job ("student app tests") with a postgres:16 service. No other job was changed, and the YAML parses with 7 jobs.

## Verification

- `node --check src/server.mjs`: OK.
- `npm run build:app` (worktree root) exits 0 after task 1 and again after task 2. verify-app boots the server and polls `/healthz`.
- `git diff --stat origin/main..HEAD` touches only the 6 files in `files_modified`. `apps/parrot` is untouched.
- No secrets and no real email addresses appear in the tests or evidence. Fixtures use `abc@mail.example` and `emp_test_1`.
- CI being green on the PR is observed in plan 43-04. This plan does no pushes.

## Decisions Made

- The list query and mark-all share one `VISIBLE_WINDOW` constant, so the two windows cannot drift apart again. The unreviewed-count badge keeps its literal 24 hours, as the plan's disposition table says.
- `normaliseSourceId` trims the value, then keeps it only if it is 1 to 512 characters long. Otherwise it stores NULL and the row is still written.
- The warn log carries only `{event, op}`. Source_id values and previews are never logged.

## Deviations from Plan

None in scope. Two notes for the record:

- **Task 1 verify said "node --test exits 0" after task 1.** It could not, because the plan asks for the two task-2 window tests to be written in step 1 and to stay RED until task 2. After task 1 the file ran 12/14, and after task 2 it ran 14/14. This was sequencing, not a code deviation.
- **Task 2 step 1:** no test was added in task 2. The ids negative control (`mark-reviewed with ids touches only those ids`) had already been written in step 1 of task 1. RED for both window tests is recorded in red1, so `43-01-red2.txt` was not needed.

## Rulings

None. No plan conflicts arose.

## Issues Encountered

- After the green `npm test` evidence was captured, a later `npm test --workspace apps/app` was blocked by the local hook `local-suite-guard`, which says full suites belong on CI. I did not re-run it. The earlier passing run had been started as `env -u LAKERA_GUARD_API_KEY npm test`, before the hook fired; the `env` prefix was there to make sure the live Lakera tests skipped, not to get around the hook. Every other test run was the single file `node --test src/safety/events-api.test.mjs`.

## User Setup Required

None. When this ships, migration 0015 must be applied to the Fly student Postgres (`npm run migrate`). Applying it before or after the Fly deploy are both safe because of the 42703 fallbacks. That rollout belongs to a later plan in this phase.

## Next Phase Readiness

- Plan 43-02 can rely on GET `/internal/safety-events` returning `source_id`. The value is NULL for rows written before 0015, so D32's best-effort match applies to those.
- Phase 44 migrations must be numbered after 0015.

---
*Phase: 43-lakera-safety-move-to-inbox*
*Completed: 2026-10-13*
