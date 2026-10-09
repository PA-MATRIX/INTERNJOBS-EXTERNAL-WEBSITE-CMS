# Phase 39 Plan 06: SEC-03 docs research Summary

Sourced and dated claim table C1..C7 plus upgrade and alternative write-ups for Raj's SEC-03 decision; `--research` green.

## What Shipped

- `39-06-SEC03-RESEARCH.md`: C1, C4, C5, C6, C7 verified from pages fetched 2026-10-08; C2 and C3 stay ASSUMED, deferred (C2 to 39-07 probe, C3 to the 39-05 enable readback).
- Findings that change the earlier research: C3 is NOT confirmed (repo-level push protection "Requires GitHub Secret Protection"); C6 the risk assessment is Team/Enterprise only, not available on Free; Team is $4/user/month (first 12 months, later rate unverified); Secret Protection $19 per active committer is a doc example.
- Cost arithmetic: 4 seats x $4 = $16/mo; plus 4 x $19 = $76/mo optional; $92/mo upper bound.

## RED then GREEN

- RED (`39-06-RED-live.txt`, skeleton, all ASSUMED, exit 1): `RESEARCH FAIL:` with "C1: no https source URL", "C4: price row has no $ amount", etc.
- GREEN (`39-06-GREEN-live.txt`, exit 0): `RESEARCH OK`.
- Negative control: reverting C5 to ASSUMED with no URL gives exit 1 ("C5: no https source URL").

## Deviations from Plan

- WebFetch was not available to this executor; pages were fetched with read-only `curl` GETs of the same docs.github.com / github.com/pricing URLs into the scratchpad (nothing committed). No `gh` or GitHub API calls were made.
- 39-05 snapshot did not exist yet, so C1 cites the measured 39-RESEARCH V-api rows plus the docs page.

## Rulings

None - no plan conflicts arose.

## Next Phase Readiness

39-08 must treat push protection on the public website repo as unproven (C3) and read it back; 39-07 probe still owns C2.

STATE line for the orchestrator (under `<!-- 39-06 -->`): `39-06 executed, pending verification (SEC-03 research record; C2->39-07, C3->39-05 carried as ASSUMED)`
