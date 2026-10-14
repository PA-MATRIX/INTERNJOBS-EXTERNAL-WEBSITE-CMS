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

1b. GET https://app.internjobs.ai/internal/safety-events with Bearer -> exit 0
```
GET status=200 rows=9 error=null any_row_has_source_id_key=false
```
- No row carries a source_id key (RED as expected).
- Secret source: Infisical CLI returned 403 "project does not belong to your selected organization" (CLI on the wrong org). Per the run rules (Infisical/Fly env), the readback ran inside the Fly machine using its own INTERNAL_API_SECRET env var against the public URL. Value never printed.
