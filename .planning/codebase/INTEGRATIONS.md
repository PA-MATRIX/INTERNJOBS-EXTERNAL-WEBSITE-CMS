<!-- generated from internjobs-cms @ d1658aa5ba0ce397788cd79c34b425c459eaa0da on 2026-10-08 -->
# External Integrations

**Analysis Date:** 2026-10-08
**Source:** merged main `d1658aa5ba0ce397788cd79c34b425c459eaa0da`. Only env var NAMES are listed; no values. `.env*` files were not read.

## Topology (app -> host)

| Surface | Code | Host |
|---|---|---|
| Marketing CMS | `apps/marketing` | CF Pages `internjobs-ai` -> `internjobs.ai` |
| Student app | `apps/app` | Fly `apps/app/fly.toml` -> `app.internjobs.ai` |
| Employers SPA + API | `apps/employers` | CF Pages `internjobs-employers` -> `employers.internjobs.ai` |
| Workspace (employees) | `apps/parrot` | CF Worker `internjobs-parrot` -> `workspace.internjobs.ai` |
| Startup MCP | `apps/startup` | CF Worker `internjobs-startup-mcp` -> `mcp.internjobs.ai` |
| Agent inbox | `apps/agentic-inbox` | CF Worker `internjobs-agentic-inbox` (workers.dev) |
| Inbound email router | `apps/email-worker` | CF Worker `internjobs-email-ingest` |
| Mattermost CSP proxy | `apps/mattermost-proxy` | CF Worker -> `chat.internjobs.ai` |
| Mattermost | `apps/parrot-mattermost` | Fly `internjobs-mattermost` |
| Graph API | `infra/graph-api` | Fly `internjobs-graph-api` |
| Startup API | `infra/startup-api` | Fly `internjobs-startup-api` |
| FalkorDB | `infra/falkordb` | Fly `internjobs-graph` |
| Student DB | `infra/student-db` | Fly Postgres+pgvector `internjobs-student-db` |
| Mattermost DB | `infra/mattermost-db` | Fly Postgres `internjobs-mattermost-db` |
| iMessage bridge | `apps/mac-bridge` | HostMyApple Mac mini, `bridge.internjobs.ai` |

Database history: `infra/NEON-EXIT.md` documents the move off Neon to Fly Postgres (`infra/student-db`); `NEON_AUTH_JWKS_URL` still appears in code as a legacy var name.

## Authentication & Identity (three Clerk apps, do not merge)

Per memory rules "two Clerk apps, not one" and Startup tripod:
- Students: LinkedIn-only Clerk, `app.internjobs.ai`; vars `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWKS_URL`, `CLERK_SIGN_IN_URL`, `CLERK_SIGN_UP_URL`, `CLERK_BACKEND_API_URL`; code `apps/app/src/auth.mjs`. Only `sub` is guaranteed in the JWT (memory "Clerk JWT claims are minimal"); do not require email/phone claims.
- Employees (Workspace): phone-OTP Clerk, `clerk.workspace.internjobs.ai`; vars `PARROT_CLERK_ISSUER`, `PARROT_CLERK_JWKS_URL`, `PARROT_CLERK_SECRET_KEY`; code `apps/parrot/workers/app.ts`, `apps/parrot/workers/lib/clerk-admin.ts`. Operator allowlist `PARROT_OPERATOR_EMAILS`.
- Startups: Clerk at `clerk.employers.internjobs.ai`; vars `STARTUPS_CLERK_JWKS_URL`, `STARTUPS_CLERK_ISSUER` (in `apps/startup/wrangler.jsonc`), `STARTUPS_CLERK_SECRET_KEY`; code `apps/startup/workers/lib/auth.ts`, `apps/employers/functions/api/[[path]].ts` (Svix webhook verification).
- Mattermost SSO bridge: Parrot acts as OIDC provider (`apps/parrot/workers/routes/oidc.ts`); vars `OIDC_SIGNING_KEY`, `OIDC_PUBLIC_JWK`, `MATTERMOST_OIDC_CLIENT_ID`, `MATTERMOST_OIDC_CLIENT_SECRET`, `MATTERMOST_OIDC_REDIRECT_URI`.
- Dev bypass flags: `ENABLE_DEV_AUTH`, `PARROT_DEV_MODE` (must be off in production).
- Service-to-service: shared-secret headers `STUDENT_API_SECRET`, `STARTUP_API_SECRET`, `GRAPH_API_SECRET`, `INTERNAL_API_SECRET`, `STARTUP_MCP_ADMIN_SECRET`, `BRIDGE_HMAC_SECRET`, `EMAIL_WORKER_SECRET`, `EMAIL_HANDOFF_SECRET` (same value in `apps/email-worker` and `apps/startup`), `APP_SESSION_SECRET`.

## APIs & External Services

**LLM / AI:**
- Cloudflare Workers AI via `AI` binding (`apps/parrot/workers/lib/ai.ts`, `apps/startup`, `apps/agentic-inbox`); models `KIMI_MODEL`, `PARROT_FAST_MODEL`, `AGENT_MODEL`
- Cloudflare AI Gateway (`gateway.ai.cloudflare.com`; id `PARROT_AI_GATEWAY_ID`): Parrot LLM calls route through the gateway for per-employee daily caps. Student app stays on direct REST (`CLOUDFLARE_AI_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, `LLM_PROVIDER`, `EMBED_PROVIDER`). Intentional per memory "LLM via AI Gateway not direct REST"; do not migrate the student app as a side effect.
- Embeddings: Workers AI into pgvector (`apps/app/src/embeddings.mjs`, migration `0005_v1_2_workers_ai_embeddings.sql`, `USE_VECTOR_MATCH`)

**Safety:**
- Lakera Guard (`api.lakera.ai`): `LAKERA_GUARD_API_KEY`, `LAKERA_GUARD_ENDPOINT`; `apps/app/src/safety/screen.mjs`, `apps/parrot/workers/lib/safety.ts`, `apps/parrot/workers/routes/ops-safety.ts`; docs `infra/LAKERA-PRICING.md`, `infra/LAKERA-VERIFY-LIVE.md`; table `0009_v1_3_safety_events.sql`

**Messaging / telephony:**
- Spectrum / Photon (iMessage+SMS, `spectrum-ts`): `SPECTRUM_API_BASE_URL`, `SPECTRUM_API_TOKEN`, `SPECTRUM_PROJECT_ID`, `SPECTRUM_FROM_NUMBER`, `SPECTRUM_IMESSAGE_ADDRESS`, `SPECTRUM_WEBHOOK_SECRET`, `PHOTON_*` (`PHOTON_API_BASE_URL`, `PHOTON_API_TOKEN`, `PHOTON_FROM_NUMBER`, `PHOTON_PROJECT_ID`, `PHOTON_WEBHOOK_SECRET`), `PROJECT_ID`, `PROJECT_SECRET`; `apps/app/src/sms/spectrum.mjs`, `apps/app/src/spectrum-listener.mjs` (`ENABLE_SPECTRUM_LISTENER`). Provider selected by `SMS_PROVIDER` (default `spectrum`) in `apps/app/src/sms/provider.mjs`.
- Mac bridge / BlueBubbles: `apps/app/src/sms/mac-bridge.mjs` -> `MAC_BRIDGE_URL`/`BRIDGE_URL`, HMAC `BRIDGE_HMAC_SECRET`; `apps/mac-bridge/src/{bluebubbles-client,listener,security,server}.mjs`. Health at `bridge.internjobs.ai/health`; SSH firewalled (memory "Mac bridge access").
- Telnyx (`api.telnyx.com`): `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_WEBHOOK_PUBLIC_KEY`, `TELNYX_USE_MCP_INTEGRATION`; `apps/startup/workers/routes/{telnyx,voice}.ts`; migration `0014_v1_4_telnyx_touchbase.sql`. Workspace phone/SMS UI is a seam per memory "Seam, not integration".

**Meetings:** Daily.co (`api.daily.co`, default `internjobs.daily.co`; custom vanity domain deferred): `DAILY_API_KEY`; `apps/parrot/workers/lib/daily.ts`, `apps/parrot/app/routes/meetings.tsx`.

**Chat:** Mattermost on Fly: `MATTERMOST_URL`, `MATTERMOST_WS_URL`, `MATTERMOST_ADMIN_TOKEN`, `MATTERMOST_BOT_TOKEN`; `apps/parrot/workers/lib/{mattermost,mm-ws-proxy}.ts`, `apps/parrot/workers/routes/chat-files.ts`; proxy `apps/mattermost-proxy/workers/index.ts` rewrites CSP so `workspace.internjobs.ai` can iframe (`ALLOWED_PARENT`, `MATTERMOST_ORIGIN`).

**Enrichment:** Bright Data LinkedIn (`api.brightdata.com`): `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID`; `apps/app/src/onboarding/brightdata.mjs`; migrations `0007`, `0010`.

**Push:** Web Push VAPID (`fcm.googleapis.com`): `PUSH_VAPID_PUBLIC_KEY` (public, in `apps/parrot/wrangler.jsonc`), `PUSH_VAPID_PRIVATE_KEY` (secret); `apps/parrot/workers/lib/vapid.ts`.

**Cloudflare management API (`api.cloudflare.com`):** `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, `CLOUDFLARE_EMAIL_ROUTING_API_TOKEN`, `CLOUDFLARE_INTERNJOBS_ZONE_ID` (per-employee mailbox/routing provisioning).

**Other:** Cloudflare Turnstile (`challenges.cloudflare.com`, marketing/forms), LinkedIn public URLs, Mastra docs link.

## Data Storage

**Databases:**
- Student Postgres 17 + pgvector on Fly (`infra/student-db`): `DATABASE_URL`; client `pg` and `@mastra/pg`; schema via `apps/app/db/migrations/*.sql` run by `apps/app/scripts/migrate.mjs` (note: no `0006`). Tables include `inbound_messages`, `conversations`, `drafts`, `draft_feedback`, `student_embeddings`, `role_embeddings`, pairing, safety, startup identity/MCP/agent email, touchbase.
- Startup API Postgres access via `infra/startup-api/src/index.mjs` (`pg`, `DATABASE_URL`)
- Mattermost Postgres 17 (`infra/mattermost-db`)
- FalkorDB graph (`infra/falkordb`, `FALKORDB_URL`) behind `infra/graph-api` (`GRAPH_API_URL`, `GRAPH_API_SECRET`); clients `apps/app/src/memory/graph.mjs`, `apps/parrot/workers/lib/graph.ts`
- Parrot per-employee mailbox + workspace state: Durable Object SQLite (`EmployeeMailboxDO`, `WorkspaceDO`) with Drizzle (`apps/parrot/workers/db/schema.ts`, `workers/durableObject/migrations.ts`)

**File Storage:** Cloudflare R2: `internjobs-parrot-attachments` (Parrot), `internjobs-agentic-inbox`, `internjobs-startup-call-audit` (`VOICE_AUDIT`), student-app bucket via S3 API (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; `apps/app/src/storage/r2.mjs`).

**Caching/KV:** Cloudflare KV `PARROT_FEATURE_FLAGS`, `TOUCHBASE_CURSORS`.

## Email

- Inbound: single zone-wide Email Routing catch-all bound to `internjobs-email-ingest` (`apps/email-worker/src/index.js`). Branches: `conv-{uuid}@agent.internjobs.ai` -> HMAC POST to `FLY_INGEST_URL` (`https://app.internjobs.ai/webhooks/email`); `*@employers.internjobs.ai` -> `STARTUP_EMAIL_HANDOFF_URL` (`https://mcp.internjobs.ai/internal/email/inbound`) with fallback; everything else forwarded to `OPERATOR_FALLBACK_EMAIL`. Do not assume per-subdomain catch-alls (see comment in `apps/email-worker/wrangler.toml`). Timeout coupling enforced by `scripts/check-email-timeout-invariant.mjs`.
- Outbound: CF `send_email` binding `EMAIL` (Parrot, Startup, Agentic Inbox); student app `apps/app/src/email/outbound.mjs` (`OUTBOUND_DRY_RUN`).

## Monitoring & Observability

- Workers `observability.enabled = true`; `SENTRY_DSN` referenced in code (no SDK dependency in manifests); Fly logs; `wrangler tail`. Health endpoints: Parrot `/healthz` (`apps/parrot/workers/tests/healthz.test.ts`), bridge `/health`. Smoke scripts: `apps/app/scripts/smoke-{ops,graph,mastra}.mjs`, `infra/graph-api/smoke.mjs`, `infra/startup-api/smoke.mjs`, `apps/parrot/scripts/smoke-parrot-graph.mjs`, `scripts/26-kgraph-{smoke,ab}.mjs`.

## CI/CD & Deployment

- GitHub Actions `.github/workflows/ci.yml` (see STACK.md). Phase submission via `scripts/submit-phase.mjs` writing `submissions/<phase>.json`, validated by `scripts/check-submission.mjs`; promotion check `scripts/verify-v15-promotion.mjs`; Clerk restriction config `scripts/33-clerk-restrictions-config.mjs`.
- Deploys: `wrangler deploy` (Workers), `wrangler pages deploy` (marketing, employers), `fly deploy` (Node/infra). Workspace deploy is a full replace: deploy `internjobs-parrot` only from `main` (memory "Workspace deploy = full replace"; a branch deploy removed a prod feature on 2026-10-08).

## Environment Configuration

**Required env var names (by area):**
- Student app: `DATABASE_URL`, `APP_URL`, `APP_SESSION_SECRET`, Clerk vars, `R2_*`, `CLOUDFLARE_AI_*`, `BRIGHTDATA_*`, `SPECTRUM_*`/`PHOTON_*`, `LAKERA_*`, `GRAPH_API_*`, `FALKORDB_URL`, `WAITLIST_MODE`, `PAIRING_TTL_HOURS`, `AGENT_NUMBER`, `HOST`, `PORT`
- Workspace: `PARROT_CLERK_*`, `MATTERMOST_*`, `OIDC_*`, `DAILY_API_KEY`, `PUSH_VAPID_PRIVATE_KEY`, `STUDENT_API_SECRET`, `GRAPH_API_SECRET`, `CLOUDFLARE_*`, `PARROT_AI_GATEWAY_ID`
- Startup MCP: `STARTUPS_CLERK_*`, `STARTUP_API_SECRET`, `STARTUP_MCP_ADMIN_SECRET`, `TELNYX_*`, `EMAIL_HANDOFF_SECRET`
- Employers Pages: Clerk keys, Svix webhook secret (`apps/employers/.env.example` names only)
- Next-style names (`NEXT_PUBLIC_*`) appear in code but no Next.js dependency exists; treat as legacy.

**Secrets location:** Infisical, org Projecta, env `prod`, path `/internjobs-ai` (see memory "Infisical project"; `.infisical.json` holds only workspace id and default env). Runtime copies: Fly secrets, Wrangler secrets, Pages env. Persist any newly pasted secret to Infisical first.

## Webhooks & Callbacks

**Incoming:**
- `https://app.internjobs.ai/webhooks/email` (HMAC from email worker, `apps/app/src/server.mjs`)
- `https://mcp.internjobs.ai/internal/email/inbound` (`apps/startup/workers/routes/email.ts`)
- Telnyx webhook (`apps/startup/workers/routes/telnyx.ts`, `TELNYX_WEBHOOK_PUBLIC_KEY`), Spectrum/Photon webhook (`SPECTRUM_WEBHOOK_SECRET`), Clerk/Svix webhook in `apps/employers/functions/api/[[path]].ts`
- Parrot OIDC endpoints for Mattermost (`apps/parrot/workers/routes/oidc.ts`)

**Outgoing:** Email worker -> Fly/startup MCP; app -> `bridge.internjobs.ai`; Parrot -> student API, graph API, Mattermost, Daily, Clerk (`api.clerk.com`).

---

*Integration audit: 2026-10-08*
