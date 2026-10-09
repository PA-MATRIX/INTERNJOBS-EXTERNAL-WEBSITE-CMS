<!-- generated from PA-Ai-Team/Parrot @ 74880e45226e4920cfdf1dec6b36bea5fd8a190b on 2026-10-08 -->
# External Integrations

**Analysis Date:** 2026-10-08
**Source:** PA-Ai-Team/Parrot at origin/main `74880e45226e4920cfdf1dec6b36bea5fd8a190b`. Env var NAMES only. No values were read and no `.env*` files were opened.

## APIs & External Services

**Telephony and messaging (Telnyx), the dominant integration:**
- Telnyx Voice, SIP, Messaging, WhatsApp, CDR and AI Assistants (`https://api.telnyx.com`).
  - Files: `server/services/telnyx.js`, `telnyx-messaging.js`, `telnyxCdrSync.js`, `telnyxContext.js`, `telnyxPractice.js`, `telnyxState.js`, `telnyxStartupPolicy.js`, `server/routes/webhooks.js`, `messaging-webhook.js`, `practice.js`, `server/utils/telnyxSignature.js`, `telnyxWebhookGuard.js`, `telnyxWebhookSigStats.js`, `server/services/dialing/waveTelephony.js`.
  - Client SDK: `@telnyx/webrtc` (browser softphone). Python worker also calls Telnyx (`TELNYX_API_KEY`, `TELNYX_MESSAGING_PROFILE_ID`).
  - Auth env: `TELNYX_API_KEY`, `TELNYX_ACCOUNT_SID`, `TELNYX_CALL_CONTROL_APP_ID`, `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_WHATSAPP_PROFILE_ID`, `TELNYX_ASSISTANT_ID`, `TELNYX_PRACTICE_ASSISTANT_ID`, `AI_TELNYX_CONNECTION_ID`, `LOCAL_DEV_CONNECTION_ID`, `FROM_NUMBER`, `TELNYX_AGENT_RING_TIMEOUT`, `TELNYX_DESTINATION_RING_TIMEOUT`.
  - Per-org BYO Telnyx credentials (`USE_BYO_TELNYX=true` in `fly.toml`) resolved from `org_settings`. Credentials are stored encrypted (`ENCRYPTION_KEY`, `server/utils/crypto.js`).
  - Inbound webhooks verified with Ed25519: `TELNYX_WEBHOOK_PUBLIC_KEYS` (`label:base64,...`), `TELNYX_WEBHOOK_SIG_MODE` (off|report|enforce, default report), per-route `TELNYX_WEBHOOK_SIG_MODE_VOICE|MESSAGING|PRACTICE|PRACTICE_VARS` (practice_vars fails closed to enforce), `TELNYX_WEBHOOK_TOLERANCE_SEC`, `TELNYX_WEBHOOK_AUTO_CONFIGURE` (false on dev).

**AI voice (LiveKit worker):**
- LiveKit Cloud (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) via `livekit-server-sdk` (Node, `server/services/aiDialer/dispatch.js`) and `livekit-agents` (Python `ai-agent/agent.py`). SIP participant settings: `LK_SIP_USER`, `LK_SIP_PASS`, `SIP_PARTICIPANT_IDENTITY`, `SIP_RINGING_TIMEOUT_SECONDS`, `SIP_MAX_CALL_DURATION_SECONDS`, `AI_SIP_TRUNK_NAME`, `AI_AGENT_NAME`, `AI_WORKER_ENV`.
- Rime TTS (`https://users-east.rime.ai`; `RIME_*` vars, `ai-agent/rime_voices_cache.json`, read by `server/routes/ai-voice.js`).
- Deepgram STT (`STT_MODEL`, `AMD_STT_MODEL`) and Google Gemini LLM via LiveKit inference (`LLM_MODEL`, `AMD_LLM_MODEL`).
- Cal.com (`https://api.cal.com`, `CAL_API_KEY`, `CAL_EVENT_TYPE_ID`, `CAL_BASE_URL`, `CAL_TIMEZONE`; `server/services/calBookings.js`).
- Worker-to-web callback: `AI_AGENT_CALLBACK_URL` plus shared `AI_AGENT_CALLBACK_KEY` (a Fly secret on both apps; `ai-agent/callback_transport.py`). Prod callback target is `https://parrot.projecta.ai`.
- Vapi (legacy or secondary voice AI): `@vapi-ai/web` in the client, `server/services/vapi.js`, `https://api.vapi.ai`, env `VAPI_PRIVATE_API_KEY`, `VAPI_PUBLIC_API_KEY`, `VAPI_WEBHOOK_SECRET`.

**LLM and enrichment:**
- Anthropic (`https://api.anthropic.com`, `server/services/anthropic.js`, `aiAnalysis.js`; `ANTHROPIC_API_KEY`). Also used in the Python worker.
- MiniMax (`https://api.minimax.io`; `MINIMAX_API_KEY`).
- Apollo.io (`https://api.apollo.io`; `APOLLO_API_KEY`).
- Instantly (`https://api.instantly.ai`; `server/services/instantly.js`).
- Resend (`https://api.resend.com`; `RESEND_API_KEY`, `EMAIL_FROM`) and nodemailer (`server/services/email.js`).
- Note: no Cloudflare AI Gateway usage was found; Parrot LLM calls in this repo go direct to provider APIs or LiveKit inference. This differs from the internjobs-cms memory note that Workspace LLM calls route via CF AI Gateway (needs reconciling in the coupling inventory, since the Workspace in internjobs-cms may be a different codepath).

**Email OAuth (employee inbox):**
- Google (`gmail.googleapis.com`, `oauth2.googleapis.com`, `accounts.google.com`; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and Microsoft Graph (`graph.microsoft.com`, `login.microsoftonline.com`; `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`). Files: `server/services/emailOAuth.js`, `emailOAuthRuntime.js`, `server/routes/emailOAuth.js`, `email-inbox.js`, `server/services/oauthSessionAuthority.js`.

**Lead intake:**
- OpenClaw WhatsApp `/lead` webhook (`server/routes/openclaw-leads.js`, `server/utils/openclawLeads.js`). It authenticates with a managed Parrot API key (`Authorization: Bearer pk_live_...`, `server/middleware/apiKeyAuth.js`, `server/services/apiKeyService.js`). The campaign is stored in `organizations.lead_campaign_id`.
- Public REST API `server/routes/api/v1/*` (contacts, calls, campaigns, groups, messaging, analytics, users) for API-key clients.

## Data Storage

**Databases:**
- Postgres on Neon.
  - Connection env: `NEON_DATABASE_URL` (required), plus `DATABASE_URL`, `PROD_DATABASE_URL`, `CONCURRENCY_DB_URL`, `AI_QUEUE_DRYRUN_DATABASE_URL`, `AI_CLAIM_TEST_DATABASE_URL` (tooling and tests). `USE_NEON_SERVERLESS`.
  - Client: raw `pg` / `@neondatabase/serverless` Pool in `server/db.js`. Schema is created and altered at boot in `server/db.js`, with seeds that include the `internjobs` org and the embed tenant.

**File Storage:**
- Local filesystem for `server/data` and `server/public`. Call recordings are served through `server/routes/recordings.js` (Telnyx-hosted, matched by `server/services/aiDialer/recordings.js`).

**Caching:**
- Redis (optional): `REDIS_URL`, only for the socket.io adapter (`server/index.js`).

## Authentication & Identity

**Auth Provider:**
- Clerk (employees), `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY`, `SUPERADMIN_USER_ID`. Files: `server/middleware/auth.js`, `server/utils/clerk.js`, `clerkSessions.js`, `server/routes/auth.js`, `socketAuth.js`; `client/src/main.jsx`. Dev and live Clerk instances use `pk_test`/`pk_live` pairs.
- Embed auth (Workspace embed, a cross-repo seam): Parrot is embedded in an iframe by the InternJobs Workspace. `server/routes/embed.js`, `server/services/embedBootstrap.js`, `embedIdentityResolver.js`, `embedIdentitySchema.js`, `embedTenants.js`, `server/utils/embedReplayGuard.js`. Tokens are verified against a tenant JWKS and issuer stored in an embed tenants table (DB), replacing the legacy `EMBED_JWKS_URI`/`EMBED_EXPECTED_ISS` envs (they are used only to seed the `internjobs` tenant row once; see `server/index.js` and `server/services/embedTenants.js`). Env: `EMBED_SESSION_SECRET`, `EMBED_FRAME_ANCESTORS`, `EMBED_PARENT_ORIGIN`, `EMBED_ORG_SLUG`, `EMBED_JWKS_URI`, `EMBED_EXPECTED_ISS`, `PARROT_DEV_EMBED_DEMO_ENABLED`. The embed does not use Clerk (`client/src/main.jsx`).
- Zero-trust: Cloudflare Access assertions (`server/middleware/accessAssertion.js`, `hostBoundary.js`, `socketAccessBoundary.js`, `server/services/zeroTrustRuntime.js`, `machineBoundaryVerifiers.js`). Machine-caller and capability policy is in `ops/zero-trust/*.json`, with provisioning in `scripts/zt/*`. `AI_ACCESS_REQUIRED`.
- API keys (`pk_live_...`) for the public API and OpenClaw.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry or similar found).

**Logs:**
- `console.*` with bracketed prefixes (`[CONFIG]`, `[DB]`, `[EmbedTenants]`). Request IDs via `server/middleware/requestId.js`.
- Ops alerts (`server/services/opsAlerts.js`): Slack webhook (`AI_ALERT_SLACK_WEBHOOK_URL`), SMS (`AI_ALERT_SMS_TO`, `AI_ALERT_SMS_FROM`), `AI_ALERT_COOLDOWN_MINUTES`, `AI_ALERT_WEBHOOK_TIMEOUT_MS`.

## CI/CD & Deployment

**Hosting:**
- Fly.io (web: `parrot-o3vkuq`, `parrot-dev`; workers: `parrot-ai-agent`, `parrot-ai-agent-prod`). Public domains under `projecta.ai`.
- Deploy is manual. A full replace of `parrot-o3vkuq`, so deploy only from main (see the internjobs-cms memory note "Workspace deploy = full replace"). The internjobs-cms workspace app (`apps/parrot/`) is the other place this surface exists. Reconcile which is the source of truth in the coupling inventory.
- Legacy `render.yaml`.

**CI Pipeline:**
- None in-repo (no `.github/`).

## Environment Configuration

**Required env vars:** `NEON_DATABASE_URL`, `TELNYX_API_KEY` (boot-fatal); `ENCRYPTION_KEY` (warned); `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`.

**Feature and behaviour flags:** `AI_QUEUE_ENABLED`, `AI_SWEEP_ENABLED`, `WAVE_DIALER_ENABLED`, `REAPER_ENABLED`, `CDR_SYNC_ENABLED`, `NUMBER_OPTIMIZATION_ENABLED`, `AI_QUEUE_HEALTH_CHECK_ENABLED`, `AI_RECORDING_MATCH_ENABLED`, `USE_BYO_TELNYX`, `USE_NEON_SERVERLESS`, and many `AI_QUEUE_*`, `AI_COST_*`, `AMD_*`, `IVR_*`, `FAST_OPENING_*`, `COACHING_*`, `CDR_SYNC_*` tunables.

**Other:** `PUBLIC_URL`, `BASE_URL`, `PARROT_URL`, `PORT`, `FLY_APP_NAME`, `NODE_ENV`, `ZT_FLY_EXECUTABLE`, `HARNESS_PUBLIC_BASE` (tooling), `PROVE_*` (leak and signature proof scripts).

**Secrets location:**
- Fly secrets (`fly secrets set`), per app. `fly*.toml` carries only non-secret config. `server/.env.example` is the only env template (read, contains placeholders only). Local `.env` files are not read.

## Webhooks & Callbacks

**Incoming:**
- `server/routes/webhooks.js` (Telnyx voice), `messaging-webhook.js` (SMS and WhatsApp), `practice.js` (Telnyx practice assistant plus dynamic variables), `openclaw-leads.js` (OpenClaw), Vapi webhook (`VAPI_WEBHOOK_SECRET`), worker callbacks (`AI_AGENT_CALLBACK_KEY`), `embed.js` (iframe bootstrap), `emailOAuth.js` callbacks (Google and Microsoft).

**Outgoing:**
- Ops alerts to Slack (`AI_ALERT_SLACK_WEBHOOK_URL`) and SMS; worker to web callbacks at `AI_AGENT_CALLBACK_URL`; Telnyx API calls (including `TELNYX_WEBHOOK_AUTO_CONFIGURE` re-pointing webhook URLs at startup).

## Cross-Repo Coupling Signals (for the repo-split inventory)

- `workspace.internjobs.ai` appears as an issuer and frame ancestor: `server/db.js` (CSP ancestor comments, lines ~153 and ~192), `scripts/zt/prepare-prod-access-stage.mjs` (`orgId:17099`, issuer `https://workspace.internjobs.ai`, label `InternJobs`).
- `internjobs` org and embed tenant are seeded in `server/db.js` (~1253-1360) and `server/services/embedTenants.js`, with the `server/index.js` seed (Phase 41). `server/scripts/embed-test-harness.mjs` and `server/test/embedTenants.test.js` also reference it. This is a hard data coupling to the InternJobs Workspace embed.
- Docs describing the embed contract: `docs/PARROT-EMBED-INTEGRATION.md`, `docs/PARROT-INTEGRATION-UPGRADE.md`, `docs/PARROT-HUNTER-EMBED-UPGRADE.md`, `docs/zero-trust/`.
- `https://aeo.projecta.ai` and `https://workspace.example.com` also appear as hosts (the latter is a placeholder).
- No Infisical, Mattermost, Mastra, or Cloudflare Workers references were found among the host strings. Secrets are Fly-only. The internjobs-cms memory note says Infisical is the secret store, so Parrot's secrets are not in Infisical per this repo (unverified outside the repo).

---

*Integration audit: 2026-10-08*
