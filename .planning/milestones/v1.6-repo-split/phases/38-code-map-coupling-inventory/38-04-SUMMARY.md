---
phase: 38-code-map-coupling-inventory
plan: 04
subsystem: code-mapping
tags: [closure, verifier, records, scope-guard]
requires: [38-03 verified]
provides: ["verify-code-maps --closure [--final] --baseline", "Phase 38 records at executed, pending verification"]
affects: [39, 40]
key-files:
  created: [38-04-RED.txt, 38-04-GREEN.txt, 38-04-RED-live.txt, 38-04-GREEN-live.txt]
  modified: [scripts/verify-code-maps.mjs, scripts/verify-code-maps.test.mjs, .planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/current-intent.json, .planning/milestones/v1.6-repo-split/CONTEXT.md]
decisions: []
duration: ~15min
completed: 2026-10-09
---

# Phase 38 Plan 04: Closure Summary

## What Shipped

`--closure [--final] --baseline <json>` aggregates every phase gate in one command (`--maps`, `--relationship`, `--inventory` for cms/Parrot/legacy, `--repo-map`, `--guard`) plus a working-tree scope check and the record checks (MAP-01..06, ROADMAP Phase 38, STATE, current-intent.json). Scope is the union of `git diff --name-only origin/main`, `ls-files --others` and `status --porcelain=v1 -z --untracked-files=all`; allowlist is `scripts/verify-code-maps*`, `.planning/**` and the exact paths in baseline `cms_preexisting` (modified + untracked lists). Records now say `executed, pending verification` (MAP-01..06 unticked, traceability `Pending verification`, ROADMAP Plans `4 plans`, STATE 4/4, CONTEXT D13 outcomes). `--final` additionally requires `[x]`/Complete and `38-VERIFICATION.md` `status: passed`.

Entry gate `--gate-prev 38-03` exited 0 before work started.

## Evidence (RED before GREEN)

- RED (tests, stub throws/exits 2 `not implemented`): `38-04-RED.txt`: 136 tests, 7 new closure tests fail with `error: 'not implemented'`. The CLI usage test passes under the stub (exit 2 is also the stub's code), so it is weak evidence only.
- GREEN (tests): `38-04-GREEN.txt`: 136/136.
- RED (live, records not yet updated): `38-04-RED-live.txt`: closure exit 1, all gates and scope green, 10 record failures.
- GREEN (live): `38-04-GREEN-live.txt`: `--closure` exit 0; `--closure --final` exit 1 (MAP rows, ROADMAP, STATE, missing 38-VERIFICATION); `--guard` exit 0; scope negative control with `cms_preexisting` emptied exits 1 naming the three `apps/canary-monitor/` files (ff record copied beside the scratch baseline; the first attempt without it also failed the guard for a missing ff record, an artefact of the copy).
- `lint-plan-truths.js --require-spec`: 4 plans clean.

## Deviations from Plan

- `runClosure(opts, runners)` and `scopeCheck(repo, baseline)` are exported with injectable runners so aggregation is tested by stubbing each gate red; the plan text said "stub each sub-mode result red", this is the mechanism. Tests are function-level, not CLI-level, except the usage-error test.
- `cms_preexisting` in baseline.json is an object `{modified, untracked}`, not a list; `scopeCheck` accepts both shapes.
- TASK 0 (position records) was done together with Task 2 rather than before the tests; no gate was affected.
- 38-03 advisory (removing a non-glob named-minimum row demotes it silently to its glob's disposition): not implemented, recorded in CONTEXT D13 as an open note.
- Extra files beyond frontmatter: `38-04-*` evidence files. `.planning/STATE.md` is gitignored, updated locally only.

## Rulings

None - no plan conflicts arose.

## Authentication Gates

None.

## Next

Task 3 and the checkpoint are NOT run. Next: phase-level rrr-verifier writes `38-VERIFICATION.md`; then Raj approves the flip; then Task 3 (`--closure --final`).
