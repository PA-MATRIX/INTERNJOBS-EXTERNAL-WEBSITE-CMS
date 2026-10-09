---
phase: 39-security-gate-plan-limits
plan: 07
verified: 2026-10-09T00:00:00Z
status: human_needed
score: 2/4 must-have truths fully verified (truths 2 and 4); truths 1 and 3 partial by design of the stop rule
re_verification: false
gaps:
  - truth: "The measured answer is recorded: HTTP status after flip AND whether the direct push to main was accepted or rejected"
    status: partial
    reason: "after_flip=403 is measured. push_to_main is 'not measured' because git clone returned HTTP 403 'Repository is disabled'. Plan allows only a measurement or a skipped:true with Raj's reason; a stopped/partial record is neither, so this truth cannot be met as written."
    artifacts:
      - path: ".planning/milestones/v1.6-repo-split/phases/39-security-gate-plan-limits/39-07-PROBE-RECORD.json"
        issue: "outcome partial, stopped true, push_to_main 'not measured'"
    missing:
      - "Raj's recorded ruling: accept the partial result (SEC-03 flip case stays an inference, plus the one 403 measurement) or approve a new re-probe under a new D-entry"
  - truth: "Probe record gate requires the full ordered sequence incl. direct push attempt"
    status: partial
    reason: "verify-sec-decision.mjs --probe-record exits 0 only through the stopped:true branch, which skips the sequence check. The clone, probe commit and push steps never ran."
    artifacts:
      - path: "scripts/verify-sec-decision.mjs"
        issue: "stopped:true bypasses EXPECTED sequence (lines 91-102); GREEN does not prove the sequence"
    missing:
      - "39-09 must not read the exit-0 as evidence that push was tested"
human_verification:
  - test: "Raj rules on the partial SEC-03 flip measurement"
    expected: "Either accept (decision rests on docs C1 + the 403 upgrade message, no push result) or authorize a re-probe (new approval, new repo name, new approved-writes)"
    why_human: "Plan's only alternatives to a measurement are an approved skip; a partial outcome needs an operator ruling, not a verifier verdict"
---

# Phase 39 Plan 07: SEC-03 throwaway-repo probe Verification Report

**Phase goal (plan):** measure whether branch protection set on a public Free-plan repo is enforced after going private, on a throwaway repo, with D17 approval, then delete it.
**Status:** human_needed
**Re-verification:** No

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` exists in this repo.
- Locked source: `~/.claude/CLAUDE.md` TDD-first rule: RED evidence must precede GREEN.
- Locked source: `.planning/milestones/v1.6-repo-split/CONTEXT.md` D17 (line 102): org-probe approved by Raj at 2026-10-09T04:50:15Z; "any unexpected status stops the plan with no retry and a loud report"; the stop was therefore mandated, not a deviation.

## Independent checks (all read-only)

| Check | Result |
| --- | --- |
| `gh api repos/PA-MATRIX/zz-sec03-probe-20261008` | HTTP 404 Not Found |
| `gh repo list PA-MATRIX` / `growthpods`, grep `zz-sec03` | none in either (grep exit 1) |
| `verify-sec-decision.mjs --probe-record 39-07-PROBE-RECORD.json` | `PROBE OK`, exit 0 |
| `verify-sec-scan.mjs --gh-log 39-07-gh-log.tsv --approved 39-07-approved-writes.json` | `GH-LOG OK`, exit 0 |
| `lint-plan-truths.js ... --require-spec` | exit 0, 10 plans clean |
| `git ls-remote --heads origin docs/phase-38-code-map` | 9ee26db, an ancestor of local HEAD 358e7ba (46 ahead); nothing pushed by this plan |

## Gh-log audit

- The log contains 5 write/exec lines: create 04:51:04, PUT 04:51:08, flip 04:51:09, clone 04:51:10, delete 04:51:59. Each is verbatim one of the 7 approved lines (compared to `39-07-approved-writes.json`). Commit (line 5) and push (line 6) never ran and are absent from the log.
- All timestamps >= approved_at 04:50:15Z (first write 04:51:04Z, 49 s later). Earlier log lines (04:42:40 RED, 04:50:49, 04:51:04 GET) are reads of the probe name only.
- Only `PA-MATRIX/zz-sec03-probe-20261008` is targeted by any write (the `growthpods/...` line is a read-only RED name check).
- Delete line is verbatim approved line 7, run by the orchestrator, logged and recorded in the PROBE-RECORD with "run by orchestrator" provenance. No chained commands (no `&&`, `;`, pipes) in any line.
- Minor: the final 404 GET (04:52:22) appears in the PROBE-RECORD but not in the gh-log; it is a read, so no approval issue.

## Approval ordering

D17 commit 0748f24 committer time 2026-10-08T23:50:15-05:00 = 04:50:15Z, equal to `approved_at` in `39-07-APPROVAL.json` and `39-07-approved-writes.json`, and 49 s before the first write (04:51:04Z). Approval preceded all writes. The approved-writes file was changed in 63bc6fd only to add approval stamps (26 lines touched); the command strings match what was proposed in 08cac45 and what ran.

## Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Probe gate RED then exit 0, requiring the full ordered sequence incl. direct push | PARTIAL | RED captured (exit 1, ENOENT; GET 404 for both names) in `39-07-RED-live.txt`, committed in 08cac45 before any write. GREEN exit 0 is real, but reached via `stopped:true`, which bypasses the sequence check. create, PUT, get, flip, get, clone(fail) happened; commit, push did not. Delete and final 404 did. |
| 2 | Only the throwaway touched; scan exits 0 only when each write is approved verbatim | VERIFIED | See gh-log audit. Scan exit 0 independently reproduced. |
| 3 | Measured answer recorded: post-flip status AND push result, or an approved skip | PARTIAL / NOT MET AS WRITTEN | `after_flip: 403` with free-plan "Upgrade to GitHub Pro or make this repository public" message, `before_flip: 200`. `push_to_main: "not measured"`. Not a skip either (no `skipped:true`, no reason from Raj). The record says so plainly. |
| 4 | No approval, no write; stop on unexpected status, never retry | VERIFIED | Approval precedes writes; clone result flagged `unexpected:true`, `stopped:true` set; no retry; no commit/push attempt; only the approved delete ran afterward. |

## Honesty review of record and SUMMARY

- The record and SUMMARY title say "PARTIAL measurement"; `push_to_main` is `"not measured"`; `limitations` states "Not directly measured: whether protection survives going private ... Enforcement is therefore unproven and unlikely." The claim "protection survives going private" is NOT asserted as measured. No overclaim found.
- Caveats to carry forward: (a) a 403 on GET protection of a private repo shows the API is refused on this plan, not that existing protection rules were dropped or are inert; the record words it correctly. (b) The clone failure "Repository is disabled" (while repo GET showed `disabled:false`, admin permission) is unexplained; it could be a transient GitHub-side state after the visibility flip, so it must NOT be read as "enforcement blocks pushes" or as any evidence about protection. (c) "unlikely" in `limitations` is an inference from docs (C1), labelled as such.
- The executor's stop at the clone followed the plan's stop rule (Task 3 step 2) and D17. The orchestrator running approved line 7 is within the plan ("do not improvise cleanup beyond the approved delete") and is disclosed in SUMMARY Deviations and in the record. One wording nit: the GREEN-live comment "supersedes the STOPPED capture above in git history" is fine; SUMMARY RED text "repo left behind, final status not 404" describes the intermediate state accurately.

## TDD

RED-live (04:42:40Z, commit 08cac45: record absent, exit 1; both names 404) precedes GREEN-live (04:52Z, ab8aad6, exit 0). Order satisfied. Weakness: the GREEN gate is weaker than the RED implies, per truth 1.

## Hygiene

- Executor commits 08cac45, 63bc6fd, f00d537, ab8aad6 touch only the seven 39-07-* files in the phase dir (SUMMARY, RED, GREEN, APPROVAL, approved-writes, gh-log, PROBE-RECORD). STATE.md and CONTEXT.md untouched by them; the CONTEXT.md D17 entry came from the orchestrator commit 0748f24.
- Untracked runtime files (`.subagent-runs-state.json`, `.review-rounds.json`, `subagent-runs.jsonl`, `apps/canary-monitor/`) are not staged.
- Security pass: no code files in this plan's commits; not applicable.

## What 39-09 can and cannot rely on

- CAN: the probe repo is gone (404, no other zz-sec03 repo); a free-plan PA-MATRIX repo that is made private returns 403 "Upgrade to GitHub Pro or make this repository public" for GET branch protection (measured on 2026-10-09); protection PUT/GET worked (200) while public.
- CANNOT: any statement that a direct push to main was accepted or rejected after the flip; "survives going private" as a measured fact (neither confirmed nor refuted); the exit-0 of `--probe-record` as proof the full sequence ran.
- The plan's skip path (`skipped:true` with Raj's reason) does not cover this outcome. 39-09 should either record SEC-03's flip case as inference supported by docs C1 plus this single 403 measurement, with Raj's explicit acceptance, or Raj approves a re-probe.

## Gaps Summary

No integrity, safety or cleanup failures. Approval, scope, delete and honesty all check out. The only shortfall is substantive: truth 3 (and the push step of truth 1) cannot be satisfied as written because the clone was refused. Status is human_needed rather than a code gap: only Raj can accept the partial result or authorize a re-probe.

_Verified: 2026-10-09_
_Verifier: Claude (rrr-verifier)_
