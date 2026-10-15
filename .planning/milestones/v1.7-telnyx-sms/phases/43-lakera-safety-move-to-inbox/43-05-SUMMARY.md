---
phase: 43-lakera-safety-move-to-inbox
plan: 05
subsystem: infra
tags: [production-deploy, fly, wrangler, postgres-migration, readback, uat, lakera, d10-exception]

requires:
  - phase: 43-01
    provides: migration 0015 (safety_events.source_id), source_id end to end, app-tests CI job
  - phase: 43-02
    provides: POST /api/ops/safety/:eventId/move-to-inbox (exact + best-effort match, audit line)
  - phase: 43-03
    provides: /ops/safety Move to Inbox UI, Lakera label, Mark-all fix
  - phase: 43-04
    provides: verify-workspace-quarantine-live.mjs --require-move-control, PR #29, ROLLBACK-43.md, RED baselines
provides:
  - PR #29 merged into main as merge commit 951e103 under a recorded D10 exception (D33)
  - Student app (Fly) release v58 from 951e103, migration 0015 applied in production
  - Workspace Worker internjobs-parrot version f7f6c851-1ee5-451e-9512-81f6ed90be23 from 951e103
  - Before/after readback pairs for every live unit (LIVE-43.md), all GREEN after
  - Production UAT record (UAT-43.md): Raj "approved" / "Tested, it worked"; 5 operator moves by ridhi@internjobs.ai read back from the production DB
affects: [phase-43 verifier, v1.7 audit-milestone, LAKERA-V2-03 tier/quota follow-up, v1.5.1 Trust-sender human_needed item]

tech-stack:
  added: []
  patterns:
    - "Live step guards use an exact whole-line match on the approval file (grep -qx 'A<n>: yes')"
    - "Deploys run from a detached, clean worktree of the merge commit; git rev-parse HEAD is recorded and compared to the merge sha"
    - "Secrets for readbacks come from the Fly machine's own env inside fly ssh, never printed"

key-files:
  created:
    - .planning/milestones/v1.7-telnyx-sms/phases/43-lakera-safety-move-to-inbox/evidence/APPROVAL-43.md
    - .planning/milestones/v1.7-telnyx-sms/phases/43-lakera-safety-move-to-inbox/evidence/LIVE-43.md
    - .planning/milestones/v1.7-telnyx-sms/phases/43-lakera-safety-move-to-inbox/evidence/UAT-43.md
    - .planning/milestones/v1.7-telnyx-sms/phases/43-lakera-safety-move-to-inbox/evidence/43-05-tail.txt
  modified:
    - .planning/milestones/v1.7-telnyx-sms/REQUIREMENTS.md
    - .planning/current-intent.json
    - .planning/STATE.md (gitignored, on disk only)

key-decisions:
  - "D33: Raj 'approve all' (2026-10-14T04:32:56Z) = A1-A5 yes; A6-fly and A6-worker no (no automatic rollback)"
  - "Readback secret taken from the Fly machine env (INTERNAL_API_SECRET) because the Infisical CLI returned 403 (wrong org)"
  - "LAK-05 left Partial: Lakera tier/quota not yet reported by Raj; Trust-sender UAT not evidenced"

patterns-established:
  - "When a tail session expires, prove a UI action from durable state (reviewed_by + distinct reviewed_at timestamps) and state the limits"

duration: ~2 days wall clock (live sequence 04:33Z-04:50Z on 2026-10-14; UAT reply and follow-up after)
completed: 2026-10-14
---

# Phase 43 Plan 05: Production deploy + UAT Summary

**Move to Inbox shipped to production: PR #29 merged (951e103) under a recorded D10 exception, student app Fly v58 with migration 0015 (`safety_events.source_id`), Workspace Worker f7f6c851. Every readback went from RED before to GREEN after. An operator (Ridhi) moved 5 real quarantined emails in production. The Lakera tier/quota check (LAK-05) is still pending from Raj.**

## Performance

- **Approval recorded:** 2026-10-14T04:32:56Z (APPROVAL-43.md)
- **Live sequence:** 2026-10-14T04:33:24Z (guard) to 04:49:54Z (final readbacks)
- **UAT reply:** 2026-10-14T05:23:13Z ("approved"); follow-up 2026-10-15 ~04:00 UTC ("Tested, it worked")
- **Tasks:** 3/3 (Task 1 decision checkpoint, Task 2 live sequence, Task 3 human-verify checkpoint)
- **Production writes in this continuation:** none (docs, requirements and state only)

## Accomplishments

- Merge, migration and both deploys ran in the planned order: Fly and migration first, Worker second. Each step had an approval guard, ran from the merge commit, and was checked by a readback that failed before and passed after.
- No rollback was needed or run (A6-fly: no, A6-worker: no). The rollback targets in ROLLBACK-43.md are still valid: Fly v57 image `deployment-01KSEDZ2SR82VDX9CG292T3ZEC` and Worker `77f32645-e61e-438b-9868-6b44580c3b8d`.
- The production DB shows an operator really used Move to Inbox: 5 Lakera-blocked rows were reviewed by ridhi@internjobs.ai. This also covers UAT checklist item 6 (Ridhi repeats the move).

## Live sequence

| Step | UTC | Action | Guard | Result |
|------|-----|--------|-------|--------|
| 0 | 04:33:24 | Approval guard + CLI auth check | `test -s APPROVAL-43.md` | exit 0; gh, fly, wrangler authenticated; PR #29 CLEAN, 7/7 CI green |
| - | 04:34:49 | Rollback targets re-read | read-only | Fly v57 and Worker 77f32645 unchanged since ROLLBACK-43.md |
| 1 | 04:34:49 | BEFORE readbacks (DB + API) | read-only | column count 0; 0001-0014 applied, only 0015 pending; API rows=9, no `source_id` key |
| 2 | 04:34:54 | `gh pr merge 29 --merge --match-head-commit 7f3b948` | `A1: yes` | merge commit **951e103**; d1658aa and 7f3b948 are both ancestors; diff = 21 planned Phase 43 paths |
| 3 | 04:45:41 | `fly deploy -a internjobs-ai-student-app` from detached 951e103 | `A3: yes` | **release v58** (`deployment-01M4WBP5HXQBWYQP31SVSHZQEH`), healthz ok |
| 4 | 04:47:43 | `node scripts/migrate.mjs` in the Fly machine | `A2: yes` | exactly `migration applied: 0015_v1_7_safety_events_source_id`, 14 skipped |
| 5 | 04:48:00 | Synthetic API row round trip | `A5: yes` | source_id `v1.7-43-readback-1791953286` round trips; marked reviewed by id |
| 6 | 04:48:58 | `npx wrangler deploy` from detached 951e103 (npm ci, typecheck, build exit 0) | `A4: yes` | version **f7f6c851-1ee5-451e-9512-81f6ed90be23** at 100% |
| 7 | 04:49:54 | Worker readbacks | read-only | `--require-move-control` exit 0; v1.5.1 readback exit 0 |
| 8 | - | Rollback | `A6-*: no` | not triggered |
| 9 | - | Secret grep over evidence | - | LIVE/APPROVAL clean; one known false positive (`task-2` in 43-03-green-all.txt) |

## Approvals (APPROVAL-43.md, verbatim reply "approve all")

| Item | Answer |
|------|--------|
| A1 D10 exception: merge PR #29 | yes |
| A2 migration 0015 | yes |
| A3 Fly deploy | yes |
| A4 Worker deploy (full replace) | yes |
| A5 production UAT + synthetic readback row | yes |
| A6-fly auto-rollback | no |
| A6-worker auto-rollback | no |

The approval timestamp (04:32:56Z) comes before the first live log entry (04:33:24Z).

## Readbacks before / after

| Readback | Before (RED) | After (GREEN) |
|----------|--------------|---------------|
| `safety_events.source_id` column count | 0 | 1 |
| `schema_migrations` has 0015 | no | yes |
| GET /internal/safety-events `source_id` key | absent (rows=9) | present (rows=10, synthetic row round trips) |
| `verify-workspace-quarantine-live.mjs --require-move-control` | exit 1 (Move to Inbox label + endpoint missing) | exit 0 |
| `verify-workspace-quarantine-live.mjs` (v1.5.1, incl. parrot-token) | exit 0 | exit 0 |
| Fly release | v57 | v58 |
| Worker active version | 77f32645-e61e-438b-9868-6b44580c3b8d | f7f6c851-1ee5-451e-9512-81f6ed90be23 |
| Deploy sha | - | 951e103468ad8c224e3740f99cc4ed9833c865ac == merge sha |

## UAT result (as recorded in UAT-43.md)

- **Raj's reply (2026-10-14T05:23:13Z), verbatim:** "approved". No per-step pass/fail, Lakera tier/quota or Ridhi result came with it. At that point the filtered tail had captured zero `ops_safety*` events.
- **Raj's follow-up (2026-10-15 ~04:00 UTC):** "Tested, it worked". On the Lakera tier: "I'll check and tell you".
- **Why the tail is empty:** the `wrangler tail` session started at 2026-10-14T04:50Z had ended before the test. Its empty output (`43-05-tail.txt` holds only the header) is therefore NOT evidence that nobody pressed the button. It is also not evidence of the audit line. The plan truth "the tail shows one event=ops_safety_move_to_inbox" is **not met by capture**.
- **Production read-only evidence** (student DB via `fly ssh console`, no secrets printed):
  - `ridhi@internjobs.ai` reviewed 5 rows between 2026-10-15 03:58:14 and 03:58:18 UTC. All are `email/blocked/lakera_flagged` rows created 2026-10-09 to 10-13 with `source_id` null, so they are pre-fix rows on the D32 best-effort match path.
  - `v1.7-43-readback` has 1 row (the A5 synthetic row).
- **Why this proves Move to Inbox:** the deployed route (`apps/parrot/workers/routes/ops-safety.ts` at 951e103, lines ~207-216) sets reviewed_by to the operator's email only for the outcomes `moved` and `already_in_inbox`. "Mark all reviewed" is a single UPDATE with one timestamp, so 5 distinct timestamps across 4 s mean 5 separate successful move calls by an operator, on her own real quarantined mail.
- **Not evidenced:**
  - which of the 5 calls returned `moved` and which returned `already_in_inbox`;
  - the "Not found — check Spam" path in production;
  - Mark-all-then-reload persistence in production (covered by tests in 43-03 plus Raj's general "it worked");
  - a new post-fix flagged email (no row with `source_id` has been created since the deploy, so the exact-match path is proven only by tests and the A5 readback);
  - the Trust-sender bonus;
  - the audit line in a live tail.
- **Lakera tier/quota (LAK-05, LAKERA-V2-03):** PENDING from Raj.

## Requirements

- LAK-01..LAK-04: ticked and marked Complete. The code paths were verified in 43-01..43-04 and production use is evidenced as described above.
- LAK-05: **left unticked**, traceability "Partial — readbacks GREEN + UAT done; Lakera tier/quota pending (Raj)". The LAK-05 requirement text also names the Trust-sender UAT, which is not evidenced (the plan treats it as a non-blocking bonus). The v1.5.1 Trust-sender human_needed item therefore stays open.

## Task Commits

1. **Task 1: approval (checkpoint:decision)** - `c0d58fc` (record Raj's approval, D33)
2. **Task 2: live sequence** - `1c52643` (steps 0-1 RED baselines), `0c2858d` (step 2 merge), `71960ff` (full live log), `fb9067a` (position at Task 3)
3. **Task 3: UAT (checkpoint:human-verify)** - `e61739e` (Raj's reply verbatim), `efcdaa2` (production DB evidence of Ridhi's 5 moves)

**Plan metadata:** this SUMMARY + REQUIREMENTS + current-intent commit on docs/v1.7-telnyx-sms.

## Files Created/Modified

- `evidence/APPROVAL-43.md`: Raj's approval, mapped line by line
- `evidence/LIVE-43.md`: ordered live log with commands (secrets redacted), exit codes and readbacks
- `evidence/UAT-43.md`: UAT reply, follow-up, production DB evidence and its limits
- `evidence/43-05-tail.txt`: filtered tail header only (session expired before the test)
- `.planning/milestones/v1.7-telnyx-sms/REQUIREMENTS.md`: LAK-01..04 Complete, LAK-05 Partial
- `.planning/current-intent.json`: position updated
- `.planning/STATE.md`: position updated (gitignored)

## Decisions Made

- D33 (recorded in Task 1): "approve all", A6 no for both units.
- The readback secret came from the Fly machine's own env inside `fly ssh` instead of from Infisical (see Issues).

## Deviations from Plan

**1. [Rule 3 - Blocking] Readback secret sourced from the Fly machine env, not Infisical**
- **Found during:** Task 2, step 1b
- **Issue:** the Infisical CLI returned 403 "project does not belong to your selected organization" (the CLI is logged in to the wrong org).
- **Fix:** ran the API readback inside the Fly machine using its own `INTERNAL_API_SECRET` against the public URL. The value was never printed.
- **Verification:** GET status 200 before and after; evidence is booleans and counts only.

**2. [Observation] No CI run on main after the merge**
- `ci.yml` triggers only on `pull_request` (main, integration/**) and on push to integration/**, so pushing the merge to main started no run. PR #29's 7/7 green checks ran against base d1658aa, and main had not moved, so the tested merge tree equals 951e103.

**3. [Gap] Audit-line tail capture missed**
- The plan expected a captured `ops_safety_move_to_inbox` line. The tail session ended before the UAT, so durable DB state stood in as evidence (see UAT result). The audit line itself is still unobserved in production.

**4. Deploy worktree removed after the run**
- `/Users/rajren/internjobs-cms-wt-43-deploy` was clean (0 porcelain lines) and was removed with `git worktree remove` (no `--force`). `/Users/rajren/internjobs-cms-wt-43` (fix branch, 7f3b948) is left in place.

## Rulings

None - no plan conflicts arose.

## Issues Encountered

- Infisical CLI org mismatch (403). Raj should switch the CLI to the Projecta org (project `26995afd...`) before the next live plan.
- The synthetic readback row (`reason v1.7-43-readback`, channel unknown, action passed, reviewed) stays in production `safety_events`, as approved in A5.

## User Setup Required

- Raj: report the Lakera plan/tier and monthly quota (LAK-05 / LAKERA-V2-03).
- Optional: run the Trust-sender UAT with a throwaway sender to close the v1.5.1 human_needed item.

## Next Phase Readiness

- Phase 43 plans 5/5 executed; next is the rrr-verifier pass on 43-05, then the phase verifier.
- Phase 43 cannot be called fully complete until LAK-05's Lakera tier/quota is recorded.
- Rollback targets remain on record in ROLLBACK-43.md.

---
*Phase: 43-lakera-safety-move-to-inbox*
*Completed: 2026-10-14 (UAT follow-up 2026-10-15 UTC)*
