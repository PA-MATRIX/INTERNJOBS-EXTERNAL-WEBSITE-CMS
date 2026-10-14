# ROLLBACK-43: rollback targets for the Phase 43 deploy

Captured 2026-10-14T04:02Z by the 43-04 executor. Every source below is a read-only metadata
call (`fly releases --image`, `fly image show`, `fly status`, `npx wrangler deployments list`).
Nothing was deployed, rolled back or migrated. No secrets were printed.

Plan 43-05 must re-read both sources just before it deploys. If either target has moved since this
capture, update this file first.

## 1. Student app (Fly): `internjobs-ai-student-app`

Captured with `fly releases -a internjobs-ai-student-app --image`, `fly image show` and `fly status`:

| Field | Value |
|-------|-------|
| Current release | **v57** (complete, 2026-05-25 02:04 UTC, by rraj@growthpods.io) |
| Image | `registry.fly.io/internjobs-ai-student-app:deployment-01KSEDZ2SR82VDX9CG292T3ZEC` |
| Digest | `sha256:8d8432a40c3bbf6bb7355ba5e7c52691a78ab91b19443ee7979d31ff920de8e6` |
| Machines | 178124d6a46089 (started, v57), e78450d0a40183 (stopped, v57), region ord |
| Previous release | v56, `deployment-01KSEDMFY7FJDKY1EBBXEYVT62` |

**Rollback target: v57's image.** If the Phase 43 deploy goes bad, roll back with:

```bash
fly deploy -a internjobs-ai-student-app \
  --image registry.fly.io/internjobs-ai-student-app:deployment-01KSEDZ2SR82VDX9CG292T3ZEC
```

`fly releases rollback` is not available in every flyctl version. The pinned-image redeploy above is
the reliable form. Afterwards, `fly image show -a internjobs-ai-student-app` must show the digest above.

**Concern for 43-05.** The live student app is v57 from **2026-05-25**. `origin/main` changed `apps/app`
after that date, most recently on 2026-06-10 (b1be2e8; also 5f76b1c with migration 0014 for Phase 29,
and bc33973 with migration 0013). That means a deploy from main ships more than Phase 43. Before
deploying, 43-05 should confirm which migrations are applied, then read and record that list.

## 2. Workspace Worker (Cloudflare): `internjobs-parrot`

Captured with `cd apps/parrot && npx wrangler deployments list`:

| Field | Value |
|-------|-------|
| Active version (100%) | **`77f32645-e61e-438b-9868-6b44580c3b8d`** |
| Deployed | 2026-10-09T02:18:06Z, by rentalaraj@gmail.com (the v1.5.1 redeploy from main) |
| Previous | `69c90a82-0ece-41ef-899f-1a8be6049a47` (2026-07-20, nithin@growthpods.io) |

**Rollback target: `77f32645-e61e-438b-9868-6b44580c3b8d`.** Roll back with:

```bash
cd apps/parrot && npx wrangler rollback 77f32645-e61e-438b-9868-6b44580c3b8d
```

Do not roll back to 69c90a82. That version lacks the Phase 36 Spam and Trust-sender work, which is the
v1.5.1 incident. After any rollback, `node scripts/verify-workspace-quarantine-live.mjs` (without
`--require-move-control`) must print GREEN.

## 3. Database: migration `0015_v1_7_safety_events_source_id.sql`

The migration is additive: it adds one nullable column, `safety_events.source_id`. Old code never
reads or writes that column, so rolling back either app does not need a DB change.

**DB rollback = leave the column in place.**

Drop it only if Raj explicitly asks:

```sql
alter table safety_events drop column source_id;
```

That statement is destructive and must not be run without Raj's recorded instruction.

## Readback pair (pre-deploy baseline, 2026-10-14T04:02Z)

- `node scripts/verify-workspace-quarantine-live.mjs --require-move-control` printed **RED**, exit 1.
  The Move to Inbox label and the move-to-inbox endpoint are both missing from the served
  routes/ops.safety chunk. See `43-04-baseline-red.txt`.
- `node scripts/verify-workspace-quarantine-live.mjs` printed **GREEN**, exit 0, so the v1.5.1
  quarantine readback is healthy. See `43-04-baseline-v151.txt`.

After the deploy, both must print GREEN.
