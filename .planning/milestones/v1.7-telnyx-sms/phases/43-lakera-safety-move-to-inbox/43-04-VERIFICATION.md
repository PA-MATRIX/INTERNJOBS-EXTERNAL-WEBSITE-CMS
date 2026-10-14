---
phase: 43-lakera-safety-move-to-inbox
plan: 04
verified: 2026-10-14T04:20:00Z
status: passed
score: 4/4 must-haves verified
---

# Plan 43-04 Verification Report

**Goal:** readback tooling extended, PR open with green CI, rollback targets recorded, pre-deploy baselines captured, nothing merged or deployed.

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` in this repo. Global CLAUDE.md (RRR, TDD-first, live actions need recorded approval) and plan `rule_dispositions` (D10 main freeze: open PR, do not merge) applied.

## Truths

| # | Truth | Status | Evidence (re-run by verifier) |
|---|-------|--------|-------------------------------|
| 1 | require-move-control RED/GREEN tests; removing check fails them | VERIFIED | Tests 11, 12, 15, 16, 18 fail with the check disabled (`if (false && requireMoveControl)`): 13 pass / 5 fail. Restored: 18/18. Worktree clean afterwards. |
| 2 | Original 10 tests unchanged and green; flag opt-in | VERIFIED | `node --test` 18/18 pass. Flag-off test (17) passed even in the RED evidence. Production readback without the flag is GREEN. |
| 3 | Production before deploy: flag = RED exit 1; no flag = GREEN | VERIFIED | Live GET: with flag prints "FAIL: missing ... Move to Inbox label / move-to-inbox endpoint", RED. Without: GREEN. (Exit code was not captured by my pipe; the CLI exit-1 behaviour is covered by test 18 and recorded in 43-04-baseline-red.txt.) |
| 4 | PR checks green incl. app-tests; log shows VERIFY-03a | VERIFIED | `gh pr checks 29`: all 7 pass, including "student app tests". Run 38509278169 log: `ok 18 - VERIFY-03a: missing API key returns fail-open immediately`, `# pass 34 / # fail 0`. |

## TDD ordering

db47f11 (22:59:28, baseline copy), d2aae5c (23:00:06, failing tests), 7f3b948 (23:00:28, implementation): RED commit precedes GREEN. 43-04-red.txt (13 pass / 5 fail) precedes 43-04-green.txt (18/18), and the negative control reproduces the same 5 failures.

## Other checks

- PR #29: state OPEN, mergedAt null, headRefOid 7f3b948c (matches the pushed commit), body contains the DO NOT MERGE D10 note and the Claude Code footer.
- ROLLBACK-43.md: Fly v57 with pinned image + digest and `fly deploy --image` command; Worker `77f32645-e61e-438b-9868-6b44580c3b8d` with `wrangler rollback` command; DB note (leave column). Cross-check: `fly releases` latest is v57 (May 25 2026); `wrangler deployments list` latest is 77f32645 at 100%. Both match.
- gitleaks: 16 commits scanned (d1658aa..7f3b948), no leaks, report `[]`.
- Evidence secret grep (Bearer, sk-, postgres://) on 43-04 evidence and ROLLBACK-43.md: no matches.
- Nothing merged, deployed or migrated: confirmed above.

## Anti-patterns / security pass

No stub patterns in the readback script; GET only, no credentials. Security Pass: no Pass 1 issues in phase-modified files.

## Advisory for 43-05 (not a gap)

- Fly v57 dates from 2026-05-25 while main's apps/app changed through 2026-06-10 (migrations 0013, 0014). A deploy from main ships that backlog; 43-05 should record applied migrations first (already flagged in the SUMMARY).
- Local `npm test` for apps/app and parrot was skipped (local-suite-guard hook); these ran on CI (34/34, 211/211). The plan's local preflight wording was thus met by CI, documented in the SUMMARY.
- Truth 4's "delete the job" negative control was shown via origin/main having no app-tests job rather than a mutated push; acceptable.

## Gaps

None.
