---
phase: 39-security-gate-plan-limits
plan: 05
subsystem: security
tags: [sec-02, github, read-only-capture, plan-limits]
requires: [39-01, 39-02]
provides: [39-05-state-snapshot.json, 39-05-LIMITS.md, 39-05-SCOPE.json, scripts/sec-capture-state.mjs]
affects: [39-08, 39-09]
key-files:
  created: [scripts/sec-capture-state.mjs, scripts/sec-capture-state.test.mjs, 39-05-state-snapshot.json, 39-05-LIMITS.md, 39-05-SCOPE.json, 39-05-gh-log.tsv]
decisions: [D16]
completed: 2026-10-08
---

# Phase 39 Plan 05: SEC-02 state and limits capture Summary

GET-only GitHub capture of PA-MATRIX, PA-Ai-Team and growthpods into a credential-free snapshot, a measured Free-plan limits matrix, and Raj's D16 scope (website-only) recorded.

## What Shipped

- Task 1 (25c8a60): `scripts/sec-capture-state.mjs` (`captureState`, `ghGet`; spawns `gh` with an args array, GET only, logs each call) and 8 tests.
- Task 2 (d343b73): live capture, `39-05-LIMITS.md`, 95-line `39-05-gh-log.tsv`, no POST/PUT/PATCH/DELETE.
- Checkpoint (0748f24): Raj confirmed D16 option `website-only`; `39-05-SCOPE.json` lists only `PA-MATRIX/internjobs-marketing-website` (present in the snapshot).
- Implementation point: log lines use `gh api -i '<quoted path>'` and the script parses the status from the `-i` header. The Parrot pulls query is one quoted argument (`?state=all&per_page=100`).
- Phase 38 PR check: Parrot has 12 PRs; #11 and #12 exist and are open. The claim holds.
- Push protection on public repos: the pricing-table Free column lists it for public repositories, and all 9 growthpods public repos already have secret scanning and push protection enabled. The docs page does not state the entitlement itself, so the matrix marks that as evidence from the pricing table and the live state, not from the docs.
- growthpods plan is `null` in the API; recorded as "not reported by the API".

## Evidence (RED before GREEN)

1. Unit RED (`39-05-RED.txt`): stubbed `ghGet` fails, e.g. T-capture-get-only (`error: 'stub'`), T-capture-log.
2. Unit GREEN (`39-05-GREEN.txt`): 8 tests, 8 pass, 0 fail. Re-run at verification: same.
3. Live RED (`39-05-RED-live.txt`): `verify-sec-limits.mjs --state` fails with `ENOENT ... 39-05-state-snapshot.json`.
4. Live GREEN (`39-05-GREEN-live.txt`): `SEC-LIMITS STATE OK`, `GH-LOG OK`. Re-run at verification: `--state --matrix` exit 0, `--gh-log` exit 0, `lint-plan-truths.js ... --require-spec` exit 0 (10 plans clean).
5. Scope check: the SCOPE.json repo appears in the snapshot; `confirmed_by: Raj`, `d_number: D16`, `confirmed_at` present.

## Deviations from Plan

None - plan executed exactly as written.

## Rulings

None - no plan conflicts arose.

## Next Phase Readiness

39-08 entry check can pass (SCOPE.json and `## D16` exist). The rrr-verifier must write `39-05-VERIFICATION.md` before 39-08 and 39-09 start. No GitHub write was made.
