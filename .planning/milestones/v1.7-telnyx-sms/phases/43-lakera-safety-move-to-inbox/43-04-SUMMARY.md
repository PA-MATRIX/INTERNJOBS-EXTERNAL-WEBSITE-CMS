---
phase: 43-lakera-safety-move-to-inbox
plan: 04
subsystem: infra
tags: [readback, live-verification, ci, github-actions, fly, wrangler, gitleaks, node-test]

requires:
  - phase: 43-01
    provides: app-tests CI job, migration 0015, source_id end to end
  - phase: 43-02
    provides: POST /api/ops/safety/:eventId/move-to-inbox
  - phase: 43-03
    provides: /ops/safety Move to Inbox UI; manifest key routes/ops.safety
provides:
  - scripts/verify-workspace-quarantine-live.mjs with opt-in --require-move-control (checkBundle requireMoveControl)
  - PR #29 (fix/v1.7-43-safety-move-to-inbox -> main), all 7 CI checks green, NOT merged
  - evidence/ROLLBACK-43.md (Fly v57 image + digest, Worker 77f32645-e61e-438b-9868-6b44580c3b8d, DB leave-column note)
  - pre-deploy production baselines (move-control RED exit 1, v1.5.1 readback GREEN)
affects: [43-05 D10 exception, merge, deploy, post-deploy readback and UAT]

tech-stack:
  added: []
  patterns:
    - "Served-bundle readback resolves route chunks through the manifest route key, never through hashed file names"
    - "New readback checks are opt-in flags, so the meaning of an existing GREEN never changes"

key-files:
  created:
    - scripts/verify-workspace-quarantine-live.mjs
    - scripts/verify-workspace-quarantine-live.test.mjs
    - .planning/milestones/v1.7-telnyx-sms/phases/43-lakera-safety-move-to-inbox/evidence/ROLLBACK-43.md
  modified: []

key-decisions:
  - "--require-move-control needs BOTH the 'Move to Inbox' label and the 'move-to-inbox' endpoint in the routes/ops.safety closure. A missing route is its own problem."
  - "Fly rollback is recorded as a pinned-image redeploy (fly deploy --image ...ZEC), because fly releases rollback is not reliable across flyctl versions"
  - "Worker rollback target is 77f32645, not 69c90a82 (69c90a82 is the pre-v1.5.1 version without Spam/Trust-sender)"

patterns-established:
  - "Pre-deploy pair: the new readback is RED and the old readback is GREEN, both recorded before any live action"

duration: ~6min
completed: 2026-10-13
---

# Phase 43 Plan 04: Readback extension, PR with green CI, rollback targets and RED baselines Summary

**The v1.5.1 served-bundle readback is now on the code branch with a new opt-in `--require-move-control` flag. With the flag, it looks up `routes/ops.safety` in the manifest and requires both the "Move to Inbox" label and the `move-to-inbox` endpoint. Against production today it prints RED (exit 1), while the plain v1.5.1 readback prints GREEN. PR #29 is open against main with all 7 CI checks green and is not merged. Rollback targets are recorded.**

## Performance

- **Duration:** ~6 min (2026-10-14T03:59:12Z to 04:04:18Z UTC)
- **Tasks:** 2 of 2
- **Files modified:** 2 code files (worktree) and 9 evidence files (docs branch)

## Accomplishments

- `checkBundle(base, { requireParrot = true, requireMoveControl = false })`. When `requireMoveControl` is on, it fetches the `routes/ops.safety` module and its static imports (using the existing `fetchClosure`). It reports a separate problem for each missing marker, and another if the manifest has no ops.safety route. The new CLI flag is `--require-move-control`. The script still makes GET requests only and sends no credentials.
- 8 new tests, 18 in total. The 10 original v1.5.1 tests are unchanged and pass.
- Pushed the branch after a gitleaks scan over 16 commits found no leaks. Opened PR #29 with the D10 do-not-merge note. CI run 38509278169 passed all 7 checks.
- Recorded the rollback targets from read-only CLI listings.
- Recorded the pre-deploy production baselines.

## Task Commits

Code commits are on `fix/v1.7-43-safety-move-to-inbox` in `/Users/rajren/internjobs-cms-wt-43`, pushed to origin.

| Task | Commit | Message |
|------|--------|---------|
| 1 baseline | db47f11 | chore(43-04): bring v1.5.1 quarantine readback onto the code branch |
| 1 RED | d2aae5c | test(43-04): failing tests for --require-move-control |
| 1 GREEN | 7f3b948 | feat(43-04): readback can require the Move to Inbox control in the served bundle |
| 2 | 85a8c50 (docs branch) | docs(43-04): preflight, PR, rollback targets and RED baselines |

## TDD Evidence (RED before GREEN)

- **Baseline** (`evidence/43-04-baseline-tests.txt`): the unchanged copy from `origin/docs/patch-v1.5.1-workspace-deploy` passed 10 of 10.
- **RED** (`evidence/43-04-red.txt`), with the new tests and no implementation: 13 passed and 5 failed.
  - Failed: 11 "served ops.safety chunk without the control is RED", 12 "label present but endpoint missing", 15 "control only in an unreachable chunk", 16 "manifest with no ops.safety route", and 18 "CLI exits 1 without the control".
  - The positive and flag-off tests (13, 14, 17) already passed, as expected, because the unchanged script ignores the safety route.
- **GREEN** (`evidence/43-04-green.txt`): 18 of 18 passed, exit 0.
- **Negative control M1** (appended to `43-04-green.txt`): disabling the new check with `if (false && requireMoveControl)` brings back exactly the same 5 failures (13 passed, 5 failed). The file was restored afterwards and is 18 of 18 again.
- **Manifest key** was checked against the 43-03 build, not assumed. In `apps/parrot/build/client/assets/manifest-f2082f7c.js`, the key `routes/ops.safety` points to module `/assets/ops.safety-B_eB2QFc.js`. That is the only built chunk that contains `move-to-inbox` or "Move to Inbox".

## Verification

- **Local preflight** (`evidence/43-04-preflight.txt`): all passed (exit 0).
  - `npm run build:app`
  - apps/parrot `npm run typecheck` and `npm run build`
  - `node --test scripts/verify-workspace-quarantine-live.test.mjs` (18 of 18)
- **Branch scope:** `git diff --name-only origin/main..HEAD` lists only paths under apps/app, apps/parrot, scripts/verify-workspace-quarantine-live* and .github/workflows/ci.yml. Nothing falls outside that list, and the merge base is origin/main d1658aa.
- **Secret scan** (`evidence/43-04-secret-scan.txt`): `gitleaks git --log-opts="origin/main..HEAD" --redact` (gitleaks 8.30.1) scanned 16 commits and found no leaks; the report is `[]`.
- **PR #29** (https://github.com/PA-MATRIX/INTERNJOBS-EXTERNAL-WEBSITE-CMS/pull/29), head 7f3b948c. `gh pr checks 29 --watch` exited 0, and all 7 checks passed: submission gate, workspaces, student app tests (app-tests), workspace worker (parrot), startups worker, email timeout invariant and email worker. Details are in `evidence/43-04-pr.txt`.
  - The app-tests log shows `ok 18 - VERIFY-03a: missing API key returns fail-open immediately` and `# tests 34 / pass 34 / fail 0`, including the real-Postgres safety-events tests.
  - parrot vitest: 28 of 28 files and 211 of 211 tests passed.
  - **Job negative control:** origin/main's ci.yml contains no `app-tests` job (`grep -c` returns 0). The checks on PR #27, the last PR into main, have no "student app tests" row. That is the "job removed" state.
- **Production baselines:** GET requests only, no credentials.
  - `--require-move-control` printed RED and exited 1. It reported "missing in served routes/ops.safety chunk: Move to Inbox label" and "... move-to-inbox endpoint" (`43-04-baseline-red.txt`).
  - Without the flag, the readback printed GREEN and exited 0 (`43-04-baseline-v151.txt`).
  - The premise holds: the live Worker does not yet have the control, and the v1.5.1 quarantine readback is healthy.
- **Evidence secret grep:** no match for `Bearer`, `sk-` or `postgres://` in any 43-04 evidence file. The worktree is clean after the push.

## Decisions Made

- The two markers are checked separately, so a half-deployed control (label present but no endpoint) is still RED.
- The Fly rollback is written as a pinned-image `fly deploy --image`, with a digest check afterwards.
- The Worker rollback target is explicitly 77f32645, with a warning not to go back to 69c90a82.

## Deviations from Plan

**1. [Rule 3 - Blocking] Whole-suite `npm test` was not run locally**
- **Found during:** Task 2, step 1
- **Issue:** `~/.claude/hooks/local-suite-guard.js` blocks `npm test` as a whole-suite run, following Raj's rule that test suites run on CI and not on the Mac. The hook says not to respell the command to get past it.
- **Fix:** Locally I ran build:app, parrot typecheck and build, and the 18-test readback file. The full apps/app and apps/parrot suites ran on CI for PR #29: app-tests 34 of 34, parrot 211 of 211. The preflight evidence file states this.
- **Files modified:** none (evidence only)

**2. Truth 4's "delete the app-tests job" negative control was taken from origin/main, not from a mutated push**
- Pushing a mutated workflow to the PR would have been an extra outward action that this plan did not authorize. origin/main's ci.yml has no app-tests job, and PR #27's checks have no "student app tests" row. That gives the same proof, read-only.

No other deviations. No files outside `files_modified` were touched in the worktree. The evidence files are the plan's declared outputs.

## Rulings

None - no plan conflicts arose.

## Next Phase Readiness

43-05 can start from three things:
- PR #29, green and unmerged
- a readback that is RED now and must be GREEN after the deploy
- rollback targets on record in `evidence/ROLLBACK-43.md`

**Concern for 43-05: the student app on Fly is older than main.**
- Fly `internjobs-ai-student-app` is still on release **v57 from 2026-05-25**, but origin/main changed `apps/app` up to 2026-06-10, including migrations 0013 and 0014.
- That means a Fly deploy from main ships more than Phase 43. Before deploying, 43-05 should read back which DB migrations are applied and record the list. Raj should know the deploy covers the backlog since May 25.

43-05 still needs Raj's recorded D10 exception before anything is merged.
