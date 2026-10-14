# v1.7 Carry-over inventory: pending items from earlier milestones

**Compiled:** 2026-10-13 (read-only Explore audit, D30: "check on what was pending from previous milestones ... that is carried over here").
**Method:** ROADMAP/REQUIREMENTS/PROJECT/MILESTONES, every AUDIT/VERIFICATION under `.planning/milestones/`, the v1.6 CONTEXT, deferred-ops runbooks, debug sessions, and the v1.5.1 patch branch. Items later closed were excluded.
**Disposition:** decided per item when v1.7's roadmap is set. "→ v1.7" marks items proposed for this milestone. Others stay with their owning milestone (v1.6 paused) or the backlog.

## A. Security (highest priority)

| # | Item | Origin | Pending | Evidence | Proposed |
|---|------|--------|---------|----------|----------|
| 1 | Leaked LIVE Neon `neondb_owner` password (Parrot project wild-firefly-34837743) | v1.6 P39-04, D24 | Not rotated. Rotation breaks Parrot until Fly `NEON_DATABASE_URL` is updated | v1.6 CONTEXT D21–D24 | → v1.7 (security phase, approval-gated) |
| 2 | D22 rotation never executed | v1.6 P39-04 | Needs plan, checker and Raj's approval | v1.6 CONTEXT D22 | → v1.7 with #1 |
| 3 | Audit-webhook X-API-Key, probably live (Parrot `server/routes/contacts.js`) | v1.6 P39-04 | Issuing service and admin access unknown | v1.6 CONTEXT D21 outcome | → v1.7 with #1 (needs Raj: who issues it) |
| 4 | Remove 3 secret literals from the Parrot tree | v1.6 P39-04 | A separate approved Parrot change | v1.6 CONTEXT D22 | → v1.7 with #1 |
| 5 | 39-04 scan incomplete (Parrot worktree edits and dangling commit 1d577ffb unscanned) | v1.6 P39-04 | Re-scan after rotation | 39-04-SUMMARY.md | v1.6 (on resume) |
| 6 | Website repo secret-scanning alert #1 (Stripe-looking, almost certainly a test fixture) | v1.6 P39-08 | Alert open, not dismissed | v1.6 CONTEXT D21/D22 | v1.6 39-10 |
| 7 | SEC-ROTATE-ALL (Clerk x2, CF Email, CF AI, broad CF; plus the Clerk key pasted in chat in v1.1) | v1.3 P21 | Deferred; runbook exists | ROADMAP v1.5 candidates; v1.3 RUNBOOK | backlog (Raj to decide) |

## B. v1.6 (paused) — resumes after v1.7

39-10 closure (re-read scanning under the new repo slug); Phases 40–42 (SEC-04, SPLIT, GH, LOCAL); the public repo still exposes `.planning/` and infra docs; the D10 freeze vs shipping v1.7 (needs a recorded exception); D19 (the platform repo will be private with process-only protection); `docs/phase-38-code-map` and `docs/patch-v1.5.1-workspace-deploy` pushed with no PR; untracked `.planning/subagent-runs*`; the local Parrot clone's broken ref `refs/heads/main 2`; legacy `growthpods/Internjobs` (4 files plus `.env.local` → Infisical before archive).

## C. v1.5 accepted gaps and the v1.5.1 patch

| # | Item | Pending | Proposed |
|---|------|---------|----------|
| 17 | Phase 34 Telnyx SMS + Voice AI for startups (22 deferred ops steps) | Not started; old Telnyx key dead | Out of v1.7 scope (could share v1.7's Telnyx account / 10DLC brand) |
| 18 | Phase 35 first live pilot install (STARTUP-PILOT-LIVE-01) | No real founder use yet | backlog |
| 19 | Phase 32 icon licence (`parrot-icon.png` resembles a Shutterstock image) | Nithin to confirm | backlog (legal) |
| 20 | Phase 32 live ringtone/chime/call audio, Clerk under CSP, JWKS `kid` | Never heard or checked live | human UAT |
| 21 | Phase 33 gmail-signup rejection, live | No proof | human UAT |
| 22 | Phase 33 records (33-05/33-07 SUMMARY missing; phantom "33-08") | docs | docs cleanup |
| 24 | Stale docs after Clerk webhook → Restrictions; startups vs employers domain | docs | docs cleanup |
| 25 | Operator fallback email (`nithin@growthpods.io`; code default `rentalaraj@gmail.com`, `apps/email-worker/src/index.js:56`) | Raj to confirm | Raj decision |
| 26 | CI does not run `apps/app/src/safety/screen.test.mjs` | Still true | → v1.7 (student Lakera screen stays on the Telnyx path, SMS-04) |
| 28 | Integration-checker / literal audit-milestone never run on v1.5 | — | accepted / backlog |
| 29 | v1.5.1 Trust-sender UAT on the production deploy from main | human_needed | → v1.7 Phase 43 (Lakera) |
| 30 | OPS-SAFETY-MOVE: "Move to Inbox" from `/ops/safety` | D30 | → v1.7 Phase 43 (first) |

(Gap 3, no RED evidence in v1.5 summaries, is accepted historically. Gap 7, deploy sync, is mostly closed by v1.5.1.)

## D. Earlier carry-overs (v1.0–v1.4)

| # | Item | Proposed |
|---|------|----------|
| 31 | Lakera tier/quota confirmation (LAKERA-V2-03), Raj dashboard sign-in | → v1.7 Phase 43 (Lakera), Raj action |
| 32 | LAKERA-VERIFY-LIVE-03 live fail-open test (accepted gap) | accepted |
| 33 | INTEG-01-PROD-RUN two-sided smoke in prod | → v1.7 (student leg redone over Telnyx after cutover) |
| 34–35 | MAC-BRIDGE-ALERTING, mac-bridge HA | superseded (DECOM-01) |
| 36 | SAFETY-HARD-BLOCK-EXPAND-01 / SAFETY-OUTBOUND-01 | backlog (pilot-data gated) |
| 37 | Phase 26 GIF / A-B / confetti browser check | human UAT backlog |
| 38 | Phase 27 Daily theme / star persistence visual check | human UAT backlog |
| 39 | v1.2 browser push end-to-end, onboarding wizard; dead null check means AI Gateway 429 never audited (`durableObject/index.ts:1075`) | backlog (low) |
| 40 | Mattermost PAT periodic rotation | backlog (low) |
| 41 | `apps/parrot` `npm run dev` fails (react-router-dom → react-router esbuild errors) | → v1.7 Phase 43 if it blocks local testing |
| 42 | AGENTIC-INBOX-TESTS (no tests) | backlog |
| 43 | pg SSL-mode warning; Cognee/Bright Data activation runbook | backlog (low) |
| 44 | Demand/scale-gated candidates (DAILY-VANITY, STARTUP channels, STORAGE-02/03, EMAIL-04, etc.) | backlog. TELNYX-ADAPT/MIGRATE/SUNSET superseded by v1.7 |

## E. Stale docs (shipped work still shown open)

v1.4 requirement boxes and traceability still "Pending"; ROADMAP Phase 30/31 rows; PROJECT Active lists shipped v1.5 W1/S1, and Context still says Neon/Photon/iMessage; top-level `HANDOFF.md` (2026-05-20) is stale; the STATE blocker "Parrot 664 commits behind" was fixed by D12. → v1.7 docs-hygiene plan.

## Closed (verified, excluded above)

v1.0 provider activation (closed v1.1); v1.2 DAILY_API_KEY and `/healthz ok`; v1.3 CLOSETODO/SAFETY-VERIFY/NEONEX (verified v1.4); v1.4 Phase 31 UAT; v1.5 Phase 36 human_needed (passed 2026-07-17); v1.6 39-07 probe (D17a); all 4 `.planning/debug/` sessions resolved or mitigated.
