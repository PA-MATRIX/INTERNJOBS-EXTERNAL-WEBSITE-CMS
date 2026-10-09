---
phase: 39-security-gate-plan-limits
plan: 01
subsystem: security-verification
tags: [sec-01, verifier, node-test, tdd]
requires: [38-code-map]
provides: ["scripts/verify-sec-scan.mjs: --gate-prev, --scan-record, --scan-coverage, --guard, --gh-log"]
affects: [39-04, 39-05, 39-07, 39-08]
key-files:
  created: [scripts/verify-sec-scan.mjs, scripts/verify-sec-scan.test.mjs]
  modified: [.planning/current-intent.json]
duration: ~25m
completed: 2026-10-09
---

# Phase 39 Plan 01: SEC-01 scan verifier Summary

Read-only SEC-01 verifier with leak, schema, rotation, digest, per-source ref coverage, scratch/untouched guard and a default-deny GitHub/brew/docker/git command-log check, proven by 62 tests with negative controls.

## What Shipped

- `--gate-prev N` (phase N-VERIFICATION.md must carry `status: passed`; live run exits 0 for 38).
- `--scan-record`: scanSecrets leak check (value never echoed), tool/redacted/finding_count/classification/field checks, rotation gate for `real` findings, coverage digest.
- `--scan-coverage ... --source github|local --mirror`: per-source set-equality of refs and tips, per-source `--require-ref`, non-empty `pull_refs_note`.
- `--guard`: scratch dir must be gone and delegated `verify-code-maps.mjs --guard` must return 0 (live exits 0).
- `--gh-log` with optional `--approved`: allowlisted read forms only; everything else needs an exact-line approval with log timestamp >= approved_at; `git push`/`git commit` approvable only inside `zz-sec03-probe-*` clones (push remote `origin` or a probe path), otherwise never.
- `verify-code-maps.mjs` imported, not edited (empty diff).

## TDD Evidence

RED (39-01-RED.txt): Task 1, 34/34 failing with ERR_ASSERTION against a stub exiting 2; Task 2, 28 new tests failing against no-op stubs (34 pass, 28 fail). GREEN (39-01-GREEN.txt): 34/34 then 62/62, plus live `--guard` OK. RED was captured before each implementation.

## Deviations from Plan

None - plan executed as written. Notes: `parseArgs` wraps the imported one to collect repeated `--require-ref`. The HUD file (`project-hud-path.js`) holds only subagent_budget, no position fields, so it was left untouched. STATE.md (gitignored) position updated locally. Plan-lint exits 0.

## Hardening amendment

Orchestrator-approved deviation after the 39-01-VERIFICATION.md advisory: token-based `--gh-log` classification let chained lines (`gh repo view x/y; gh repo delete x/y --yes`, `gh pr list && gh pr merge 1`) exit 0.

- Fix: `hasShellControl()` quote-aware scan in `classifyCommand`. Unquoted `; & | < >`, CR/LF, and backtick or `$(` anywhere outside single quotes (including inside double quotes), plus unterminated quotes, classify as `never`. Operators inside quotes (`--jq '.a | .b'`) stay allowed. `never` is not approvable, so a chained line listed in the approved file is still rejected (approved lines are exact single commands only).
- Tests added (9): T-ghlog-chain-semicolon-neg, -chain-and-neg, -chain-pipe-neg, -substitution-neg, -redirect-neg, -newline-neg, -chain-approved-neg, -jq-pipe-in-quotes-pos, -quote-escape-neg.
- RED (39-01-RED-hardening.txt): 71 tests, 64 pass, 7 fail with ERR_ASSERTION (expected 1, actual 0). The redirect negative and the jq positive already passed pre-fix, because the old tokenizer treated the extra tokens as approvable and quoted pipes as plain text; they are kept as controls.
- GREEN (39-01-GREEN-hardening.txt): 71/71 (62 original + 9 new).
- PLAN files untouched; recorded here only.

## Rulings

None - no plan conflicts arose.

## Next

rrr-verifier to write 39-01-VERIFICATION.md before 39-04/05/07/08 start. Sibling plans 39-02/39-03 own their own STATE lines (orchestrator writes them).

## Archive read amendment

Plan-checker gap on 39-04: its tip-tree extraction logs `git -C <repo> archive <sha>`, which classified as approvable and would fail `--gh-log`.

- Fix: `classifyCommand`/`classifyGit` now treats `git archive` as `allowed` unless it carries `-o`, `--output`, `--remote` or `--exec` (those stay `approvable`). `cat-file` was already in `GIT_READ`.
- Tests added (5): T-ghlog-git-archive-read-pos, -git-cat-file-read-pos, -git-archive-output-neg, -env-prefix-neg, -archive-pipe-neg.
- RED (39-01-RED-archive.txt): 76 tests, 75 pass, 1 fail (T-ghlog-git-archive-read-pos, assertion failure). The other four already passed pre-fix and are kept as negative controls (cat-file was already read-only; env-prefixed and piped lines were already rejected).
- GREEN (39-01-GREEN-archive.txt): 76/76.
- Env-prefixed lines (`GIT_OPTIONAL_LOCKS=0 git ...`) remain unapproved by design; 39-04-PLAN.md Task 1 and Task 3 (steps 2c, 3) now say to log without the prefix and without pipes, extracting via `tar` as an unlogged separate step.
