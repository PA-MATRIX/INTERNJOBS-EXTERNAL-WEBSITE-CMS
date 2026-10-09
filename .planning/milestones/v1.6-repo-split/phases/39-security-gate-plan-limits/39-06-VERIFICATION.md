---
phase: 39-security-gate-plan-limits
plan: 06
verified: 2026-10-08T00:00:00Z
status: passed
score: 4/4 must-have truths verified
gaps: []
advisories:
  - "C4 says 'the pricing page itself does not list a Secret Protection line'. github.com/pricing does list a 'GitHub Secret Protection' feature group with 'Push protection - Public repositories' and 'Secret scanning - Public repositories' (no price). It is not a price line, but it is evidence toward C3 that the record omits. C3 correctly stays ASSUMED; 39-08 should cite this and still read back."
  - "C5 post-12-month Team rate correctly flagged unverified; footnote not extracted."
  - "C1 is VERIFIED-API from 39-RESEARCH Q2; 39-05-state-snapshot.json (22 '403' hits) now exists and could be cited as the primary source."
---

# Plan 39-06 Verification

## Architectural Context Loaded
- No .planning/NORTH-STAR.md. Locked sources: CLAUDE.md global (RRR, TDD RED before GREEN). Nothing in it contradicts the findings.

## Truths
| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | verifier exit 1 on skeleton, 0 after fetch; stale date/dropped URL/ASSUMED bite | VERIFIED | Live run exit 0 (RESEARCH OK). RED-live.txt = 24 failures, mtime 23:42:23, before GREEN-live.txt 23:43:31 (RED captured first). Scratchpad mutations: drop C3 URL -> exit 1 "C3: no https source URL"; C5 date 2026-01-01 -> exit 1 "earlier than floor"; delete C6 row -> exit 1 "claim row missing". |
| 2 | Price rows need `$` | VERIFIED | Strip `$` from C4 -> exit 1 "price row has no $ amount". Figures match live pages (below). |
| 3 | upgrade + alternative sections; CI-only sentence required | VERIFIED | Both headings present; removing the sentence -> exit 1. |
| 4 | C2, C3, C6 closed or carried, none unmarked | VERIFIED | C6 VERIFIED-DOC; C2 ASSUMED resolved_by 39-07; C3 ASSUMED resolved_by 39-05. |

## Independent re-fetch (curl GET, 2026-10-08, all HTTP 200; 7 pages, plan required 4)
- C1 about-protected-branches: "Protected branches are available in public repositories with GitHub Free and GitHub Free for organizations." Confirmed.
- C4 estimating-price: "based on active committers in the last 90 days for the selected repositories ... per-committer rate (for example, $19 per active committer)". Confirmed as a doc example; "per month" is the record's gloss (not in the quoted sentence), acceptable.
- C5 pricing: "$ 4 USD per user/month for the first 12 months *"; Free $0 forever; Enterprise $21. Confirmed; footnote caveat honest.
- C6 assess-your-secret-risk: "Free for organizations on GitHub Team and GitHub Enterprise"; once per 90 days. Confirmed (not Free-plan).
- C7 about-secret-scanning: "Organization-owned private ... repositories: Available with GitHub Secret Protection enabled on GitHub Team or GitHub Enterprise Cloud"; public "runs automatically for free". Confirmed.
- C3 about-push-protection: repo-level push protection "Requires GitHub Secret Protection to be enabled", "disabled by default"; user push protection default-on. Record's reading accurate; ASSUMED is right (see advisory).
- C2 setting-repository-visibility: no branch-protection/ruleset statement found. ASSUMED is right.
- ASSUMED items wrongly stated as verified: none. Unsupported claims: none.

## Evidence method
curl GET of public pages into scratchpad is acceptable: same URLs, read-only, dated, quoted lines reproducible (I reproduced them). WebFetch gives nothing more here. Deviation was disclosed in the SUMMARY. Caveat: the page text is SSR/embedded JSON, so extracting footnotes needs care (hence C5 footnote gap, honestly flagged).

## Hygiene
- No GitHub API/gh in the plan: no 39-06 gh-log, record cites none; research only HTTP GET of public docs.
- Commits 1f0f90d (3 files in phase dir) and ef2af41 (SUMMARY only): no STATE.md, CONTEXT.md, or runtime files. Working-tree untracked files (.subagent-runs*, canary-monitor, 39-04-gh-log.tsv) are not staged and not from this plan.
- Nothing pushed (branch ahead 41 of origin).
- lint-plan-truths --require-spec: exit 0, 10 plans clean.
- SUMMARY RED-before-GREEN present. Single commit holds both artefacts, so ordering is shown by mtimes and file content rather than git history.
- Cost arithmetic ($16, $76, $92) is correct and labelled as arithmetic.

Verifier: Claude (rrr-verifier). Not committed.
