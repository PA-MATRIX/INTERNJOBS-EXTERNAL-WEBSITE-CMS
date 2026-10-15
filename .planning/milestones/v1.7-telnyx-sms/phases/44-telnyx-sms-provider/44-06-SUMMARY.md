---
phase: 44-telnyx-sms-provider
plan: 06
subsystem: sms
tags: [sms, telnyx, preflight, gitleaks, ci, draft-pr, node-test, postgres]

# Dependency graph
requires:
  - phase: 44-telnyx-sms-provider
    provides: "44-01..44-05 code on feat/v1.7-44-telnyx-sms (HEAD f842749, 23 commits ahead of origin/main 951e103, 0 behind)"
provides:
  - "Local pre-flight: all 20 apps/app test files pass one at a time against a throwaway Postgres 16 (190 tests, 0 skipped)"
  - "Secret scan with a negative control: gitleaks found nothing in the branch's commits or in the apps/app tree"
  - "Draft PR #30 (DO NOT MERGE) against main; all 7 CI jobs pass, and the real-Postgres opt-out describe ran in CI"
affects: [46 cutover (D10 exception for Phase 44, migration 0016, merge and deploy), 45 10DLC text and HELP wording]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-file test loop driven by package.json scripts.test, which exits 1 naming the first failing file (scratchpad script, not committed)"
    - "Detect a skipped describe from the '# SKIP' marker, because node:test does not count a skipped describe in '# skipped'"

key-files:
  created:
    - .planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/44-06-preflight.txt
    - .planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/44-06-preflight-negctl.txt
    - .planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/44-06-gitleaks.txt
    - .planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/44-06-pr.txt
  modified: []

key-decisions:
  - "No rebase was needed: origin/main had not moved (0 behind, 23 ahead)"
  - "The CI check that a describe was skipped uses the '# SKIP' marker on the describe line, not the '# skipped' counter, which stays 0 when a whole describe is skipped"

patterns-established:
  - "Pre-push gate for this public repo: run gitleaks on origin/main..HEAD and on the tree, with a planted-key negative control in the scratch area, before any push"

# Metrics
duration: about 5 min (05:29:15Z to 05:34Z), single executor
completed: 2026-10-15
---

# Phase 44 Plan 06: Pre-flight, secret scan, draft DO-NOT-MERGE PR and green CI Summary

**All 20 apps/app test files pass one at a time against a real Postgres 16: 190 tests, 0 skipped. Removing the opt-out guard makes the loop fail on `telnyx-optout.test.mjs`. gitleaks catches a planted live-key string and finds nothing in the branch's 23 commits or in the apps/app tree. The branch is pushed as draft PR #30, titled "DO NOT MERGE". All 7 CI jobs pass. In `student app tests`, 190/190 pass, and the `sms_opt_outs (real Postgres)` describe ran rather than being skipped. Production is untouched.**

## Performance

- Start 2026-10-15T05:29:15Z, end about 05:34Z
- 2 tasks, 2 evidence commits on `docs/v1.7-telnyx-sms` (9bb74ac, c5005e4). No code commit: the code branch head is still f842749.

## Accomplishments

- **Per-file loop**: a scratchpad script reads `scripts.test` (20 files) and runs `node --test <file>` for each file on its own, with `TEST_DATABASE_URL` pointed at a throwaway PG16 on 127.0.0.1:54339 (`sslmode=disable`). Every file printed PASS and the loop exited 0. The per-file total of 190 matches CI.
- **Registration check** (`:(glob)` pathspec, per the amendment): all 17 test files added on the branch are registered in `scripts.test`, exit 0.
- **Build smoke**: `npm run build --workspace apps/app` printed "waitlist smoke checks passed", exit 0.
- **Diff scope**: the 31 changed files are all under `apps/app/`. `package-lock.json`, `apps/app/fly.toml` and `.github` show no diff. `SMS_PROVIDER = "mac-bridge"` is unchanged in fly.toml. The route at `server.mjs:900` is gated by `isTelnyxRouteEnabled(config)` and returns 401 `public_key_missing` before the body is read (D34). `api.telnyx.com` appears only as the `config.mjs:108` default. There is no `console.log` in telnyx.mjs, shared.mjs or opt-out-store.mjs.
- **Draft PR #30**: https://github.com/PA-MATRIX/INTERNJOBS-EXTERNAL-WEBSITE-CMS/pull/30. isDraft true, base main, state OPEN, head f842749d474d557be88d204a7956fbdf27479b5c. The body carries the required DO-NOT-MERGE / D10 / D34 statement.

## TDD Evidence (RED before GREEN)

This plan writes no product code, so test-first means each check's failure mode was proven before its passing run was recorded.

| Order | Evidence | Result |
| --- | --- | --- |
| RED (negative control) | `44-06-preflight-negctl.txt` | The guard call in `telnyx.mjs` was replaced with `if (false)`. Files 1–8 PASS, then `FAIL src/sms/telnyx-optout.test.mjs (exit 1) # tests 6 # pass 2 # fail 4`, loop exit 1. The file was restored with `git checkout`, and `git status` showed a clean tree. |
| GREEN | `44-06-preflight.txt` | 20/20 PASS, `ALL PASS`, loop exit 0. Every file reports `# skipped 0`. |
| RED (negative control) | `44-06-gitleaks.txt` | A freshly generated `sk_live_<openssl rand -hex 12>` was put in `apps/app/src/zz-scratch-secret.txt`. `leaks found: 1`, exit 1. The file was then removed and never staged. |
| GREEN | `44-06-gitleaks.txt` | `--log-opts origin/main..HEAD`: 23 commits scanned, no leaks, exit 0. `--no-git --source apps/app`: no leaks, exit 0. |
| Control for the CI skip check | `44-06-pr.txt` (tail) | With `TEST_DATABASE_URL` unset, the run prints `ok 2 - sms_opt_outs (real Postgres) # SKIP` while `# skipped 0`. In CI the describe printed `ok 62 - sms_opt_outs (real Postgres)` with 8 ok subtests, and there are 0 `# SKIP` markers in the whole log. |

## CI results (run 38687206788, PR #30)

| Job | Result |
| --- | --- |
| student app tests | pass (1m27s). `# tests 190 / pass 190 / fail 0 / cancelled 0 / skipped 0`. The real-Postgres describes ran: safety-events handler, mac-bridge pairing path, sms_opt_outs. |
| workspaces (marketing · app · employers) | pass (1m14s; includes `npm run build:app`) |
| workspace worker (parrot) | pass |
| startups worker (typecheck · tests) | pass |
| email timeout invariant (cross-package) | pass |
| email worker (tests) | pass |
| submission gate (rrr) | pass. This is an expected no-op, because there is no submission file in the diff. It proves nothing about Phase 44. |

`gh pr checks 30 --watch` exited 0. The CI Postgres service URL already uses `?sslmode=disable`, so the risk the brief flagged did not occur.

## Task Commits

1. **Task 1: local pre-flight**: `9bb74ac` (docs branch) docs(44-06): local pre-flight evidence
2. **Task 2: push, draft PR, CI**: `c5005e4` (docs branch) docs(44-06): draft PR #30 and CI evidence

Outward actions, both authorized by the plan: `git push -u origin feat/v1.7-44-telnyx-sms` and `gh pr create --draft --base main`.

## Files Created/Modified

- `evidence/44-06-preflight.txt`: per-file loop, registration check, build smoke, diff scope checks
- `evidence/44-06-preflight-negctl.txt`: loop with the guard removed (exit 1, names telnyx-optout.test.mjs)
- `evidence/44-06-gitleaks.txt`: planted-key control (exit 1) and two real scans (exit 0)
- `evidence/44-06-pr.txt`: PR #30 metadata, final checks table, app-tests log excerpts, skip-detector control

## Phase state handed on

- **Migration 0016 (`sms_opt_outs`) has NOT been applied** in any environment. Phase 46 must apply it as an approved executor task before `SMS_PROVIDER=telnyx`. Otherwise every Telnyx send fails closed.
- **`fly.toml` is unchanged**: `SMS_PROVIDER = "mac-bridge"`. Production has no `TELNYX_WEBHOOK_PUBLIC_KEY`, so `/webhooks/telnyx/sms` returns 401 to every request.
- No merge, deploy, Telnyx call, Fly call, secret change or production write happened.

## Decisions Made

- No rebase: origin/main 951e103 had not moved since the branch point (0 behind).
- The skip detector for the CI real-Postgres check is the `# SKIP` marker, because a skipped describe leaves the `# skipped` counter at 0. This was found while recording the control. The plan's wording ("would make that describe skip, which the log check detects") still holds, but only via the marker.

## Deviations from Plan

- `evidence/44-06-preflight-negctl.txt` is not in the frontmatter `files_modified`, but the plan's Task 1 action and its `<verification>` require it. It was committed with the other evidence.
- I added the `:(glob)` registration check to the preflight evidence even though this plan does not explicitly require it. It is read-only.
- gitleaks prints ANSI colour codes, which were stripped from `44-06-gitleaks.txt` for readability. The content is otherwise unchanged.

Otherwise the plan was executed exactly as written.

## Rulings

None. No plan conflicts arose.

## Carry-forward flags (Phases 45/46)

1. **D10 exception for the Phase 44 merge**: Raj must record it. D33 covered Phase 43 only. PR #30 stays a draft marked DO NOT MERGE until then.
2. **HELP wording vs the 10DLC campaign text, and Telnyx's own HELP auto-reply** (Phase 45/46): confirm the student does not get two replies.
3. **10DLC opt-in disclosure on the pairing page** ("Msg & data rates may apply, reply STOP to opt out"): Phase 45.
4. **System prompt iMessage wording** (`workflows/student-inbound.mjs` about lines 368, 1356, 1378): Phase 46.
5. **One phrase-STOP UAT** ("please stop texting me", which is not consumed as a keyword): Phase 46.
6. **Migration 0016 before the flip**, D34 signed canary: Phase 46.
7. **422 on a Telnyx pairing `confirmation.error`** makes Telnyx retry a message that can never succeed (CONTEXT.md). Review in Phase 46.

## Issues Encountered

None. The local suite guard did not block the loop script.

## User Setup Required

None for this plan. The D10 exception decision is Raj's (see carry-forward 1).

## Next Phase Readiness

Phase 44 plans 01–06 are complete. Next step: the rrr-verifier pass on 44-06, then the phase verification. PR #30 is CI-green and waiting for that review and for Raj's D10 decision.
