# v1.6 Repo Split + Code Mapping — Context

**Status:** Opened 2026-10-08. Planning + read-only mapping may start now; no repo/GitHub changes until the plan is checker-approved and Raj approves each live action.
**Includes Nithin's v1.5 merge (Raj, 2026-10-08):** promoting `integration/v1.5` -> `main` is Phase 0 of this milestone, so the split runs on top of his finished work and never conflicts with it. Split work must not edit v1.5 phase code before that merge lands.

## Intent (Raj, 2026-10-08)
1. Map all three Intern Jobs codebases with RRR code mapping BEFORE any split.
2. `internjobs-cms` must be JUST the public marketing website (`apps/marketing`) and be protected.
3. Everything else (student `apps/app`, `apps/employers`, `apps/startup`, Workspace `apps/parrot`, `apps/mac-bridge`, workers, `packages/shared`) goes to a separate private platform repo/folder.
4. Map GitHub repos <-> local folders so there is no confusion.

## Phase 0 — merge Nithin's v1.5 work into main (prerequisite to the split)
State checked 2026-10-08: `integration/v1.5` is 86 commits / 101 files (+14,238/-423) ahead of `main`; main is 0 ahead (clean fast promote). Merged into integration via PRs #24 (Phase 33 Startups web app go-live), #25 (Phase 36 Lakera quarantine + fail-open), #26 (Phase 32 Parrot dialer embed), each with `submissions/<phase>.json` markers (32, 33, 36).
- **Phases 34 (Telnyx go-live) and 35 (first pilot install) have NO submission marker** — not done as far as the repo shows. Raj believes Nithin is finished; confirm with Nithin whether 34/35 are done, deferred, or dropped before promoting.
- Promote via `/rrr:coordinate-merge` / PR `integration/v1.5` -> `main` (ruleset: PR + CI + submission gate). Run `/rrr:audit-milestone` for v1.5 first, then close v1.5.
- Only after this lands: freeze `main`, then start the split.

## Decisions
- **D1 — Parrot stays where it is:** `PA-Ai-Team/Parrot` (local `~/Documents/Parrot`) is NOT moved to PA-MATRIX. (Raj, 2026-10-08)
- **D2 — Two repos/folders:** public website-only repo + private platform repo, both under PA-MATRIX. (Raj: "clean two folder split")
- **D3 — Legacy:** `growthpods/Internjobs` (`~/MayaOS/internjobs-ai`) archived after its 4 uncommitted files are resolved.
- **D4 — Registered as v1.6.** Research skipped; code mapping is the research.
- **D8 — v1.5 Phases 34 (Telnyx go-live) and 35 (first pilot install) recorded as DEFERRED (Raj, 2026-10-08: "leave that alone and lets move on").** Checked 2026-10-08: no branch, PR or submission marker for 34/35; Nithin has no open PRs; latest work is Phases 32/33/36 (last push 2026-08-12, PR #26 merged 2026-09-23). v1.5 closes as PARTIAL: delivered 32, 33, 36; deferred 34, 35 (carry to a later milestone). No further chasing of Nithin in this milestone. MERGE-01 satisfied by this record.
- **D9 — Raj pre-approves the v1.5 promotion merge (2026-10-08, "proceed with any pr merges if needed").** Scope, as I (Claude) apply it: ONLY the promotion PR `integration/v1.5` -> `main`, as a MERGE COMMIT (no squash/rebase, no admin bypass, no force-push, no branch deletion), pinned to the `integration/v1.5` tip sha read at pre-flight, and ONLY after plan 37-02's gates pass (37-01 verifier passed, `--preflight-checks` exit 0, 4 required checks SUCCESS, `--expect-head` matches). Any surprise (new commits on either branch, a failing required check, conflicts, protection drift) = STOP and report; this approval does not cover them. NOT covered: merging PR #27 (stays open until the Phase 37 verifier passes, then merges as the closing step of 37-03 and needs a separate go-ahead), deleting `integration/v1.5`, any visibility/rename/archive step (Phase 41), anything in `PA-Ai-Team/Parrot`.
- **D9 OUTCOME (2026-10-08): promotion merged.** At the gate Raj answered explicitly "Approve: merge #28 now". PR #28 (`integration/v1.5` -> `main`) MERGED as a merge commit `4c182d3` (parents 13b0a5e + 1ecddd9); `integration/v1.5` kept at 1ecddd9; no squash, no admin bypass, no force-push. Checks: 4 required SUCCESS (submission gate (rrr), workspaces (marketing · app · employers), workspace worker (parrot), startups worker (typecheck · tests)) plus 2 extra SUCCESS (email timeout invariant (cross-package), email worker (tests)). Two verifier advisories were shown to Raj before he approved (Phase 32/33 verifiers returned human_needed; audit recorded as gaps_accepted with 9 named gaps). `verify-v15-promotion.mjs --post --pr 28` exit 0 (tip 1ecddd9 is an ancestor of origin/main; markers 32/33/36 on main). PR #27 and branch deletion remain NOT approved.
- **D10 — `main` frozen to non-v1.6 changes until the split lands (Phase 41); PROCESS RULE ONLY (Raj's MERGE-04 intent; recorded 2026-10-08).** PA-MATRIX is on the free plan, which cannot enforce this on a private repo, and 37-03 adds NO new ruleset. The check is a readback: `node scripts/verify-v15-promotion.mjs --freeze` (fed by `gh pr list --state open --base main --json number,headRefName,title`) exits 0 only when every open PR against `main` is a v1.6 docs/split branch; right now the only such PR must be PR #27. PR #27 itself merges only after the phase-level rrr-verifier passes and with Raj's separate go-ahead.
- **D11 — Phase 37 completion approval (Raj, 2026-10-08, explicit: "Flip to Complete and merge #27").** Scope: (a) flip MERGE-01..04, ROADMAP Phase 37 and STATE to Complete, valid because `37-VERIFICATION.md` is `status: passed` (re-verified 2026-10-08 after conditions A/B closed; CI on 1a6b470 green); (b) merge PR #27 (`docs/open-v1.6-repo-split` -> `main`) as a MERGE COMMIT with `--match-head-commit`; no squash, no rebase, no admin bypass, no `--delete-branch`. NOT covered: branch deletion, `integration/v1.5`, `main` pushes other than the PR merge, anything in `PA-Ai-Team/Parrot`, GitHub settings. The weak-but-disclosed RED evidence for 37-03 (live closure RED not saved at the time; tests and implementation in one commit 9483f0a) was shown to Raj and accepted.
- **D5 — Nithin's v1.5 merge is combined into this milestone as Phase 0.** (Raj, 2026-10-08)

## Decisions confirmed 2026-10-08 (Raj: "proceed with your recommendations")
- **D6 — New cms repo = fresh start (no history)**, safest for a public repo.
- **D7 — Do NOT flip the current public repo to private yet.** PA-MATRIX is on GitHub's FREE plan: private repos there do not enforce branch protection/rulesets, so going private could silently drop the `main` protection + `integration/**` submission gate. Requirement: verify plan/feature limits (upgrade org to Team, or keep protected repos public-but-sanitised) BEFORE any visibility change; platform repo must be private AND protected, so the plan question gates its creation.

## Open decisions (need Raj before the plan is final)
- Repo names (`internjobs-cms` / `internjobs-platform`) and local layout (`~/internjobs/{cms,platform,parrot}`).
- Whether `apps/parrot` (monorepo Workspace) vs `PA-Ai-Team/Parrot` relationship needs any change (map first).

## Audit facts (2026-10-08, read-only)
- No real secrets in `internjobs-cms` tree or git history (all matches are placeholders/comments); legacy repo clean; `PA-Ai-Team/Parrot` NOT yet scanned.
- Public repo exposes `.planning/`, infra docs, Infisical project paths, credential-rotation runbook.
- Secret scanning + push protection DISABLED on `PA-MATRIX/internjobs-marketing-website`.
- `main` protected: reviews required + 4 CI checks (`workspaces (marketing · app · employers)`, `workspace worker (parrot)`, `startups worker (typecheck · tests)`, `submission gate (rrr)`). `.github/workflows/ci.yml` hard-codes this layout.
- Collaborators: jsriya14 (admin), growthpods (admin), nithinpotti (write), vamshiparvatham (read).
- 19 remote branches, stale: `phase-07b`, `phase-09`, `phase-10`, `rrr/v1.4/*`, 2 worktree-agent branches.
- `~/Documents/Parrot` local clone is 664 commits behind origin/main; two extra worktrees (`Parrot-wt-dedupe`, `Parrot-wt-main-port`). Sync before mapping.
- Existing `.planning/codebase/` maps exist for cms and Parrot (staleness unknown); legacy has none.

## Repo <-> local map (today)
| GitHub | Visibility | Local |
|---|---|---|
| PA-MATRIX/internjobs-marketing-website | Public | ~/internjobs-cms |
| PA-Ai-Team/Parrot | Private | ~/Documents/Parrot (+2 worktrees) |
| growthpods/Internjobs | Private | ~/MayaOS/internjobs-ai |

## Rules for this milestone
- TDD-first plans; rrr-plan-checker before execution; rrr-verifier per plan.
- Before moving anything, grep every repo for every place the layout/paths are enforced (CI, wrangler, deploy, STATE, `packages/shared` imports) and list each with its disposition.
- Live GitHub actions (rename/transfer/visibility/archive) run as executor tasks with Raj's approval recorded first.
- Run `/rrr:audit-milestone` before calling it done.

## v1.5 Phase 34/35 status (MERGE-01)

- Phase 34: deferred — confirmed by Raj on 2026-10-08: D8; no branch, PR or submission marker on integration/v1.5
- Phase 35: deferred — confirmed by Raj on 2026-10-08: D8; no branch, PR or submission marker on integration/v1.5

## Phase 38 Parrot fast-forward — HOLD (2026-10-08)

- Raj declined (chose Hold) the `git fetch` + `git pull --ff-only` of `~/Documents/Parrot` (before `1ef2960b…`, proposed after `74880e45…`) at the 38-01 checkpoint. Nothing in Parrot was touched; no `parrot-ff-record.json` written. The D12 number stays reserved for an eventual approval.
- Effect: Plan 38-01 Task 3 not run; 38-01 incomplete; waves 2–4 (depend on 38-01) are blocked. MAP-02 would map the stale Parrot tree unless Raj re-approves or chooses another route.

## D12: Phase 38 Parrot fast-forward APPROVED (2026-10-08) — supersedes the HOLD above

- Raj reversed the Hold and approved ("proceed on both", 2026-10-08) `git fetch origin` + `git pull --ff-only origin main` on `~/Documents/Parrot`, main only: before `1ef2960b49d48d1f46c4151a0a115cce7e268e0d`, approved after `74880e45226e4920cfdf1dec6b36bea5fd8a190b`. D12 is now used (once). Worktrees and fix/* branches must stay unchanged. Record: `phases/38-code-map-coupling-inventory/parrot-ff-record.json`.

## D13: Phase 38 outcomes (2026-10-08; executed, pending verification)

- Parrot fast-forward (D12 approval, see D12 and `phases/38-code-map-coupling-inventory/parrot-ff-record.json`): `1ef2960b49d48d1f46c4151a0a115cce7e268e0d` -> `74880e45226e4920cfdf1dec6b36bea5fd8a190b` (841 commits), main only. Both worktrees and every fix/* branch measured unchanged by `--guard`.
- Parrot worktrees left untouched: `Parrot-wt-dedupe` (`fix/contact-dedupe-on-send`, ece5eb8) backs open Parrot PR #11; `Parrot-wt-main-port` (`fix/sms-send-and-contact-dedupe-main`, 11b2277) backs open Parrot PR #12.
- MAP-05 verdict: no shared source in either direction; the relationship is a runtime seam (Workspace iframes parrot.projecta.ai with a signed embed token, Parrot verifies against workspace.internjobs.ai JWKS). Must not change: worker name `internjobs-parrot`, domain `workspace.internjobs.ai`, `/oidc/jwks`, Parrot `/embed` route, `internjobs` embed tenant, `parrot.projecta.ai`.
- MAP-04 inventory (input for Phase 40): 54 rows over three repos, dispositions keep 14, move 25, rewrite 15, delete 0. Parrot has zero layout hits at origin/main. `packages/shared` has no consumer.
- Open notes (not blockers): (1) 38-03 advisory: removing a specific non-glob named-minimum row silently demotes it to its glob's disposition; an exact-path row requirement was not added (not cheap to do test-first without reworking the glob model), recorded here instead. (2) The 11 Excluded repos in REPO-MAP.md are justified only by zero references in the cms tree; Raj has not confirmed them. (3) Liveness of the legacy Render services (`render.yaml`) was not checked. (4) `handoff-preflight.js` is broken; ignored.

## D14: Phase 38 flip to Complete APPROVED (Raj, 2026-10-08, "Approve flip")

- Question put to Raj: "Approve flipping Phase 38 / MAP-01..06 to Complete (records only, no push or GitHub action)?" Answer: "Approve flip".
- Basis: `phases/38-code-map-coupling-inventory/38-VERIFICATION.md` is `status: passed` (10/10 must-haves, commit ff9ca98). Phase-level rrr-verifier ran before this approval.
- Scope (covered): records only. MAP-01..06 `[x]` and traceability `Complete` in REQUIREMENTS.md; ROADMAP Phase 38 ticked; STATE.md phase 38 complete with progress 2 of 6 phases (33%), next Phase 39; `current-intent.json` updated.
- NOT covered: any push, PR, merge, GitHub write, commit of runtime files, or any change to PA-Ai-Team/Parrot, growthpods/Internjobs or the legacy checkout. The docs/phase-38-code-map PR is held per D10 (main frozen to non-v1.6 changes) pending a separate decision with Raj.
- Open items carried to Phase 39+: `apps/canary-monitor/` has no home decided (needed before Phase 40/41); the 11 Excluded repos in REPO-MAP.md are not yet confirmed by Raj; legacy Render service liveness (`render.yaml`) is unconfirmed.

## D15: Phase 39-04 scanner install and scratch mirrors APPROVED (2026-10-09T04:50:15Z)

- Question: approve installing a secret scanner and scratch mirrors of PA-Ai-Team/Parrot for SEC-01. Answer (Raj): **approve-gitleaks** (brew install gitleaks 8.30.1; trufflehog not installed).
- Scope: the install writes under /opt/homebrew only; two scratch mirrors (GitHub and local-object), tip-tree extracts and redacted reports live under the scratchpad `sec-scan/` dir and are deleted after use. Parrot (~/Documents/Parrot) and its worktrees stay read-only (GIT_OPTIONAL_LOCKS=0). No rotation is covered: a real finding stops the plan.
- Disclosure: mirrors hold any secret values present in Parrot history until the scratch dir is deleted; scanners run with --redact=100; nothing is printed to the terminal or committed. Record: 39-04-APPROVAL.json, 39-04-approved-commands.json.

## D16: Phase 39-05 secret-scanning / push-protection scope CONFIRMED (2026-10-09T04:50:15Z)

- Question: which repos get secret scanning + push protection enabled (public repos only; free plan cannot do private). Answer (Raj): **website-only** = PA-MATRIX/internjobs-marketing-website.
- Facts (39-05-LIMITS.md): PA-MATRIX, PA-Ai-Team free; PA-Ai-Team has no public repos; private repos return 403 for protection/rulesets and 404 for secret-scanning alerts on the free plan; the 9 growthpods public repos already have both on; PA-MATRIX/OpenMythos (outside the project) excluded. Enabling happens in 39-08 behind its own approval (D18). Record: 39-05-SCOPE.json.

## D17: Phase 39-07 throwaway-repo probe APPROVED (2026-10-09T04:50:15Z)

- Question: run a throwaway-repo probe to measure whether branch protection survives going private? Options: org-probe (PA-MATRIX) | personal-probe (growthpods) | skip. Answer (Raj): **org-probe**. Approved by: Raj. approved_at: 2026-10-09T04:50:15Z.
- Account/owner: PA-MATRIX. Disclosure: creates and deletes one repo (zz-sec03-probe-20261008) in the org (no billing or seat effect); the 7 exact write commands are listed in 39-07-approved-writes.json; delete_repo scope is used once; the final GET must return 404; any unexpected status stops the plan with no retry and a loud report. Nothing outside the probe repo is touched.

## D15a: Phase 39-04 local-object mirror dropped; GitHub mirror only (2026-10-09T05:06:45Z)

- Context: under D15 the approved local-object clone (`git clone --mirror --no-hardlinks file:///Users/rajren/Documents/Parrot`) failed with `fatal: bad object 0000...` because the local clone has a broken ref `refs/heads/main 2` (null sha); `git fsck` also shows one dangling commit 1d577ffb. The GitHub mirror cloned fine (28 non-pull refs + 14 refs/pull/*; main 74880e45, both fix tips ece5eb84 / 11b2277a present on GitHub).
- Decision (Raj, option B): scan the GitHub mirror only (plus the two worktrees' uncommitted edits), drop the local-object source, record the broken ref and the dangling commit as observations. No new install or clone command is approved by this entry. This amends plan 39-04, so rrr-plan-checker runs again before the scan resumes. D15's approved command list is unchanged (the failed local clone line stays logged as attempted).

## D17a: Phase 39-07 probe result ACCEPTED as partial (2026-10-09T05:15:46Z)

- Context: the D17 org-probe stopped at the `git clone` step (HTTP 403 "Repository ... is disabled", cause unknown), so the direct push to `main` after the flip to private was NOT measured. Measured: protection PUT/GET 200 while public; GET protection after the flip to private returned 403 "Upgrade to GitHub Pro or make this repository public to enable this feature." The probe repo was deleted under the D17-approved delete line (final GET 404). Verifier status for 39-07: human_needed (gap: truth 3 push result unmeasured).
- Decision (Raj): **accept the partial result**; no re-probe. SEC-03 treats "protection survives going private" as UNPROVEN AND UNLIKELY (free-plan docs C1 + the 403 above), not as a measured fact. 39-09 must present it that way; the upgrade-vs-alternative decision (D19) is made on that evidence. No further GitHub write is authorised by this entry.

## D18: Phase 39-08 enable secret scanning + push protection on the public website repo APPROVED (2026-10-09T05:32:12Z)

- Question: enable secret scanning and push protection on PA-MATRIX/internjobs-marketing-website (the only repo in scope per D16)? Options: approve-scanning-and-push | approve-scanning-only | hold. Answer (Raj): **approve-scanning-and-push**. Approved by: Raj. approved_at: 2026-10-09T05:32:12Z.
- Facts: before-state (39-08-RED-live.txt): secret_scanning, push protection and validity checks all disabled; alerts API 404; repo public; Raj has admin. github.com/pricing lists push protection and secret scanning for public repos on Free, and the 9 growthpods public repos have both enabled, but the about-push-protection docs say repo-level push protection "Requires GitHub Secret Protection", so C3 stays ASSUMED until the readback.
- Disclosure: one PATCH to security_and_analysis (settings only; no content, branches, visibility or collaborators). Push protection can reject pushes containing detected secrets (all contributors, CI; bypassable deliberately). Secret scanning may open alerts on existing history, visible to repo admins; a real exposed secret would need a separate approved rotation task. If GitHub rejects the PATCH or push protection stays disabled, it is recorded as blocked-by-plan (measured limit); no retry. Rollback: PATCH both to disabled (not run unprompted). Exact command: 39-08-approved-writes.json. Record: 39-08-APPROVAL.json.

## D19: SEC-03 decision, accept-unprotected (2026-10-09T05:32:12Z)

- Context: private repos on Free refuse protection/rulesets (403, measured; 39-05). Probe (D17a) partial: "protection survives going private" UNPROVEN AND UNLIKELY. Prices (39-06): Team $4/user/month first 12 months (later rate unverified); Secret Protection $19/active committer/month; 4 seats = $16/month Team, +$76 Secret Protection, upper bound about $92/month. CI-only enforcement cannot block a direct push to main.
- Decision (Raj): **accept-unprotected** for the platform repo under PA-MATRIX (no upgrade, no alternative mechanism in this milestone). Recorded in SEC-03-DECISION.md.
- Consequences: the platform repo is created PRIVATE with NO branch protection or rulesets and NO secret scanning (free plan); main protection there is a process rule only (as in D10); write access is limited to the people who need it. The website repo stays public and protected (PR + 4 required checks, integration/** ruleset) with secret scanning + push protection per D18. Phase 40: build the platform repo locally; do not push anything to GitHub. Phase 41: create the platform repo private, tighten collaborator write access, record the unprotected state in the closure. Revisit trigger (proposed by Claude, to be confirmed by Raj; change it if you want a different one): revisit upgrade-team before adding any non-admin collaborator with write access, or at Phase 42 closure, whichever comes first. Nothing bought or flipped in Phase 39.

## D21: Phase 39-04 liveness test of the two flagged Parrot keys, ONCE each (Raj, 2026-10-09T05:34:12Z)

- Context: the Parrot history scan (39-04) flagged two likely-real literals in origin/main (74880e45): an X-API-Key literal in server/routes/contacts.js (POST to an external AEO audit webhook, first seen in 1a8dd6c0) and a TELNYX_API_KEY literal in .planning/milestones/v1.0/phases/01-foundation/01-03-SUMMARY.md (33cd67dc). Asked how to handle them, Raj answered **"test them once"**.
- Scope as applied by Claude: exactly one request per key, values read from origin/main via read-only git and never printed or stored (status codes only). Telnyx: a single read-only GET (balance). Webhook: one POST with an empty JSON body and NO domain, so a valid key fails validation instead of starting a 3-minute audit; a 2xx/audit-start response would be reported as live. No other provider call, no rotation, no history rewrite.
- Disclosure: the request sends each key to its provider, which is the point of the test. Also disclosed: while masking context for this check, Claude's pattern missed a Neon connection string in the same planning doc, so a Neon database password (user neondb_owner) was printed into this session's output; it is NOT repeated here. The gitleaks scan did not flag it. Whether that database is still live is open (see rotation decision).

### D21 outcome (2026-10-09T05:37:26Z)

- Telnyx literal (33cd67dc, planning doc): single read-only balance GET => HTTP 401, Telnyx error code 10009 (authentication failed). The key is invalid or revoked: dead. No rotation needed for it; the literal should still be removed from the tree.
- X-API-Key literal (1a8dd6c0, server/routes/contacts.js): one POST with an empty JSON body (no domain) to the audit webhook on a projecta.ai host => HTTP 422 (validation error, not 401/403). Interpretation: the key was most likely ACCEPTED, so it is probably LIVE; no audit was started by a 422. Not proof: some endpoints validate before authenticating. Treat as live until Raj says otherwise.
- The first run of the check hung at the Telnyx call (no response) and was stopped before the webhook step, so neither key was sent twice. No other provider was called.
- New findings surfaced the same turn, NOT yet decided: (a) a Neon database connection string with a password (user neondb_owner) in the same Parrot planning doc, missed by gitleaks and printed once into this session by Claude's masking slip; liveness untested. (b) Website repo (public) secret-scanning alert #1 after 39-08 enabled scanning: Stripe Webhook Signing Secret, file apps/startup/workers/routes/webhooks.test.ts line 142, commit cc0fe9a1, publicly_leaked true, validity unknown; most likely a test fixture, unconfirmed.

## D22: Raj asks Claude to rotate the exposed Parrot secrets, update Infisical and the repo (2026-10-09T05:44:35Z) - NOT YET EXECUTED

- Raj's words: "can you do it for me? rotate them and update the infisical and update here" (answer to how to handle the Parrot secrets: webhook X-API-Key probably live, Neon owner password exposed, Telnyx key dead). Also asked Claude to recommend what the Stripe-looking alert is.
- Read-only discovery so far: (1) Telnyx key is dead (401, D21) - nothing to rotate; (2) the audit-webhook key (projecta.ai host) is probably live; the service that issues it is not identified in the repo and Claude has no known admin access to it; (3) the Neon connection string in the Parrot planning doc points at Neon project "Parrot" (wild-firefly-34837743, us-east-1, same cluster host as the leaked string), whose compute was active minutes ago, i.e. a live production database; rotating neondb_owner would break the running Parrot app (Fly secret NEON_DATABASE_URL) until it is updated; whether the leaked password is still the current one is unknown; (4) Infisical CLI 0.43.49 is installed with a cached login; (5) the website-repo Stripe-looking alert #1 is TEST_SECRET in a deleted unit test (commit cc0fe9a1, file removed by 67f69e0) for a Clerk/Svix-style handler; whsec_ is the Svix prefix too; value is 38 chars containing a test-like word with test.invalid URLs: almost certainly a fixture, not a Stripe secret.
- Status: no rotation has been run. Rotating a live production database password and changing Parrot's secrets is a live production action: it needs an inserted plan (plan-checker), the exact steps shown to Raj, and his recorded approval first (CLAUDE.md). Parrot repo edits (removing the three literals from the tree) are a separate approved Parrot change; Phase 39 treats Parrot as read-only.

## D23 (2026-10-09): website repo renamed/moved

Raj: "github for cms moved to https://github.com/PA-MATRIX/INTERNJOBS-EXTERNAL-WEBSITE-CMS".
Measured: `PA-MATRIX/internjobs-marketing-website` now redirects to `PA-MATRIX/INTERNJOBS-EXTERNAL-WEBSITE-CMS` (same repo, public, default branch main, pushedAt 2026-10-09T02:21:05Z). Local `origin` updated to the new URL.
Impact: D16 scope and 39-08 enable record name the old slug; they refer to this same repo (redirect). 39-10 closure should re-read secret-scanning/push-protection state under the new slug. `PA-MATRIX/internjobs-cms` does not exist.

## D24 (2026-10-11): Raj approved connection test of the leaked Neon credential

Raj: "test it". Scope: one read-only `select 1` login attempt with the connection string in Parrot `01-03-SUMMARY.md` (read via `git show origin/main:`), value never printed. Purpose: learn whether the leaked password is still current. No rotation, no writes.
D24 outcome: login SUCCEEDED (`select 1` returned 1). The password committed in Parrot's history is the LIVE `neondb_owner` credential. Rotation is required, and it will break Parrot until Fly's NEON_DATABASE_URL is updated. Not rotated yet.
