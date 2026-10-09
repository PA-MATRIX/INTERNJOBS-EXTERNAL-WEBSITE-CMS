---
phase: 38-code-map-coupling-inventory
plan: 01
subsystem: tooling
tags: [verifier, baseline, parrot-ff, read-only-guard]
requires: [phase 37 verified]
provides: [scripts/verify-code-maps.mjs, baseline.json, parrot-ff-record.json, Parrot main at origin/main]
affects: [38-02, 38-03, 38-04]
key-files:
  created: [scripts/verify-code-maps.mjs, scripts/verify-code-maps.test.mjs, baseline.json, parrot-ff-record.json]
  modified: [.planning/milestones/v1.6-repo-split/CONTEXT.md]
decisions: [D12 Parrot fast-forward approved by Raj 2026-10-08]
duration: multi-session
completed: 2026-10-08
---

# Phase 38 Plan 01: Read-only safety net, baseline, approved Parrot ff Summary

Fixture-tested read-only verifier (gate, snapshot, guard, preflight, ff-check), a captured baseline of legacy/Parrot/cms state, and an approved, recorded fast-forward of ~/Documents/Parrot main from 1ef2960 to 74880e4 (841 commits) with worktrees and legacy proven untouched.

## What Shipped

- Tasks 0-2: verifier + 29 tests (d221766), baseline (0d8016c), hold note (267778a).
- Task 3: approval by Raj ("proceed on both", 2026-10-08) recorded in `parrot-ff-record.json` and CONTEXT.md D12 and STATE.md before any git write; `git fetch origin` (origin/main 74880e4 matched the approved sha); `git pull --ff-only origin main` succeeded; measured commit count 841 (the 664 figure was from the stale tracking ref).

## Evidence

RED (unit suite, stub verifier, before implementation): `38-01-RED.txt`, assertion failures (e.g. "missing -> 1: 2 !== 1").
GREEN (unit suite): `38-01-GREEN.txt`, 29 pass, 0 fail.
RED (live, before ff): `38-01-RED-live.txt`, `--parrot-ff-check` exit 1 (local main 1ef2960 != 74880e4; origin/main stale; record after_sha != HEAD).
GREEN (live, after ff): `38-01-GREEN-live.txt`, `--parrot-ff-check` exit 0, `--guard` exit 0. `git -C ~/Documents/Parrot status --short` empty; worktree list shows both worktrees at baseline HEADs (ece5eb8, 11b2277); fix/api-v1-sms-send still d6a3393.

## Deviations from Plan

None - plan executed as written. Side effect disclosed in the approval request: fetch also created remote-tracking refs origin/cleanup/46-01-spike and origin/wip/2026-10-06-snapshot (no local branches changed).

## Rulings

None - no plan conflicts arose.

## Authentication Gates

None. The decision checkpoint (Parrot ff) was Raj-gated; first answer was Hold, later reversed to approve.

## Next Phase Readiness

Pending rrr-verifier 38-01-VERIFICATION.md before 38-02. Not pushed; `.planning/STATE.md` is gitignored (updated locally).
