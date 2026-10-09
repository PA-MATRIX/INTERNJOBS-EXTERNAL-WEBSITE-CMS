---
status: decided
decided_by: Raj
decided_at: 2026-10-09T05:32:12Z
option: accept-unprotected
orgs: [PA-MATRIX]
---

# SEC-03 decision: how does the private platform repo get a protected `main`?

DECIDED (D19, 2026-10-09T05:32:12Z): **accept-unprotected**. Raj accepts a private platform repo under PA-MATRIX with no branch protection, no rulesets and no secret scanning.

**Disclosure: this means NO enforcement on the platform `main`.** Protection there is a process rule only (as in D10); any seat with write access can push straight to `main`. Nothing is bought, flipped or changed by Phase 39.

## Facts (sources by file name)

Measured (39-05-state-snapshot.json, 39-05-LIMITS.md):
- Private repos on the Free plan return HTTP 403 "Upgrade to GitHub Pro or make this repository public to enable this feature." for branch protection and rulesets, with `admin: true` (PA-Ai-Team/Parrot, growthpods/Internjobs, 9 PA-MATRIX private repos). Plan limit, not permission.
- Secret-scanning alerts API on private repos: 404 "Secret scanning is disabled on this repository."
- PA-MATRIX and PA-Ai-Team are both on Free. PA-Ai-Team has 26 private repos, 0 public; Parrot lives there. growthpods plan is not reported by the API and behaves as Free.

Probe (39-07-PROBE-RECORD.json, accepted as PARTIAL in CONTEXT.md D17a):
- Measured: protection PUT and GET 200 while public; GET protection 403 (same upgrade message) right after flipping to private.
- NOT measured: push to `main` after the flip (clone failed 403 "Repository ... is disabled", cause unknown). Probe repo deleted (final GET 404).
- Therefore "protection survives going private" is UNPROVEN AND UNLIKELY (docs C1 plus that 403). It is not a measured fact and must not be relied on.

Prices (39-06-SEC03-RESEARCH.md, fetched 2026-10-08; 39-05-LIMITS.md, 2026-10-09 UTC):
- Team: $4 per user/month "for the first 12 months" (C5); the rate afterwards is NOT verified.
- Secret Protection: $19 per active committer/month, from a doc example (C4) and https://github.com/security/plans.
- The free secret risk assessment is Team/Enterprise only (C6). Secret scanning on org private repos needs Secret Protection on Team/Enterprise (C7).
- Arithmetic (PA-MATRIX, 4 seats): 4 x $4 = $16/month Team; plus 4 x $19 = $76 Secret Protection; upper bound about $92/month. PA-Ai-Team seat count was not captured (seats x $4). Re-check prices at decision time.

CI-only enforcement cannot block a direct push to `main`; any seat with write access can push straight to `main` and skip every check.

## Consequences by repo

- Platform repo: must be private (by design). Protected `main` there is only possible on a paid plan.
- Website repo (PA-MATRIX/internjobs-marketing-website): stays public; keeps protection and the integration ruleset (measured 200).
- Visibility unchanged so far: 39-09-visibility-current.json vs the Phase 38 snapshot.

## Decision and consequences

- Option chosen: accept-unprotected for the platform repo (PA-MATRIX). No upgrade, no alternative mechanism in this milestone.
- Evidence it rests on: measured 403s on private Free repos (39-05); probe PARTIAL per D17a, so "protection survives going private" is UNPROVEN AND UNLIKELY; prices with dates above (39-06, fetched 2026-10-08; 39-05, 2026-10-09).
- Website repo: stays public and protected (PR + 4 required checks, integration/** ruleset), secret scanning + push protection per D18.
- Phase 40: build the platform repo locally; push nothing to GitHub.
- Phase 41: create the platform repo private, tighten collaborator write access, record the unprotected state in the closure; no purchase.

## Revisit trigger (PROPOSED, awaiting Raj's confirmation)

Proposed by Claude, not yet confirmed by Raj: revisit upgrade-team before adding any non-admin collaborator with write access, or at Phase 42 closure, whichever comes first. Raj may change it.
