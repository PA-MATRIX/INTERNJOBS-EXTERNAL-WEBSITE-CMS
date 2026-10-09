# 39-05 Limits matrix (SEC-02), point-in-time

Source: `39-05-state-snapshot.json` (live read-only GET capture, command log `39-05-gh-log.tsv`, every line passes `verify-sec-scan.mjs --gh-log`). No credentials stored. Facts below are measured unless marked.

| owner | plan | kind | repos | public repos | notes |
|---|---|---|---|---|---|
| PA-MATRIX | free | org | 11 | 2 (internjobs-marketing-website, OpenMythos) | 9 private |
| PA-Ai-Team | free | org | 26 | 0 | all private, incl. Parrot |
| growthpods | null | user | 32 | 9 (freehire, ms, goose-skills, gooseworks-skills, ai-marketing-skills, goose-aeo, muscle-mem, OpenHands, system-prompts-and-models-of-ai-tools) | plan not reported by the API (`null`); behaves as Free: private repo Internjobs returns the same 403s |

`growthpods` plan is "not reported by the API" (not guessed). Public lists were enumerated with `--limit 100`, each owner below 100 repos, so enumeration is complete.

## Free-plan consequences, measured

| Repo class | Branch protection | Rulesets | Secret-scanning alerts API |
|---|---|---|---|
| Private (PA-Ai-Team/Parrot, growthpods/Internjobs, 9 PA-MATRIX private; 11 repos) | 403 "Upgrade to GitHub Pro or make this repository public to enable this feature." | 403 same verbatim message | 404 "Secret scanning is disabled on this repository." |
| Public, PA-MATRIX/internjobs-marketing-website | 200 (protection present) | 200 | 404 (secret scanning disabled) |
| Public, PA-MATRIX/OpenMythos | 404 "Branch not protected" (works, none set) | 200 | 404 (disabled) |
| Public, growthpods (9) | 404 not protected | 200 | 200 (already enabled, push protection enabled) |

All repos report `admin: true`, so the 403s are plan limits, not permission.

Current `security_and_analysis` on the PA-MATRIX public repos: secret_scanning disabled, secret_scanning_push_protection disabled, validity_checks disabled, non_provider_patterns disabled. On all 9 growthpods public repos secret scanning and push protection are already enabled. Private repos return `security_and_analysis: null` (field absent).

## Phase 38 PR check

Parrot PRs from the quoted `repos/PA-Ai-Team/Parrot/pulls?state=all&per_page=100`: 12 PRs. #11 (feat/hunter-contact-drawer) and #12 (fix/sms-send-and-contact-dedupe-main) both exist and are OPEN; #1 to #10 are closed. Phase 38's claim holds.

## Pricing and docs, fetched on 2026-10-09 UTC (2026-10-08 local session date)

| Claim | Status | Source |
|---|---|---|
| Team plan: $4 USD per user/month, labelled "for the first 12 months *" (promotional wording on page; the post-12-month price is NOT MEASURED) | verified | https://github.com/pricing |
| Team lists "Protected branches", required reviewers, code owners under "Advanced tools and insights in private repositories" | verified | https://docs.github.com/en/get-started/learning-about-github/githubs-plans |
| GitHub Secret Protection: $19 USD per active committer/month (add-on) | verified | https://github.com/security/plans |
| Push protection and secret scanning appear in the Free column for "Public repositories" only | verified (pricing comparison table) | https://github.com/pricing |
| Push protection on public repos is free (stated as a plan entitlement) | verified from the pricing table above; push-protection doc page https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection fetched, but it does not itemise the plan: the plan statement rests on the pricing table. Measured corroboration: 9 growthpods public repos already show push protection enabled | https://github.com/pricing |
| Whether protection set on a public repo persists after a flip to private | NOT MEASURED (not needed: platform repo is created private) | n/a |
