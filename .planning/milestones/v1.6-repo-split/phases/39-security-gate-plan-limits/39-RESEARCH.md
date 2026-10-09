# Phase 39: Security gate + GitHub plan limits - Research

**Researched:** 2026-10-08
**Domain:** secret scanning (local + GitHub), GitHub Free-plan limits, branch-protection behaviour on private repos
**Confidence:** MEDIUM-HIGH (state facts HIGH from live read-only GETs; "survives going private" is NOT yet proven, see SEC-03)

Legend: [V-api] verified by read-only `gh api` GET today; [V-doc] verified from the cited GitHub doc page (WebFetch summary, 2026-10-08); [V-local] verified by local command; [ASSUMED] inferred, must be proven by a test in the plan.

## Summary

No secret scanner is installed locally. The cheapest safe route is Homebrew `gitleaks` 8.30.1 (and optionally `trufflehog` 3.98.0, which also verifies liveness), both bottled, scanning a scratchpad `--mirror` clone of the GitHub remote. Docker 29.1.2 also exists as an alternative (no host install). Parrot is small (7.4 MiB pack, 385 loose objects, GitHub-reported 6.9 MB), so full-history scan takes seconds.

Important correction to the phase framing: `PA-Ai-Team/Parrot` is NOT in PA-MATRIX. It lives in org **PA-Ai-Team** (also Free plan, 26 private repos). `growthpods/Internjobs` is a USER repo (account `growthpods`, plan null, no org). PA-MATRIX holds only the public website repo plus other repos. So SEC-02 limits must be recorded for three owners: PA-MATRIX, PA-Ai-Team, user growthpods.

SEC-03 headline: on the Free plan, private repos cannot have branch protection or rulesets configured at all. Live GETs on private repos return HTTP 403 "Upgrade to GitHub Pro or make this repository public to enable this feature." [V-api]. Therefore the platform repo (private by design) will have NO protected `main` on Free, and the website repo (public) keeps its protection only while public. Whether pre-existing rules on a repo that later flips public->private are kept-but-unenforced or removed is NOT documented in the pages fetched, so it needs a throwaway-repo test (below) or be treated as irrelevant: Raj's decision does not depend on it, since the platform repo is created private and the website repo stays public.

**Primary recommendation:** run gitleaks (+ trufflehog if Raj approves the brew install) on a scratchpad mirror clone of the remote and of the local worktree refs; capture the plan limits matrix; present Raj a decision (upgrade PA-Ai-Team/PA-MATRIX to Team vs alternative) backed by the 403 evidence and, optionally, a throwaway-repo experiment; all GitHub writes and the brew install are approval checkpoints.

## Q1: Local scanners [V-local]

| Tool | Present | Available via brew |
|------|---------|--------------------|
| gitleaks | no | 8.30.1 bottled |
| trufflehog | no | 3.98.0 bottled |
| git-secrets, detect-secrets, semgrep | no | not checked |
| docker | yes, 29.1.2 | image pull is a local write too |
| node | yes (`/usr/local/bin/node`) | fallback only |

Installing a scanner is a write to `/opt/homebrew`, outside Parrot and outside the repo, but still a local machine change: make it an explicit approved step (D-number) and record the version. Alternative that installs nothing: `docker run --rm -v <scratch-mirror>:/repo:ro zricethezav/gitleaks:v8.30.1 git /repo` (pulls an image; ASSUMED command shape, verify `--help` in RED step). Do NOT hand-roll a regex scanner in node; use only as last resort and then it cannot support a "scanned" claim.

Scanning Parrot without writing to it (options, ranked):
1. **Mirror from GitHub remote into scratchpad** (`git clone --mirror https://github.com/PA-Ai-Team/Parrot.git <scratch>/parrot.git`). Reads the remote only; Parrot untouched; picks up all remote refs including those not fetched locally (local clone has remote branches only up to its last fetch; origin already moved 1ef2960 to 74880e45 pre-D12, so stale refs are real) and `refs/pull/*`. Recommended primary. Needs network and `gh auth` credentials via the keyring (token scopes include repo). Record resulting ref count and `git rev-parse` tips.
2. **Local clone of Parrot for unpushed work** (`git clone --mirror --no-hardlinks file:///Users/rajren/Documents/Parrot <scratch>/parrot-local.git`): reads Parrot's object DB, writes only scratch. Covers the two worktree branches (`fix/contact-dedupe-on-send` ece5eb8, `fix/sms-send-and-contact-dedupe-main` 11b2277) if they are not pushed. Note the clone does not include uncommitted worktree edits or stash; scan those separately with `gitleaks dir` pointed at the worktrees (read-only; gitleaks dir reads files, does not write). Use `--no-hardlinks` / `file://` so no hardlinks to Parrot's objects are created.
3. **In-place** `gitleaks git ~/Documents/Parrot` with `GIT_OPTIONAL_LOCKS=0`: gitleaks shells out to `git log`, which with optional locks off should not refresh the index, but it is "read-only by convention" not by construction. Parrot also has a broken ref (`refs/heads/main 2`; git prints "ignoring ref with broken name"), which may produce warnings or abort the log walk. Avoid as primary; acceptable only as a cross-check.

Verdict on the scratchpad mirror: a local write outside Parrot, within the session scratchpad, is within the hard rules (Parrot read-only; no GitHub writes). Document it as such; delete the scratch mirror after (it contains secret values if any exist). Findings scratch must stay outside the repo.

Also scan the **current tree** at the three tips (origin/main 74880e45, and each fix branch) via `gitleaks dir` on `git worktree`-free export: `git -C <scratch-mirror> archive <sha> | tar -x -C <scratch-tree>`.

## Q2: Exact GitHub state today [V-api, all read-only GET]

Auth: `gh` logged in as user `growthpods`, scopes admin:org, delete_repo, gist, repo, workflow (so write scopes exist: executors must be disciplined).

| Owner | Plan | Notes |
|-------|------|-------|
| PA-MATRIX (org) | `free`, seats 4/4, private_repos limit 10000, 2FA required | 9 private + 2 public |
| PA-Ai-Team (org) | `free`, 26 private repos | org rulesets GET 403 "Upgrade to GitHub Team" |
| growthpods (user) | `plan: null` in `/user` (not reported) | repo-level GETs 403 as below |

PA-MATRIX repos (11): internjobs-marketing-website PUBLIC; OpenMythos PUBLIC; PRIVATE: superintelligence, DEMO-dev-sios-acme-inc, Enrichment, sis-marketing-website, DEMO-keystone-assurance-website, DEMO-sunrise-dental-website, DEMO-acme-website, MAH-Sample-VA, ussuperapp.

| Repo | Visibility | security_and_analysis | Branch protection `main` | Rulesets |
|------|-----------|----------------------|--------------------------|----------|
| PA-MATRIX/internjobs-marketing-website | public | secret_scanning disabled, non_provider_patterns disabled, push_protection disabled, validity_checks disabled, dependabot_security_updates disabled | PRESENT: 4 required checks (`workspaces (marketing · app · employers)`, `workspace worker (parrot)`, `startups worker (typecheck · tests)`, `submission gate (rrr)`), strict, PR required with `required_approving_review_count: 0`, `enforce_admins: false`, no force-push/deletion | 1 active: "integration branches: PR + CI + submission gate" on `refs/heads/integration/**` (deletion, non_fast_forward, pull_request, required_status_checks), no bypass actors |
| PA-Ai-Team/Parrot | private | `null` (field not returned; admin perms true) | 403 "Upgrade to GitHub Pro or make this repository public" | 403 same message |
| growthpods/Internjobs | private | `null` | 403 same | 403 same |

Secret-scanning alerts API: 404 "Secret scanning is disabled on this repository" for all three (that is "disabled", not permission). `gh api .../code-security-and-analysis` is 404 (wrong endpoint; do not use). Permissions: `admin: true` on all three, so 403s are PLAN limits, not permission. Parrot has 0 open or any PRs via the `pulls` list was not obtained (shell glob error); Phase 38 says PR #11/#12 exist: re-run with quotes. Parrot: 0 Actions secrets reported (query returned 0).

Notable: public website repo has secret scanning DISABLED even though it is free on public repos. Plan: enabling it is the main achievable SEC-02 win (see Q3). Marketing website `main` protection requires 0 approving reviews and does not enforce admins (relevant to GH-01 "PR + review + CI": review requirement is currently 0; flag for Phase 41, not here).

## Q3: GitHub documentation facts

| Claim | Status | Source |
|-------|--------|--------|
| Secret scanning on public repos: "runs automatically for free" | [V-doc] | https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning |
| Org-owned private repos: "Available with GitHub Secret Protection enabled on GitHub Team or GitHub Enterprise Cloud" (so NOT on Free) | [V-doc] | same page |
| Secret Protection price $19 per active committer per month (active = pushed in last 90 days to selected private repos), purchasable on Team without Enterprise, metered billing, push protection included | [V-doc via search snippet of GitHub changelog/doc] MEDIUM: https://github.blog/changelog/2025-03-04-introducing-github-secret-protection-and-github-code-security/ and https://docs.github.com/en/code-security/how-tos/secure-at-scale/configure-organization-security/configure-specific-tools/estimating-the-price-of-secret-protection ; confirm on the pricing page at decision time | |
| Partner patterns are reported to providers and not shown in repo alerts | [V-doc] | about-secret-scanning |
| Free plan page lists protected branches/required reviewers/code owners under Team "Advanced tools and insights in private repositories"; Free = "unlimited public repositories with a full feature set" | [V-doc, partial: page does not itemize rulesets] | https://docs.github.com/en/get-started/learning-about-github/githubs-plans |
| Branch restrictions: available "in public repositories owned by a GitHub Free organization and in all repositories owned by an organization using GitHub Team or Enterprise Cloud" | [V-doc] | https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches |
| Public -> private: forks stay public and detach; stars/watchers erased; on Free "some features won't be available"; Pages unpublished on Free; GHAS features stop unless org-owned; code scanning unavailable without Code Security; custom Dependabot rules disabled | [V-doc] | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility |
| What happens to EXISTING branch protection/rulesets on public->private on Free | NOT documented on the fetched pages. Doc mentions only "all push rulesets will be disabled" for the reverse direction | [ASSUMED]: rules likely stay stored but unenforced/hidden; prove by test |
| Push protection on public repos is free | [ASSUMED], not on fetched page (push protection page was not fetched). Verify at https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection before the plan asserts it; the API field `secret_scanning_push_protection` exists on the public repo and can be tested by the enable step's readback |
| Free org one-time "secret risk assessment" report across private repos | [ASSUMED] exists (named in doc search result "secret risk assessment page"); check as a no-cost way to scan private repos for provider-pattern secrets without buying anything |

Empirical confirmation of the plan limit [V-api]: all private repos on Free (PA-Ai-Team/Parrot, growthpods/Internjobs) return 403 for both protection and rulesets, with admin permission. Strong evidence that protection cannot be set on a private Free repo. Rulesets on public repos on Free work (the website repo has an active one).

## Q4: Proving enforcement under the current plan without touching real repos

Reads cannot prove the post-flip behaviour; only a repo that is flipped can. The existing 9 private PA-MATRIX repos already answer "can it be configured": no (403). Options for the remaining question, all are LIVE WRITES needing recorded approval from Raj before running (create/delete repo are GitHub writes even for a throwaway):

| Option | Steps | Risk | Readback |
|--------|-------|------|----------|
| A. Throwaway public repo in PA-MATRIX (or a personal account) | create public `zz-sec03-probe-<date>`; PUT branch protection (require PR, enforce_admins true); confirm GET 200; flip to private (PATCH `private=true`); GET protection again; try a direct push to `main` (probe commit) and record accepted/rejected; delete repo (`delete_repo` scope present) | Creates and deletes a repo in the org; PA-MATRIX has 4/4 seats and Free (no billing impact; Free private repos unlimited); name must not collide; deletion must be verified (404) | GET protection status code before/after flip; direct-push result; final 404 on repo GET |
| B. Same in the `growthpods` personal account | identical | Personal-account plan unknown (`plan: null`): result may not generalise to an org on Free | same |
| C. No experiment; rely on 403 evidence and doc reading | none | Leaves "survives going private" as an inference, which SEC-03 says must be VERIFIED | n/a |

Recommendation: Option A in the org that matches the target (PA-MATRIX if the website repo owner; the platform repo owner matters too, since PA-Ai-Team is also Free) with Raj's approval recorded first, with the executor stopping on any unexpected result and not retrying. Note the practical question for the split: new platform repo is created private on Free, so branch protection is simply unavailable regardless of the probe result; the probe matters mainly for "flip public to private" paths (e.g. if the website repo were ever made private). The plan should make this explicit so Raj can choose C if the flip is never planned.

Raj decision to put to him (SEC-03), with measured facts: (1) upgrade PA-Ai-Team (and/or PA-MATRIX) to Team (price to confirm at the pricing page; not looked up here), which gives private-repo branch protection/rulesets and allows buying Secret Protection; (2) alternative keeping `main` protected without paying: keep the platform repo in a place where protection exists (make it public: not acceptable for platform code), or use client-side/CI enforcement (required status checks are part of protection so unavailable; the `submission gate` can only warn), or deploy only from a protected public repo / a manual promotion gate and rely on repo access limits (4 seats). State honestly that CI-only alternatives cannot BLOCK a direct push to `main`.

## Q5: Recommended plan decomposition

CONTEXT order dependencies: Phase 39 depends on Phase 38 (complete); writes are blocked until Raj approvals. Number new decisions D15+ in CONTEXT.md (D14 is last).

Verifier: create a NEW `scripts/verify-security-gate.mjs` + `scripts/verify-security-gate.test.mjs` (same style as `verify-code-maps.mjs`: pure exported functions, `parseArgs`, fixture tests in tmpdirs, modes, GIT_OPTIONAL_LOCKS=0, never `git status`). Do not extend verify-code-maps (its closure semantic is Phase 38's, and 38-03 advisory notes the glob model is fragile). Reuse by importing `parseArgs`, `hashFile`, and the `--guard --baseline` pattern from verify-code-maps if exports allow. Suggested modes:
- `--scan-record <file>`: validates findings record schema (tool+version, ref list with tip SHAs, commit counts, finding count, per finding: file, rule id, commit SHA, classification real/false-positive/test-fixture, disposition) and FAILS if any value-like string (high-entropy token, `AKIA`, `ghp_`, `sk-`, `xox`, private key header) appears in the record (negative control: fixture record containing a fake token must exit 1).
- `--scan-coverage`: record's ref list must equal (set-equal) `git for-each-ref` of the mirror, including both worktree branches, and the tip SHAs match; negative control: drop a ref and see exit 1.
- `--limits <file>`: validates the limits matrix against `gh-snapshot`-style JSON for the three owners (plan name, 403 messages verbatim), with the SEC-02 per-repo state.
- `--sec03`: requires a `SEC-03-DECISION.md` (or CONTEXT D-entry) with recorded Raj answer before `--closure` passes; negative control: missing decision => exit 1 (the "decide BEFORE any visibility change" gate).
- `--guard`: Parrot/legacy/cms untouched (reuse baseline); plus "no GitHub write" check: the executor's recorded `gh` command log contains only GETs except approved ones.
- `--closure [--final]`: two-state closure as in Phase 38 (executed pending verification -> Complete after rrr-verifier + Raj approval).

Every plan: tests first, RED evidence file, implement, GREEN evidence file (Phase 38 naming: `39-0N-RED.txt`, `-GREEN.txt`, `-RED-live.txt`, `-GREEN-live.txt`). Live steps need fail-before/pass-after readback (e.g. `gh api repos/PA-MATRIX/internjobs-marketing-website --jq .security_and_analysis.secret_scanning.status` is `disabled` RED, `enabled` GREEN).

| Plan | Wave | Content | Autonomous? |
|------|------|---------|-------------|
| 39-01 | 1 | `verify-security-gate.mjs` skeleton + tests: record schema, no-value leakage check, ref coverage, guard, gate-prev 38 | yes |
| 39-02 | 2 (parallel with 03, 04) | Parrot scan (SEC-01): checkpoint "approve `brew install gitleaks` (and trufflehog)" first; mirror clone to scratchpad; scan full history + 3 tips + worktree dirs; write record (no values); classify findings; delete scratch mirror | CHECKPOINT for install; scan then autonomous |
| 39-03 | 2 | Current-state/limits capture (SEC-02 part 1): read-only GETs for the three owners and all in-scope repos, store JSON snapshot + limits matrix doc | yes |
| 39-04 | 2 | SEC-03 doc research record: verified-vs-assumed table (Q3), cost lookup at pricing page, options write-up | yes (research only) |
| 39-05 | 3 | LIVE SEC-02: enable secret scanning + push protection (and validity checks) on `PA-MATRIX/internjobs-marketing-website` (public: free) and wherever else the plan allows; readback RED/GREEN; record limits (private repos not enable-able without Secret Protection) | CHECKPOINT: Raj approval recorded first (D15) |
| 39-06 | 3 | LIVE SEC-03 probe (Option A) if Raj chooses it; then the decision checkpoint: Raj chooses upgrade vs alternative; record in CONTEXT.md D-entry + STATE.md same turn | CHECKPOINT x2 (probe approval, decision) |
| 39-07 | 4 | closure: `--closure`, records at "executed, pending verification", rrr-verifier, then flip after Raj approves | CHECKPOINT (flip) |

Parallelism: 02, 03, 04 are independent after 01. 05 depends on 03 (baseline state) and benefits from 02 results. 06 depends on 04. If 39-02 finds a real secret: insert a rotation task (below) before 05 and 07; rotation is a live production action requiring approval.

Plans 05/06 should have `autonomous: false`. Pre-write checker constraints: each must_have truth names the test; the closure test aggregates gates.

## Q6: Pitfalls and handling

1. **Leaking values**: gitleaks writes secrets into its JSON/SARIF report unless `--redact` is used. Always `--redact` (100) and report to a scratchpad file; never print stdout of findings; commit only a sanitized record (file path, rule id, commit SHA, fingerprint). The verifier's value-leak check is the safety net. Delete scratch reports and the mirror when done. trufflehog: use `--no-verification` only if Raj wants to avoid outbound liveness calls; verification sends the candidate secret to the provider (a third-party call): decide explicitly.
2. **False positives**: Phase 38 map showed Parrot has fixtures/signing keys context (embed token, JWKS): expect JWT-like test strings, public JWKS, `.env.example` placeholders, lockfile hashes. Classify each: real / false-positive / test fixture / public-by-design; keep a `.gitleaksignore` style list in the record (fingerprints), not in Parrot. A finding in a deleted-in-history file is still real if live.
3. **Coverage gaps**: mirror of remote misses unpushed local commits and worktree uncommitted edits; scan both (Q1 options 1 and 2 plus `gitleaks dir` on worktrees). Local branches `fix/*` exist at two worktrees; remote branch count 28ish (feat 11, fix 12, cleanup 1, integration 1, wip 1). Stale-remote-ref risk: Parrot local remote refs are behind origin; use the GitHub mirror as ground truth. The broken ref `refs/heads/main 2` in Parrot should be reported in the record as an observation, not fixed (read-only).
4. **History size**: negligible (7.4 MiB), so no need for shallow scans or `--log-opts` limiting; scan with `--log-opts="--all"` on a bare mirror (gitleaks `git` on a bare repo works from the path; verify the flag shape with `gitleaks git --help` in RED). Also remember secrets reachable via `refs/pull/*` and deleted branches remain fetchable on GitHub even if removed from refs: the mirror from the remote includes PR refs (hidden refs on mirror clones may be rejected for pull/*; record what the clone included).
5. **Rotating a real secret**: values live in Infisical Projecta org `2c12f042...`, project `26995afd...`, env `prod`, path `/internjobs-ai` (from memory; old `0484b3ce` ID is dead). Per CLAUDE rules, rotation is a live production action as an executor task with Raj's approval recorded first; issuer-side rotation (provider console) first, then update Infisical and the Worker secret (`wrangler secret`), then re-run the scan and the live readback (old credential rejected, new accepted). Removing a secret from history does not make it safe: rotate regardless; history rewrite is out of scope (SEC-04 handles the website repo history). Record in the findings only "rotated yes/no, date, where updated", never values. Do not store pasted tokens only in chat (memory: save to Infisical first).
6. **Enabling secret scanning does not scan the past retroactively as push protection**: secret scanning does scan existing history on enabling for supported repos (GitHub docs; ASSUMED, verify), but alerts appear only in the repo's Security tab; the readback should check `gh api repos/.../secret-scanning/alerts` returns 200 (not 404) after enabling and list the count.
7. **Free-plan trap in the split**: new platform repo private on Free: no protection, no secret scanning. Phase 41's GH-01 "protected `main`" applies to the public website repo; the platform repo's protection depends on the SEC-03 decision. Make the dependency explicit for Phases 40/41.
8. **Token has write scopes**: executors must restrict themselves to `-X GET`/default GET; the verifier should check the executor command log. No GitHub writes in research (none made here).
9. **Website repo "public → private"** removes stars/watchers, detaches forks, unpublishes Pages on Free [V-doc]: only relevant if the flip is ever proposed; currently not planned.

## Open Questions

1. Does protection on a public repo remain enforced after a flip to private on Free? Unverified; Option A probe (needs approval) answers it. If the platform repo is always created private, the answer does not affect the split plan.
2. Is push protection free on public repos and exactly how is it enabled by API (`security_and_analysis.secret_scanning_push_protection.status = enabled`)? Not verified on the doc page; check the about-push-protection doc in plan 39-04.
3. Team plan seat price and whether the Secret Protection price is still $19 per active committer: confirm on the live pricing page when presenting the decision (not fetched).
4. Which other PA-Ai-Team/PA-MATRIX private repos are in scope for SEC-02 ("every repo where the plan allows")? On Free, only public repos qualify: internjobs-marketing-website and OpenMythos (public, PA-MATRIX); PA-Ai-Team public repos not enumerated (run `gh repo list PA-Ai-Team --limit 100 --json name,visibility` in plan 03). Raj to confirm scope (OpenMythos is outside the project).
5. Parrot PRs #11/#12 and open branches were not enumerated in this pass (glob error); redo in plan 03.

## Sources

- Live read-only `gh api` GETs, 2026-10-08 (orgs/PA-MATRIX, orgs/PA-Ai-Team, repos/*, branches/main/protection, rulesets, secret-scanning/alerts) [HIGH]
- `command -v`, `brew info`, `git for-each-ref`, `git count-objects` [HIGH]
- https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning [HIGH for quoted lines]
- https://docs.github.com/en/get-started/learning-about-github/githubs-plans [MEDIUM, partial]
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches [MEDIUM]
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility [HIGH]
- https://github.blog/changelog/2025-03-04-introducing-github-secret-protection-and-github-code-security/ and the estimating-the-price doc (via search snippets) [MEDIUM]

**Valid until:** about 2026-11-07 (plan/pricing details change; the live state is point-in-time and must be re-captured at execution).
