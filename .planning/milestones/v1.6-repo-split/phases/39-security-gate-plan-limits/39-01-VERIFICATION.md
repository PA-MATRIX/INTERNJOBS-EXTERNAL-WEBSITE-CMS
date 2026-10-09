---
phase: 39-security-gate-plan-limits
plan: 01
verified: 2026-10-09T05:30:00Z
status: passed
score: 8/8 must-haves verified
gaps: []
advisories:
  - "gh-log classifier is token-based: a compound line such as `gh repo view x/y; gh repo delete x/y --yes` or `gh pr list && gh pr merge 1` is classed allowed (exit 0). Not in any plan truth; only matters if a logger records chained commands on one line. Recommend the 39-04+ log wrapper record one command per line, or classifyGh reject `;`, `&&`, `|` tokens."
  - "RED/GREEN commit order: de11530 commits tests, impl, RED.txt and GREEN.txt together (3160fb6 does the same for Task 2). Git order cannot prove RED-first; the RED.txt content (34/34 ERR_ASSERTION vs stub exiting 2, then 28 failing of 62 vs no-op stubs) does."
---

# Phase 39 Plan 01: SEC-01 verifier. Verification Report

**Goal:** a verifier that fails for every named defect (leak, schema, missing rotation, dropped ref, left-over scratch, unapproved GitHub write) and passes on clean fixtures; RED then GREEN saved; verify-code-maps.mjs unchanged.
**Re-verification:** No (initial). No locked NORTH-STAR/AGENTS/CLAUDE in repo; global CLAUDE.md rules (TDD-first, no pushes, plan-lint) applied.

## Architectural Context Loaded
- No `.planning/NORTH-STAR.md`, repo `AGENTS.md` or `CLAUDE.md`. Locked sources used: plan hard rules (Parrot/legacy read-only, no .env, no GitHub writes, no pushes, never on main) and global CLAUDE.md TDD rule.

## Evidence run
- `node --test scripts/verify-sec-scan.test.mjs`: 62 tests, pass 62, fail 0.
- Live `--gate-prev 38` -> GATE OK, exit 0. Live `--guard --baseline .../38-.../baseline.json --scratch /nonexistent-dir` -> GUARD OK, exit 0 (read-only).
- Lint: `lint-plan-truths.js ... --require-spec` exit 0 (10 plans clean).
- `scripts/verify-code-maps.mjs`: last touched by 9bf1a23 (38-04); no change in the 39 commits.
- Commits de11530 / 3160fb6 / 45d9110 touch only: current-intent.json, 39-01-RED/GREEN.txt, 39-01-SUMMARY.md, verify-sec-scan.mjs/.test.mjs. Untracked runtime files (.subagent-runs-*, .review-rounds.json, apps/canary-monitor/) remain untracked. Branch is `docs/phase-38-code-map`, ahead of origin by 31 (nothing pushed); no GitHub calls were made by verification.
- current-intent.json diff: phase_id "39 Security gate...", plan_id "39 (plans 01-10...)", active_plan "39-01..39-03 verifiers (wave 1)", refreshed constraints, updated_at bumped.
- RED.txt: Task 1 `# tests 34 / pass 0 / fail 34` all ERR_ASSERTION (`2 !== 0`/`2 !== 1`, stub exit 2, not ENOENT); Task 2 appended `# tests 62 / pass 34 / fail 28`. GREEN.txt: 34/34 then 62/62 plus live GUARD OK.

## Truths
| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | gate-prev | VERIFIED | T-gate; mutation (status check disabled) -> T-gate red; live exit 0 |
| 2 | leak safety net | VERIFIED | T-leak-ghp/akia/pem/clean; mutation (scanSecrets dropped) -> T-leak-ghp, -akia, -pem and "never echoes value" red |
| 3 | schema gate | VERIFIED | T-schema-* present, in the 62 passing; code checks tool name/version, redacted, finding_count, classification, file/rule/commit/fingerprint |
| 4 | rotation gate | VERIFIED | mutation (rotation condition disabled) -> T-rotation-neg red |
| 5 | coverage digest | VERIFIED | mutation (digest check disabled) -> T-digest red |
| 6 | per-source ref coverage | VERIFIED | mutation: drop per-source filter -> T-cov-pos and T-cov-two-mirrors-pos red; drop tip from key -> T-cov-tip-moved red; require-ref against all sources -> T-cov-wrong-source-neg red |
| 7 | guard | VERIFIED | mutation (scratch check disabled) -> T-guard-scratch red; delegate to verify-code-maps --guard exercised live |
| 8 | default-deny gh-log | VERIFIED | hand-made logs (below) plus mutations |

## gh-log hand exercise (scratchpad logs, ISO timestamps)
- Exit 0 (allowed): `gh api repos/x/y`, `--jq .a.b`, `-q .a`, `--paginate -X GET`, `gh repo view`, `gh pr list`, `gh auth status`, `gh --version`, `gh pr create --help`, `git log`.
- Exit 1 (denied): `gh api -f/-F/--field/--raw-field`, `gh api graphql -f`, `--jq` + `-f`, `-q` + `-f`, `-X POST`, `--method=DELETE`, `--input`, `gh pr/issue create`, `gh workflow run`, `gh release create`, `gh repo delete`, `gh secret set`, `gh pr merge`, `brew install`, `docker pull`, `git clone`, unapproved `git push`/`git commit`, empty log, missing log.
- Approvals: `brew install jq` approved at/before -> 0; graphql approved_at later than log ts -> 1; `docker pull` with unrelated approvals -> 1; probe-clone `push origin HEAD:main` and `commit` approved -> 0; `git push origin main` listed but outside probe -> 1; probe-clone push to `https://github.com/o/other` listed -> 1; non-probe `-C` push -> 1.
- Mutations: allowlist weakened to allow unlisted -> T-ghlog-repo-delete, -create-run-release, -unknown-denied, -approved-different-line-neg red; field flags treated as value flags -> T-ghlog-input, -field-implicit-post, -jq-with-field-neg red; approved timestamp check dropped -> -approved-early-neg, -brew-early-neg, -git-probe-write-approved-pos red; probe-target never-rule dropped -> T-ghlog-git-push-other-remote-neg red; brew/docker made allowed -> -unknown-denied, -brew-unapproved-neg, -brew-early-neg, -docker-pull-neg red. (A naive `continue` on field flags stayed green only because the flag's value becomes a second positional and is still denied; equivalent behaviour, not a test gap.)

## Mutation summary
All 14 mutations were done on scratchpad copies; repo files untouched. Each turned named tests red (leak-drop 4, allowlist 4, cov-per-source 2, tip 1, digest 1, rotation 1, approved-time 3, probe 1, gate 1, scratch 1, brew 4, field-value 3, wrong-source 1).

## Anti-patterns / security pass
No TODO/placeholders; script is read-only (git for-each-ref with GIT_OPTIONAL_LOCKS=0, spawn of verify-code-maps --guard). Test source builds fake tokens at runtime. No Pass 1 findings. See advisory on compound lines above (non-blocking).

## Human verification
None required.
