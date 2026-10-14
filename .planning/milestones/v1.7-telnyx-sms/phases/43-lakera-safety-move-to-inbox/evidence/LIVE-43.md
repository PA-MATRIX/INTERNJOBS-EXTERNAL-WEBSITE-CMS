# LIVE-43: Phase 43 production sequence log

Plan 43-05 Task 2. Approval: APPROVAL-43.md timestamp 2026-10-14T04:32:56Z (A1-A5 yes, A6-fly no, A6-worker no).
Secrets are never printed; commands below are shown with secrets redacted.

## Step 0: guard and auth (2026-10-14T04:33:24Z)
- `test -s $EVID/APPROVAL-43.md` -> exit 0 (guard0 ok)
- gh: logged in (growthpods); fly: rraj@growthpods.io; wrangler: OAuth rentalaraj@gmail.com; infisical 0.43.49
- PR #29: OPEN, head 7f3b948c073ebc8a20c52c7913a77bac0898d05f, MERGEABLE/CLEAN, 7/7 checks SUCCESS

## Rollback targets re-read (2026-10-14T04:34:49Z)
- `fly releases -a internjobs-ai-student-app --image`: current v57, image deployment-01KSEDZ2SR82VDX9CG292T3ZEC (unchanged vs ROLLBACK-43.md); machines 178124d6a46089 started v57, e78450d0a40183 stopped v57
- `npx wrangler deployments list`: active (100%) 77f32645-e61e-438b-9868-6b44580c3b8d, created 2026-10-09T02:18:06Z (unchanged)

## Step 1: BEFORE readbacks (RED, read-only) (2026-10-14T04:34:49Z)
1a. `fly ssh console -a internjobs-ai-student-app -C "sh -c '... node /app/rb.mjs'"` (machine's own DATABASE_URL, never printed) -> exit 0
```
source_id_column_count=0
schema_migrations=0001_waitlist_foundation,0002_waitlist_threads_and_enrichment,0003b_email_inbound,0003_v1_2_startup_identity,0004_v1_2_mastra_agent_core,0005_v1_2_workers_ai_embeddings,0007_v1_2_linkedin_profiles,0008_v1_2_pairing_sessions,0009_v1_3_safety_events,0010_brightdata_linkedin_default,0011_v1_4_startup_mcp,0012_v1_4_startup_mark,0013_v1_4_startup_agent_email,0014_v1_4_telnyx_touchbase
```
- source_id column count = **0** (RED as expected)
- schema_migrations: all 14 files 0001..0014 in the merge-candidate tree are applied (incl. 0013, 0014). Only **0015_v1_7_safety_events_source_id** is pending. No unexpected pending migration -> proceed.

1b. GET https://app.internjobs.ai/internal/safety-events with the internal API secret (bearer auth) -> exit 0
```
GET status=200 rows=9 error=null any_row_has_source_id_key=false
```
- No row carries a source_id key (RED as expected).
- Secret source: Infisical CLI returned 403 "project does not belong to your selected organization" (CLI on the wrong org). Per the run rules (Infisical/Fly env), the readback ran inside the Fly machine using its own INTERNAL_API_SECRET env var against the public URL. Value never printed.

## Step 2: A1 merge (2026-10-14T04:34:54Z)
- Guard: `grep -qx "A1: yes" $EVID/APPROVAL-43.md` -> exit 0
- Before: PR #29 OPEN, head 7f3b948c073ebc8a20c52c7913a77bac0898d05f, CLEAN, 7/7 CI SUCCESS; origin/main = d1658aa
- Action: `gh pr merge 29 -R PA-MATRIX/INTERNJOBS-EXTERNAL-WEBSITE-CMS --merge --match-head-commit 7f3b948...` -> exit 0
- After: PR MERGED 2026-10-14T04:34:58Z, **merge commit 951e103468ad8c224e3740f99cc4ed9833c865ac**, parents d1658aa5ba0c... and 7f3b948c073e... (merge commit, not squash); origin/main = 951e103
- `git merge-base --is-ancestor d1658aa 951e103` -> yes; `... 7f3b948 951e103` -> yes
- Deploy worktree: `git worktree add --detach /Users/rajren/internjobs-cms-wt-43-deploy 951e103` -> HEAD 951e103, clean (0 porcelain lines)
- `git diff --stat d1658aa..951e103`: 21 files, all planned Phase 43 paths (.github/workflows/ci.yml [43-01/43-04], apps/app/db/migrations/0015, apps/app/{package.json,src/server.mjs,src/safety/events-api*.mjs}, apps/parrot/{app/components/SafetyMoveCell.tsx,app/lib/safety-log.ts,app/routes/ops.safety.tsx,vitest.config.ts,workers/durableObject/index.ts,workers/lib/{mailbox-lookup,safety-move}.ts,workers/routes/ops-safety.ts,workers/tests/...}, scripts/verify-workspace-quarantine-live{,.test}.mjs)
- Post-merge CI: ci.yml triggers only on pull_request (main, integration/**) and push to integration/**, so no run exists for a push to main. PR CI ran against base d1658aa (main unchanged since), so the CI-tested merge equals 951e103's tree.

## Step 3: A3 Fly deploy (2026-10-14T04:45:41Z)
- Guard: `grep -qx "A3: yes" $EVID/APPROVAL-43.md` -> exit 0
- Before: release v57 (image deployment-01KSEDZ2SR82VDX9CG292T3ZEC); `curl https://app.internjobs.ai/healthz` -> ok:true, service internjobs-app
- Action: `cd /Users/rajren/internjobs-cms-wt-43-deploy/apps/app && fly deploy -a internjobs-ai-student-app` (git rev-parse HEAD = 951e103468ad8c224e3740f99cc4ed9833c865ac) -> exit 0; machine 178124d6a46089 passed smoke + health checks; e78450d0a40183 good (stopped, as before)
- After: **release v58** complete, image `registry.fly.io/internjobs-ai-student-app:deployment-01M4WBP5HXQBWYQP31SVSHZQEH`; both machines on version 58; `curl https://app.internjobs.ai/healthz` -> `{"ok":true,"service":"internjobs-app",...,"mastraReady":true,"pgvectorReady":true,...}`

## Step 4: A2 migration 0015 (2026-10-14T04:47:43Z)
- Guard: `grep -qx "A2: yes" $EVID/APPROVAL-43.md` -> exit 0
- Before (RED, step 1a): source_id_column_count=0; 0015 not in schema_migrations
- Action: `fly ssh console -a internjobs-ai-student-app -C "sh -c 'cd /app && node scripts/migrate.mjs'"` -> exit 0
```
migration skipped: 0001_waitlist_foundation
migration skipped: 0002_waitlist_threads_and_enrichment
migration skipped: 0003_v1_2_startup_identity
migration skipped: 0003b_email_inbound
migration skipped: 0004_v1_2_mastra_agent_core
migration skipped: 0005_v1_2_workers_ai_embeddings
migration skipped: 0007_v1_2_linkedin_profiles
migration skipped: 0008_v1_2_pairing_sessions
migration skipped: 0009_v1_3_safety_events
migration skipped: 0010_brightdata_linkedin_default
migration skipped: 0011_v1_4_startup_mcp
migration skipped: 0012_v1_4_startup_mark
migration skipped: 0013_v1_4_startup_agent_email
migration skipped: 0014_v1_4_telnyx_touchbase
migration applied: 0015_v1_7_safety_events_source_id
```
- Exactly one migration applied (0015); all 14 others skipped.
- After (GREEN):
```
source_id_column_count=1
schema_migrations=0001_waitlist_foundation,0002_waitlist_threads_and_enrichment,0003b_email_inbound,0003_v1_2_startup_identity,0004_v1_2_mastra_agent_core,0005_v1_2_workers_ai_embeddings,0007_v1_2_linkedin_profiles,0008_v1_2_pairing_sessions,0009_v1_3_safety_events,0010_brightdata_linkedin_default,0011_v1_4_startup_mcp,0012_v1_4_startup_mark,0013_v1_4_startup_agent_email,0014_v1_4_telnyx_touchbase,0015_v1_7_safety_events_source_id
```
- source_id column count **0 -> 1**; schema_migrations now lists 0015_v1_7_safety_events_source_id.

## Step 5: A5 synthetic API readback (2026-10-14T04:48:00Z)
- Guard: `grep -qx "A5: yes" $EVID/APPROVAL-43.md` -> exit 0
- Before (RED, step 1b): GET rows=9, any_row_has_source_id_key=false
- Action + After (inside Fly machine, machine env INTERNAL_API_SECRET, never printed; public URL https://app.internjobs.ai/internal/safety-events):
```
POST status=200 source_id=v1.7-43-readback-1791953286
GET status=200 synthetic_row_found_with_same_source_id=true
mark-reviewed(ids=[synthetic row]) status=200
synthetic_row_reviewed=true
GET status=200 rows=10 error=null any_row_has_source_id_key=true
```
- Synthetic row {channel:'unknown', action:'passed', reason:'v1.7-43-readback', source_id:'v1.7-43-readback-1791953286'} returned with the same source_id: **true**; marked reviewed by id only (not mark-all): **true**.

## Step 6: A4 Worker deploy (2026-10-14T04:48:21Z)
- Guard: `grep -qx "A4: yes" $EVID/APPROVAL-43.md` -> exit 0
- Before: `npx wrangler deployments list` -> active (100%) 77f32645-e61e-438b-9868-6b44580c3b8d
- Before: `node scripts/verify-workspace-quarantine-live.mjs --require-move-control` -> exit **1**
```
present: parrot-token (Phase 32)
routes/ops.safety closure: 6 files
FAIL: missing in served routes/ops.safety chunk: Move to Inbox label
FAIL: missing in served routes/ops.safety chunk: move-to-inbox endpoint
RED https://workspace.internjobs.ai
```
- Before: `node scripts/verify-workspace-quarantine-live.mjs` -> exit **0**
```
present: Spam-folder reference (folder=spam)
present: parrot-token (Phase 32)
GREEN https://workspace.internjobs.ai
```
- Action (from detached /Users/rajren/internjobs-cms-wt-43-deploy/apps/parrot): `git rev-parse HEAD` = **951e103468ad8c224e3740f99cc4ed9833c865ac** (== merge sha); `npm ci` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0 (worktree still clean); `npx wrangler deploy` at 2026-10-14T04:48:58Z exit 0 ("Uploaded internjobs-parrot", triggers workspace.internjobs.ai custom domain + cron */5)
- After: Current Version ID **f7f6c851-1ee5-451e-9512-81f6ed90be23**; `npx wrangler deployments list`:
```
Version(s):  (100%) f7f6c851-1ee5-451e-9512-81f6ed90be23
                 Created:  2026-10-14T04:49:04.753Z
```
  Active version no longer 77f32645 -> GREEN.

## Step 7: Worker readbacks (2026-10-14T04:49:54Z)
- `node scripts/verify-workspace-quarantine-live.mjs --require-move-control` -> exit **0** (was 1)
```
inbox closure: 9 files; root closure: 7 files
present: Trust sender
present: trust-sender
present: Spam-folder reference (folder=spam)
present: parrot-token (Phase 32)
routes/ops.safety closure: 6 files
present: Move to Inbox label
present: move-to-inbox endpoint
GREEN https://workspace.internjobs.ai
```
- `node scripts/verify-workspace-quarantine-live.mjs` -> exit **0** (v1.5.1 non-regression incl. parrot-token, GREEN before and after)
```
inbox closure: 9 files; root closure: 7 files
present: Trust sender
present: trust-sender
present: Spam-folder reference (folder=spam)
present: parrot-token (Phase 32)
GREEN https://workspace.internjobs.ai
```

## Step 8: rollback
- Not triggered: every step 3-7 readback passed. A6-fly: no / A6-worker: no were not exercised. Rollback targets in ROLLBACK-43.md untouched (v57 image; Worker 77f32645).

## Summary pairs
| Readback | Before | After |
|----------|--------|-------|
| safety_events.source_id column count | 0 | 1 |
| schema_migrations has 0015 | no | yes |
| GET /internal/safety-events source_id key | absent | present (synthetic row round-trips) |
| --require-move-control | exit 1 RED | exit 0 GREEN |
| v1.5.1 readback | exit 0 GREEN | exit 0 GREEN |
| Fly release | v57 | v58 (deployment-01M4WBP5HXQBWYQP31SVSHZQEH) |
| Worker version | 77f32645-e61e-438b-9868-6b44580c3b8d | f7f6c851-1ee5-451e-9512-81f6ed90be23 |
| Deploy sha | - | 951e103468ad8c224e3740f99cc4ed9833c865ac (merge commit of PR #29) |

## Step 9: secret grep
- `grep -nE "Bearer |postgres(ql)?://|sk-[A-Za-z0-9]|eyJ" $EVID/*` -> one hit outside this plan's files: 43-03-green-all.txt line 1, where `task-2` matches `sk-[A-Za-z0-9]` (false positive in prose, no secret; file committed by 43-03). LIVE-43.md and APPROVAL-43.md are clean.
