---
phase: 38-code-map-coupling-inventory
plan: 03
verified: 2026-10-09T04:30:00Z
status: passed
score: 7/7 truths verified (1 accepted as partially met by design, see truth 2)
gaps: []
advisories:
  - "Plan truth 2 live clause ('removing any single real row turns the live run red') is literally false: 21 of 41 cms rows turn it red, 20 do not. Accepted (see below); amend the truth wording or add an exact-row check for NAMED_MINIMUM files."
  - "packages/shared/** row lists pattern 'apps/parrot' but no file under packages/shared hits any non-own pattern; the pattern column is inaccurate (row still correct: moves to platform)."
  - "Excluded repos (11) are justified only by zero references in the cms tree; owner confirmation is a Raj decision, as the SUMMARY says."
  - "Legacy render.yaml Render services live status not checked (acknowledged in inventory)."
---

# Phase 38 Plan 03 Verification

## Architectural Context Loaded
- No `.planning/NORTH-STAR.md` in this repo. Global CLAUDE.md rules applied: TDD RED before GREEN, rrr-verifier per plan, no push, legacy and Parrot read-only.
- CONTEXT D1 (Parrot unchanged), D2/D6 (website = apps/marketing only) used to judge dispositions.

## Truths
| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Entry gate `--gate-prev 38-02` | VERIFIED | 38-02-VERIFICATION.md is `passed`; T-gate tests in suite pass; plan 38-03 executed after it. |
| 2 | MAP-04 completeness by recomputation, row removal -> red | VERIFIED (live clause partial, accepted) | My own `git grep -l -E` (10 patterns, own-dir exclusion) gives 348 cms, 0 Parrot (origin/main), 5 legacy (HEAD) hit files; every one is covered by an inventory row or glob; none missed. Live `--inventory` exit 0 x3. Independent row-removal sweep reproduces 41 rows, 21 red, 20 green. |
| 3 | Named minimum | VERIFIED | All 13 named paths covered (verifier run exit 0); `--scripts/**` removal turns red (38-03-GREEN-live.txt); T-inv-named in suite. |
| 4 | Disposition validity | VERIFIED | T-inv-disposition tests pass; all live rows are keep/move/rewrite/delete, move rows have website/platform, rewrite notes start `rewrite:`. |
| 5 | Cross-repo via ref only | VERIFIED | Parrot `--ref origin/main`, legacy `--ref HEAD`, both exit 0; T-inv-crossrepo canary tests pass; guard OK; no `.env*` read by me. |
| 6 | MAP-06 repo map vs gh/git | VERIFIED | Fresh `gh repo view`/`gh repo list` GETs match REPO-MAP and gh-snapshot.json (visibility PUBLIC/PRIVATE/PRIVATE, none archived, owners); enumeration of matching repos identical to snapshot (14 names, 3 rows + 11 Excluded); `git config remote.origin.url` slugs match for all three folders; `--repo-map` exit 0. |
| 7 | Owning team | VERIFIED | team-cms is a key in team-mode.json; other two are `unmanaged: <reason>`; T-repomap-team passes. |

## Tests
- `node --test scripts/verify-code-maps.test.mjs`: 128/128 with GIT_OPTIONAL_LOCKS unset and with it exported as 0.
- RED (38-03-RED.txt): 128 tests, 86 pass, 42 fail; all 42 are `AssertionError ERR_ASSERTION` (stub exit 2 vs expected 0/1), zero ENOENT/unknown-flag. Committed in 44cf41e with GREEN; file times RED 22:42 before GREEN 22:44. 38-03-RED-advisory1.txt shows the two failing tests under GIT_OPTIONAL_LOCKS=0 before the fix. Live RED (docs absent, exit 1 x4) and GREEN-live, ROWREMOVAL-live files present.

## Live commands (run by me, GIT_OPTIONAL_LOCKS=0)
`--inventory` cms 0, Parrot origin/main 0, legacy HEAD 0; `--repo-map` 0; `--guard --baseline` 0; `--maps --manifest maps/MANIFEST.json` 0; `--relationship PARROT-RELATIONSHIP.md` 0; `lint-plan-truths.js --require-spec`: 4 plans clean, exit 0.

## Row sampling (13 rows checked against real files)
ci.yml (job names, working-directory apps/parrot|startup|email-worker, cache paths), root package.json (name internjobs-ai, workspaces globs and 3 exclusions, script list), apps/marketing/package.json (verify:dist, verify:production, deploy:pages project internjobs-ai), apps/marketing/wrangler.toml (name internjobs-ai), StartupAccessSection.tsx (HTTPS endpoint constant, no import), apps/app/src/views.mjs (comment line 6), employers styles.css and tailwind.config.ts (comments only), apps/app/fly.toml (internjobs-ai-student-app), email-worker wrangler (STARTUP_EMAIL_HANDOFF_URL), mac-bridge plist (/Users/raj/internjobs-cms paths, lines 24/25/29), apps/app/README.md (dead Infisical id 0484b3ce at line 23), packages/shared (no consumer: only its own package.json names @internjobs/shared), process rows (`gh api` branch protection strict, 4 contexts, 0 reviews, enforce_admins false; ruleset 17824788 active), Parrot fly.toml app parrot-o3vkuq plus 6 Parrot rows (files exist at origin/main), legacy render.yaml/package.json. All correct except the packages/shared pattern-column nit above.

## Row-removal gap (21 of 41): acceptable
The 20 rows that stay green are (a) rows redundant with a covering glob (5 named files under apps/app/** or apps/employers/**, apps/app/fly.toml, apps/email-worker/wrangler.toml, apps/parrot/wrangler.jsonc, 3 scripts) and (b) rows for things git grep cannot see (7 process rows, agentic-inbox, mattermost-proxy, mac-bridge plist). The risk 38 exists to remove, an unlisted hard-coded path breaking Phase 40-41, is the hit set, and that is fully guarded (a missing covering row for any hit file is red, proven live and in fixtures). The unguarded rows affect granularity and non-grep facts, which no recomputation can check; the plan already lists disposition correctness as an admitted [GAP] for human review at Phase 40 start. Residual risk: deleting a specific `rewrite` row silently demotes that file to its glob's `move` disposition. Cheap hardening for a later plan: require an exact-path row for the NAMED_MINIMUM files that are not globs. Not a blocker; the plan truth text should be amended to say "any row covering a hit file with no other covering row".

## Other checks
- Secret scan: my 15-case probe passes (SECRET=/TOKEN=/PASSWORD= 12+ chars, scheme://user:pass@, *_KEY flagged; short, empty, templated, redacted, name only, credential-free URL clean). Regex scan of inventory, REPO-MAP, relationship doc, gh-snapshot.json and maps found only a fake-secret mention in maps/parrot/TESTING.md line 114 (documented fake values). No tokens in gh-snapshot.json.
- No GitHub write: verifier has no gh calls; plan docs record only GETs; my live gh data equals snapshot.
- Nothing pushed: `git ls-remote` branch head 9ee26db is not a descendant of 1233084; local is 12 ahead. Commits 44cf41e, f3e0f0e, 1233084 contain no .subagent-runs files, .review-rounds.json or apps/canary-monitor (still untracked).
- Anti-patterns: none in scripts/verify-code-maps.mjs relevant to the goal. Security Pass: no Pass 1 issues in phase-modified files (git grep run with fixed argv via execFile-style helper; no shell interpolation).

_Verifier: Claude (rrr-verifier). Not committed._
