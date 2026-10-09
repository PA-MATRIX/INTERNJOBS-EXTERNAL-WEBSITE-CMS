---
phase: 39-security-gate-plan-limits
plan: 09
subsystem: security
tags: [sec-03, decision, github-plan-limits]
provides: SEC-03 decision recorded (accept-unprotected, D19); proof no visibility changed
key-files:
  created: [39-09-GREEN-live.txt, 39-09-SUMMARY.md]
  modified: [SEC-03-DECISION.md, 39-09-visibility-current.json, 39-09-gh-log.tsv]
completed: 2026-10-09
---

# Phase 39 Plan 09: SEC-03 decision Summary

Raj decided accept-unprotected for the PA-MATRIX platform repo (D19); the decision gate, visibility-unchanged check and GET-only log check all exit 0, with nothing bought, flipped or written.

## What Shipped

- Task 1 (4b114e8): pending decision file with facts block, live RED.
- Checkpoint: Raj chose **accept-unprotected** (D19, 2026-10-09T05:32:12Z).
- Task 3 (02fb23e + this commit): `SEC-03-DECISION.md` set to `status: decided`; fresh read-only visibility capture; GREEN saved.

## RED (before the answer) - 39-09-RED-live.txt

`--decision` exited 1: status is pending; decided_by must be Raj; decided_at missing; option missing; CONTEXT.md has no D19 entry.

## GREEN (after) - 39-09-GREEN-live.txt

`--decision` OK, `--visibility-unchanged` (vs Phase 38 gh-snapshot.json) OK, `--gh-log` OK, `--research` OK, `--probe-record` OK, truth linter (repo root) 10 plans clean. All exit 0.

## The decision

Platform repo: private, no branch protection or rulesets, no secret scanning. **This is no enforcement on the platform `main`; it is a process rule only (as in D10).** Website repo stays public and protected (D18 scanning). Phase 40: build the platform repo locally, push nothing. Phase 41: create it private, tighten collaborator write access, record the unprotected state; no purchase.

Evidence framing: 403s on private Free repos are measured (39-05). The probe was partial (D17a): "protection survives going private" is UNPROVEN AND UNLIKELY, not a measured fact. Prices (39-06, 2026-10-08): Team $4/user/month first 12 months (later rate unverified), Secret Protection $19/active committer/month; about $92/month upper bound for 4 seats.

Revisit trigger (proposed by Claude, NOT yet confirmed by Raj): revisit upgrade-team before adding any non-admin collaborator with write access, or at Phase 42 closure, whichever first.

## Advisory for closure plan 39-10

The 39-07 verifier advisory: `--probe-record` exits 0 on a stopped (partial) record without proving the push step. 39-10 must not read "PROBE OK" as proof that push-after-flip or protection-after-flip was measured; D17a governs.

## Deviations from Plan

None. Note: 39-08-approved-writes.json and 39-08-gh-log.tsv show uncommitted changes from another plan; not staged here.

## Rulings

None - no plan conflicts arose.

## Next Steps

STATE line for the orchestrator: `<!-- 39-09 -->` 39-09 executed, pending verification (SEC-03 decided: accept-unprotected, D19). rrr-verifier writes 39-09-VERIFICATION.md.
