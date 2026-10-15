---
phase: 44-telnyx-sms-provider
plan: 02
verified: 2026-10-15T00:00:00Z
status: passed
score: 6/6 must-haves verified
gaps: []
---

# Plan 44-02 Verification: opt-out storage + outbound guard (OPT-01, storage and send-guard halves)

**Status:** passed. **Re-verification:** No (initial). Code: `/Users/rajren/internjobs-cms-wt-44`, `feat/v1.7-44-telnyx-sms`, 44-02 commits a1af471, 44a9c9f, 5feb1fc, 917ab1c.

## Architectural Context Loaded

- No NORTH-STAR.md, AGENTS.md or CLAUDE.md in the repo. Global CLAUDE.md (RRR + TDD-first) applied: the SUMMARY must carry RED before GREEN.
- Plan-level lock: "Spectrum/mac-bridge providers stay unguarded because production still runs mac-bridge until Phase 46" (44-02-PLAN rule_dispositions). Intentional, not a gap.

## Observable truths (re-run by the verifier, not taken from SUMMARY)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Real Postgres: migration twice, record/isOptedOut, format variants -> one row, clear, re-opt-out resets restored_at | VERIFIED | Throwaway PG16 (127.0.0.1:54377, initdb in scratchpad, stopped and deleted after). `opt-out-store.test.mjs`: 17/17, 0 skipped; "sms_opt_outs (real Postgres)" ran 8 subtests. Test reads and applies the real 0016 file twice. restored_at-reset negative control: in negctl evidence, fails in the Postgres block. |
| 2 | Memory store same cases; invalid phone -> `{ok:false,reason:'invalid_phone'}` / false, no throw | VERIFIED | memory block 7/7. |
| 3 | Opted-out number never reaches fetch; non-opted number does | VERIFIED | `telnyx-optout.test.mjs` 6/6. Verifier negative control (`if (await isOptedOut(destination))` -> `if (false)`): tests 1, 2, 3, 6 fail (2 pass / 4 fail); restored, 6/6. |
| 4 | Guard failure fails closed; guard cannot be omitted (`telnyx_opt_out_guard_required`) | VERIFIED | Source read: try/catch returns `opt_out_check_failed`, error text dropped; constructor throws if `typeof isOptedOut !== "function"`. Verifier negative control (remove the throw): test 4 fails (5/1); restored. |
| 5 | Telnyx 40300 -> opted_out, one fetch; other codes not | VERIFIED | `String(errorCode) === "40300"` only; test 5 green, includes non-40300 control. |
| 6 | Real `routeAndSend` surfaces opted-out as failed draft; `createStore` exposes `optOuts` | VERIFIED | test 6 green (fetch uncalled); createStore block 2/2 (Memory and Postgres). `git diff origin/main --stat -- apps/app/src/outbound.mjs` empty; only 0016 differs under db/migrations. |

## Other checks requested

- **Migration 0016:** `create table if not exists`, additive only, no FKs, comment states semantics. Idempotent (applied twice in `before()`, passes).
- **RED before GREEN:** commit order test -> feat for both tasks (a1af471 tests only; 44a9c9f impl; 5feb1fc tests only; 917ab1c impl). Evidence `44-02-red-optout.txt` (ERR_MODULE_NOT_FOUND) and `44-02-red-guard.txt` (6/6 fail) precede green files; SUMMARY quotes both in order.
- **Send-site grep** (`grep -rn sendSms apps/app/src apps/app/scripts`, non-test): outbound.mjs:74 (guarded via provider), server.mjs 679/763 (spectrum, out of scope), 942/1020/1046/1119 (mac-bridge, 44-03 moves to handler), spectrum.mjs, mac-bridge.mjs, telnyx.mjs (guarded), smoke-ops fakes. Table in the plan/SUMMARY is complete. `createTelnyxSmsProvider` is not yet constructed outside tests, so no live send path bypasses the guard today.
- **Registration check** (`git diff --name-only --diff-filter=A origin/main HEAD -- ':(glob)apps/app/src/**/*.test.mjs'`, each must be in the package.json test script): 6 added files, exit 0; dropping `src/sms/telnyx-optout.test.mjs` -> NOT REGISTERED, exit 1; restored. Note: a whole-repo variant of the check would flag pre-existing unregistered `src/storage/r2.test.mjs` and `src/workflows/reply-to.test.mjs`; these predate the branch and are outside 44-02 scope (informational).
- **Sibling suites individually:** telnyx 14/14, mac-bridge + shared + config 30/30.
- **Scope:** 44-02 diff = 8 files, exactly `files_modified`. Worktree clean after controls (git status empty).
- **Security Pass (Pass 1):** parameterised SQL only, no shell/eval, no secrets (grep clean), no phone numbers in error text. No findings.

## Anti-patterns / advisories (non-blocking)

- Commit trailers use "Claude Opus 5.5" rather than the plan's "Sonnet 5.5" text (SUMMARY discloses; matches 44-01). Info only.
- Carried forward, not gaps: 44-03 must pass `isOptedOut: (p) => store.optOuts.isOptedOut(p)` or startup throws; Phase 46 must apply 0016 before switching `SMS_PROVIDER=telnyx` (otherwise every send fails closed). Migration was not applied to any shared DB.

## Gaps

None.
