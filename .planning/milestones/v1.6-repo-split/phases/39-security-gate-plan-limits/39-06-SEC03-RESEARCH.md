# 39-06 SEC-03 research record

Fetched 2026-10-08 by plain HTTP GET of the public documentation and pricing pages (read-only; no `gh`, no GitHub access, no secrets). Quoted lines are from the page text as served that day. Prices change: re-check at decision time.

| ID | Claim | Status | Source | Fetched | resolved_by |
|----|-------|--------|--------|---------|-------------|
| C1 | On Free, private repos return HTTP 403 "Upgrade to GitHub Pro or make this repository public to enable this feature" for branch protection and rulesets, with admin permission (PA-Ai-Team/Parrot, growthpods/Internjobs). The docs agree: "Protected branches are available in public repositories with GitHub Free and GitHub Free for organizations." | VERIFIED-API | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches (403 measured by read-only API GETs recorded in 39-RESEARCH.md Q2; 39-05 snapshot not yet present) | 2026-10-08 | n/a |
| C2 | Whether protection stored on a public repo survives a flip to private on Free is NOT stated: the visibility page lists lost features (forks, stars, Pages, GHAS) but says nothing about branch protection or rulesets. | ASSUMED | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility | 2026-10-08 | 39-07 |
| C3 | Push protection free on public repos is NOT confirmed: the push-protection page says repo-level push protection "Requires GitHub Secret Protection to be enabled" and is "disabled by default"; only push protection for users (account level, default on) is described as stopping pushes of secrets to public repos. Free-on-public remains unproven; the enable step's API readback in 39-05 decides it. | ASSUMED | https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection | 2026-10-08 | 39-05 |
| C4 | Secret Protection is priced per active committer (active = committed in the last 90 days to the selected repositories); the doc's example rate is $19 per active committer per month. "For example" wording: the pricing page itself does not list a Secret Protection line. | VERIFIED-DOC | https://docs.github.com/en/code-security/how-tos/secure-at-scale/configure-organization-security/configure-specific-tools/estimating-the-price-of-secret-protection | 2026-10-08 | n/a |
| C5 | Team plan: $4 USD per user/month, shown as "for the first 12 months *" (the footnote text was not extracted, so the rate after 12 months is not verified). Free is $0; Enterprise $21 per user/month. | VERIFIED-DOC | https://github.com/pricing | 2026-10-08 | n/a |
| C6 | The secret risk assessment is "Free for organizations on GitHub Team and GitHub Enterprise" (owners and security managers; once per 90 days). It is NOT available to Free-plan orgs, so it is not a no-cost route to scan private repos on Free. | VERIFIED-DOC | https://docs.github.com/en/code-security/how-tos/secure-at-scale/configure-organization-security/configure-specific-tools/assess-your-secret-risk | 2026-10-08 | n/a |
| C7 | Secret scanning on org-owned private repos: "Available with GitHub Secret Protection enabled on GitHub Team or GitHub Enterprise Cloud". Secret Protection itself is for GitHub Team plan users and Enterprise. Public repos: "runs automatically for free". | VERIFIED-DOC | https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning | 2026-10-08 | n/a |

Corroborating page for C7: https://docs.github.com/en/code-security/concepts/secret-security/about-secret-security-with-github (fetched 2026-10-08).

## Option: upgrade

Owner: the org that holds the platform repo (PA-Ai-Team per 39-RESEARCH; PA-MATRIX if it is created there). Upgrading to Team unlocks (C1, C7): branch protection and rulesets on private repos, and the ability to buy Secret Protection for secret scanning and repo-level push protection on private repos (C3, C7), plus the free secret risk assessment (C6).

Cost arithmetic (labelled arithmetic, not a quote; prices from C4/C5, seat counts from PA-MATRIX 4/4 in 39-RESEARCH Q2):
- Team seats: 4 seats x $4 per user/month = $16 per month for PA-MATRIX during the first 12 months (post-promo rate unverified, C5). PA-Ai-Team seat count was not captured in this record: seats x $4.
- Secret Protection (optional): active committers x $19 per month; with 4 active committers that is 4 x $19 = $76 per month on top, if all 4 commit to the covered repos in 90 days.
- Combined upper bound for 4 people: $16 + $76 = $92 per month.

Effect: `main` on the private platform repo can be genuinely protected (PR required, required checks, no direct push), which is the only option that blocks a direct push to `main`.

## Option: alternative

Keep `main` safe without paying. The platform repo stays private, so on Free no protection or rulesets exist (C1). Choices and their real limits:
- Make the platform repo public: rejected (platform code stays private).
- Required checks, the submission gate and CI workflows without protection: they report, they do not gate. CI-only enforcement cannot block a direct push to `main`; any of the 4 seats with write access can push straight to `main` and skip every check.
- Deploy only from a protected public repo or a manual promotion step, and limit write access (4 seats): reduces who can push, does not prevent a mistaken or malicious push by those who can.
- Detect-after: the local scanner (39-02), periodic GET snapshots of branch state, and alerting on unexpected commits. Detection, not prevention.
- No secret scanning on private repos on Free (C7) and no risk assessment (C6); push protection for the private repo unavailable. Public repos still get free secret scanning (C7).

## Does not depend on the probe

For a repo created private on Free, protection is unavailable regardless of what C2's probe shows (C1). C2 only matters if a protected public repo is later flipped to private; the website repo stays public and the platform repo is created private, so the decision can be made without C2. C3 matters only for the 39-05 enable step on the public website repo.
