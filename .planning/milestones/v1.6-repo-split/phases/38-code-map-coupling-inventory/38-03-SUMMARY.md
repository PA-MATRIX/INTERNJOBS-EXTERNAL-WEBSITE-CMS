---
phase: 38-code-map-coupling-inventory
plan: 03
subsystem: code-mapping
tags: [coupling-inventory, repo-map, verifier, git-grep, read-only]
requires: [38-02 verified]
provides: ["COUPLING-INVENTORY.md", "REPO-MAP.md", "gh-snapshot.json", "verify-code-maps --inventory/--list-hits/--repo-map"]
affects: [38-04, 40, 41]
key-files:
  created: [COUPLING-INVENTORY.md, REPO-MAP.md, gh-snapshot.json]
  modified: [scripts/verify-code-maps.mjs, scripts/verify-code-maps.test.mjs, .planning/current-intent.json]
decisions: []
duration: ~40min
completed: 2026-10-09
---

# Phase 38 Plan 03: Coupling inventory + REPO-MAP Summary

## What Shipped

`COUPLING-INVENTORY.md` (MAP-04): 41 cms rows, 8 Parrot rows, 5 legacy rows, with keep/move/rewrite/delete dispositions, plus process rows for branch protection, the `integration/**` ruleset, the four required check names, the Pages project, the Fly app, team-mode and the Infisical path. `REPO-MAP.md` (MAP-06): the three current repos, a Planned section and 11 Excluded name-matches with reasons. The verifier gained `--inventory` (recomputes the `git grep -l -E` hit set itself), `--inventory --list-hits`, and `--repo-map`.

Findings for Phases 40-41:
- Parrot has zero layout-pattern hits at origin/main 74880e4; its only coupling is the runtime tenant and domain `internjobs` / `workspace.internjobs.ai`. Parrot rows are informational keeps.
- `packages/shared` has no consumer (no package.json names `@internjobs/shared`), and `apps/marketing` does not depend on it.
- The four SPLIT-03 cross-references are comments or an HTTPS URL (`mcp.internjobs.ai/api/request-access`), not source imports.
- Required check names are the ci.yml job names; the workspaces job name contains "marketing", so renaming it needs a same-step protection update.
- `apps/app/README.md` still cites the dead Infisical project id 0484b3ce. The mac-bridge launchd plist hard-codes `/Users/raj/internjobs-cms/apps/mac-bridge` (not a pattern hit, added as a row).
- Parrot deploy target is Fly `parrot-o3vkuq`; legacy has Render services per render.yaml, live status not checked.

## Evidence (RED before GREEN)

- RED (tests), stub exit 2 so failures are assertions: `38-03-RED.txt`: 128 tests, 86 pass, 42 fail (4 new secret shapes, 20 inventory, 18 repo-map).
- RED (advisory 1), old tests with `GIT_OPTIONAL_LOCKS=0` exported: `38-03-RED-advisory1.txt` shows T-guard-legacy-index and T-readonly-index failing (expected 1, got 0).
- GREEN (tests): `38-03-GREEN.txt`: 128/128, also 128/128 with `GIT_OPTIONAL_LOCKS=0` exported.
- RED (live, docs absent): `38-03-RED-live.txt`: `--inventory` x3 and `--repo-map` exit 1. (First attempt hit a shell word-splitting slip, exit 2; redone.)
- GREEN (live): `38-03-GREEN-live.txt`: `--inventory` exit 0 for cms (working tree), Parrot (`--ref origin/main`) and legacy (`--ref HEAD`); `--repo-map` 0 against `gh-snapshot.json` (real `gh` GETs); `--guard` 0. Scratchpad-copy controls: deleting the `scripts/**` row gives exit 1 naming 5 uncovered files plus the named minimum; deleting `apps/startup/**` gives exit 1; deleting legacy `render.yaml` row gives exit 1.
- Row-removal sweep: `38-03-ROWREMOVAL-live.txt`.
- `lint-plan-truths.js --require-spec`: 4 plans clean. `--maps` and `--relationship` still exit 0 under the extended secret scan.
- Both docs pass the verifier's secret scan; no `.env*` file was opened in any repo; Parrot and legacy were read only with `git grep` against a ref.

## Deviations from Plan

- [Rule 2 - Missing Critical] 38-02 advisory 2: `--maps` secret scan only caught names ending in KEY. Added `*SECRET|TOKEN|PASSWORD=` with 12+ char values and `scheme://user:pass@` URLs, each with a positive test and false-positive controls (short value, empty, templated, name only, URL without credentials), RED first. The scan also runs on the inventory and REPO-MAP docs.
- [Rule 2 - Correctness, test-only] 38-02 advisory 1: T-guard-legacy-index and T-readonly-index now run their plain `git status` control with `GIT_OPTIONAL_LOCKS` removed from the child env (new `gitPlain` helper). No tool behaviour changed.
- Plan-truth gap (not fixable by design): the plan says removing any single real row turns the live run red. 21 of 41 cms rows do, 20 do not: rows redundant with a covering glob (e.g. `apps/app/fly.toml` under `apps/app/**`, named files under `apps/employers/**`) and rows for things git grep cannot see (process rows, `apps/agentic-inbox`, the plist). Completeness of the hit set is guarded; completeness of the informational and process rows is not, and neither is disposition correctness (the plan's `[GAP]`).
- Rewrite note convention: a rewrite row's note must start `rewrite:` (that is how the verifier tells the rewrite note from the rationale; the row has a single note column).
- `git grep -I` skips binary files, and hit exclusion applies only to patterns naming the file's own app directory.
- Extra files beyond frontmatter: `gh-snapshot.json` (required by the plan, listed in text), the `38-03-*` evidence files. `.planning/STATE.md` is gitignored and updated locally only.
- Limitation: the cms hit set reads the working tree's tracked files (not a ref), so it moves as this branch moves; re-run before Phase 40 starts.

## Rulings

None - no plan conflicts arose.

## Authentication Gates

None. `gh` was already authenticated; only GET calls were made.

## Decisions for Raj

- Owning team for the monorepo row is `team-cms`, although `apps/parrot` is team-workspace's. The column takes one value; the purpose cell says so. Confirm or change.
- Excluded repos (11 name matches, e.g. `growthpods-marketing-cms`) are asserted unrelated only because the cms tree never mentions them. Confirm none belong to Intern Jobs.
- Legacy Render services and the Parrot `render.yaml` were not checked for live status.

## Next Phase Readiness

Position records set to `38-03 executed, pending verification`. Next: rrr-verifier on 38-03 (sample 8 inventory rows against the files), then plan 38-04. `38-03-VERIFICATION.md` must read `status: passed` before 38-04 starts.
