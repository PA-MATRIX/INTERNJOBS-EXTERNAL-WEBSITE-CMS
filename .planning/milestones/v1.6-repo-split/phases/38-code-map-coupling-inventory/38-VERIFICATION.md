---
phase: 38-code-map-coupling-inventory
verified: 2026-10-09T04:15:00Z
status: passed
score: 10/10 must-haves verified (MAP-01..06 + success criteria 1-4)
re_verification: false
gaps: []
---

# Phase 38: Code map + coupling inventory Verification Report

**Goal:** Map the three codebases + coupling inventory (v1.6 repo split)
**Status:** passed. Records are deliberately still in the pre-flip state (executed, pending verification); the orchestrator flips them after Raj's approval.

## Architectural Context Loaded
- No `.planning/NORTH-STAR.md`, `AGENTS.md` or `CLAUDE.md` in the repo. Global memory rules apply (two Clerk apps, Workspace deploy = full replace, Parrot LLM via AI Gateway). CONTEXT D1 (Parrot untouched), D3 (legacy untouched), D12 (Parrot ff approved) were honoured.

## Live checks (run by verifier, not copied from SUMMARY)
| Check | Result |
|---|---|
| `--closure --baseline baseline.json` | exit 0, CLOSURE OK (maps, relationship, 3 inventories, repo-map, guard, scope, records) |
| `--closure --final --baseline ...` | exit 1 (MAP rows, ROADMAP, STATE not complete; 38-VERIFICATION not passed at the time of the run). Expected |
| `--guard --baseline` | exit 0, legacy and Parrot match baseline |
| `node --test scripts/verify-code-maps.test.mjs` | 136/136 with GIT_OPTIONAL_LOCKS exported 0 and again unset |
| Scope negative control (scratchpad baseline copy, `cms_preexisting` emptied, ff record beside it) | exit 1 naming `apps/canary-monitor/{package.json,src/index.js,wrangler.toml}`; real baseline exit 0 |
| `lint-plan-truths.js --require-spec` on 38-01..04 PLANs | OK, 4 plans clean (9/6/7/6 truths falsifiable) |
| `git diff --name-only 740aec8 HEAD` | 62 files, all under `scripts/` or `.planning/`; nothing else |
| Push state | `origin/docs/phase-38-code-map` = 9ee26db (planning commit from before execution); HEAD is 15 commits ahead; no phase-38 execution commit pushed |
| Parrot | main = origin/main = 74880e4 (matches D12 record); worktrees at ece5eb8 and 11b2277 unchanged |

Note: a bare `--closure --final` without `--baseline` exits 2 (usage error), not 1. The documented command includes `--baseline`.

## Requirements and Success Criteria
| # | Must-have | Status | Evidence |
|---|---|---|---|
| MAP-01 | cms 7-doc map regenerated from merged main, dated after merge | VERIFIED | `.planning/codebase/` 7 tracked docs, stamped `internjobs-cms @ d1658aa` 2026-10-08 (merge commit date); `--maps` gate green |
| MAP-02 | Parrot ff to origin/main, worktrees dispositioned, map regenerated | VERIFIED | main = origin/main = 74880e4; ff record + D12 approval; worktrees untouched (`WORKTREES.md`); 8 docs in maps/parrot (7 + WORKTREES) |
| MAP-03 | legacy mapped to scratch, 4 uncommitted files untouched | VERIFIED | maps/legacy 7 docs outside the source repo; `--guard` OK against baseline |
| MAP-04 | Coupling inventory with dispositions | VERIFIED | COUPLING-INVENTORY.md 54 rows, all with keep/move/rewrite/delete; spot-checked StartupAccessSection, views.mjs, employers tailwind rows against the tree; 3 inventory gates green |
| MAP-05 | apps/parrot vs PA-Ai-Team/Parrot relationship documented | VERIFIED | PARROT-RELATIONSHIP.md; independently confirmed: `PARROT_EMBED_URL` parrot.projecta.ai/embed in wrangler.jsonc, `POST /api/embed/parrot-token` in workers/index.ts, `EMBED_JWKS_URI` workspace.internjobs.ai/oidc/jwks in Parrot `server/config.js`, worker name `internjobs-parrot`, package name `parrot`, Parrot has no `.github` and no wrangler, fly app `parrot-o3vkuq` |
| MAP-06 | REPO-MAP.md with owner, visibility, purpose, folder, deploy, team | VERIFIED | `gh repo view`: Parrot PRIVATE, monorepo PUBLIC, legacy PRIVATE, matches doc; origin remote matches; legacy render.yaml services `internjobs-ai-frontend`/`-mastra` confirmed |
| SC1 | 3 maps (7 docs, stamped) + legacy untouched | VERIFIED | as MAP-01..03 |
| SC2 | Inventory with dispositions | VERIFIED | as MAP-04 |
| SC3 | Relationship written | VERIFIED | as MAP-05 |
| SC4 | REPO-MAP complete | VERIFIED | as MAP-06 |

## Plan 38-04 (closure verifier)
- Evidence order verified: 38-04-RED.txt (03:54:49Z, 7 closure tests `not implemented`) before 38-04-GREEN.txt (03:55:54Z, 136/136); RED-live (03:56:34Z, exit 1, 10 record failures, all gates and scope green) before GREEN-live (03:57:05Z, exit 0) and before the record edits in 7cd1c44.
- Commits 9bf1a23 (feat, tests first) and 7cd1c44 (records) confirmed. Closure checks scope, aggregates, records and current-intent.
- 38-01/02/03 VERIFICATION.md exist, all `status: passed` (9/9, 6/6, 7/7).
- Records: MAP-01..06 unticked with "executed, pending verification" and traceability "Pending verification"; ROADMAP Phase 38 unticked, 4 plans; STATE status "executed, pending verification"; CONTEXT D12 intact (approval, one use), D13 outcomes only.

## Anti-patterns / Security Pass
- No TODO/placeholder stubs in the maps or docs (stamp/clean gate in `--maps`). Security Pass: scripts use execFile with fixed argv and read-only git plumbing; no Pass 1 issues found in phase-modified code.

## Advisories (non-blocking)
1. Untracked `apps/canary-monitor/` (3 files) is pre-existing and outside Phase 38; scope guard correctly allowlists it via `cms_preexisting`. Needs a home before Phase 40/41 (not in the inventory's scope of decision).
2. 38-03 open note: deleting a specific non-glob named-minimum inventory row silently falls back to its glob's disposition (accepted, documented in D13).
3. 38-04 CLI usage-error test is weak evidence under the stub (exit 2 equals stub code); behaviourally verified live here (`--final` without `--baseline` exits 2).
4. Untracked `.planning/.subagent-runs-state.json`, `subagent-runs.jsonl`, `.review-rounds.json` are tooling files; do not commit with the phase unless desired.
5. Deploy status for Parrot `render.yaml` and legacy Render services is marked unconfirmed in REPO-MAP (honest, not a gap).

## Human verification
None required for the phase gate. Raj approval is needed to flip MAP-01..06, ROADMAP and STATE to complete (then run `--closure --final --baseline`, expected exit 0).

_Verified: 2026-10-09T04:15:00Z_
_Verifier: Claude (rrr-verifier)_
