<!-- generated from PA-Ai-Team/Parrot @ 74880e45226e4920cfdf1dec6b36bea5fd8a190b on 2026-10-08 -->
# Architecture

**Analysis Date:** 2026-10-08
**Source:** PA-Ai-Team/Parrot, `origin/main` @ `74880e45226e4920cfdf1dec6b36bea5fd8a190b` (read via `git ls-tree` / `git show` only; main worktree `/Users/rajren/Documents/Parrot`).

## Architectural Context Loaded

- `.planning/NORTH-STAR.md`: not present in internjobs-cms.
- Locked source: `/Users/rajren/internjobs-cms/.planning/milestones/v1.6-repo-split/` (CONTEXT.md, HANDOFF-next-session.md) is the active milestone. This map is an input to its coupling inventory and takes no side on split decisions.
- Parrot is a separate softphone/dialer CRM codebase (Fly app `parrot-o3vkuq`), not `apps/parrot/` in internjobs-cms. The Workspace is `apps/parrot/`; Parrot is the backing service it embeds (see PARROT-RELATIONSHIP.md). No locked rule was found that is contradicted by anything below.
- Note: Parrot's root `CLAUDE.md` is a generic Neon skill file, not project guidance.

## Pattern Overview

**Overall:** Three deployables from one repo: a Node/Express 5 + Socket.IO monolith that serves a built React SPA, plus a separate Python LiveKit voice worker.

**Key Characteristics:**
- ESM Node 20 server (`server/index.js`) serves REST, webhooks and Socket.IO, and statics from `client/dist` (built in a Docker stage).
- Postgres on Neon is accessed through a raw `pg` Pool (`server/db.js`), or `@neondatabase/serverless` when `USE_NEON_SERVERLESS=true`. There is no ORM. Schema is created and evolved in `server/init_db.js` (idempotent), and `server/migrations/` holds only `001-hash-passwords.js`.
- Multi-tenant by organization: `server/middleware/org.js`, `requireAppEntitlement('<app>')` gates, and per-org (BYO) Telnyx credentials when `USE_BYO_TELNYX=true`.
- A "zero-trust" layer (Cloudflare Access assertions, host boundaries, machine boundary verifiers) is installed via `server/services/zeroTrustRuntime.js` in front of the app and sockets. A large ops and tooling tree (`ops/zero-trust`, `scripts/zt`) supports it.
- Telephony is Telnyx (WebRTC softphone, Call Control, messaging). The AI dialer uses LiveKit with a Python agent, Rime TTS and Cal.com. Vapi is a legacy or alternate service (`server/services/vapi.js`).

## Layers

**HTTP/Socket entry:** `server/index.js`
- Wires cors, body parser (keeps `req.rawBody` for webhook signatures), file upload, embed frame policy, static serving, routers, Socket.IO (optional Redis adapter via `REDIS_URL`) and the listen/scheduler startup.

**Middleware:** `server/middleware/`
- `auth.js` (requireAuth/requireAdmin/requireAppEntitlement), `bearerVerifier.js`, `accessAssertion.js`, `hostBoundary.js`, `apiKeyAuth.js`, `org.js`, `requestId.js`, `socketAuth.js`, `socketAccessBoundary.js`.

**Routes:** `server/routes/*.js` plus `server/routes/api/` (`index.js`, `v1/`: API-key public API)
- Factory style for stateful routers, e.g. `createAiCallsRouter({ pool, io })`, `createWebhookRoutes(io)`.

**Services:** `server/services/`
- `aiDialer/` (queue, dispatch, eligibility, outcomes, research, recordings, cost, timezone, workerRouting, override).
- `dialing/` (wave dialer: waveElection, waveLoop, waveOrchestrator, waveSeat, waveTelephony, abandonment, claim, guardrails).
- `numberOptimization/`, and the provider clients `telnyx*.js`, `vapi.js`, `anthropic.js`, `instantly.js`, `email*.js`, `emailOAuth*.js`.
- Embed and identity: `embed*.js`. Zero-trust: `zeroTrustRuntime.js`, `machineBoundaryVerifiers.js`, `oauthSessionAuthority.js`, `profileBoundary.js`.
- Background jobs: `scheduler.js`, `telnyxCdrSync.js`, `opsAlerts.js`.

**Utils:** `server/utils/` (phone, dnc, crypto, clerk, clerkSessions, telnyx signature/guard/stats, embedReplayGuard, areaCodes, contacts, contactTimeZone, openclawLeads).

**Client:** `client/src` (React + Vite)
- `App.jsx`, `pages/`, `features/<domain>/`, `context/` (Auth, Socket, WebRTC, PowerDialer), `hooks/`, `utils/`, `embedMode.js`.

**AI worker:** `ai-agent/` (Python, LiveKit Agents)
- `agent.py`, `worker_routing.py`, `callback_transport.py`, `place_call.py`, `prompts/*.md`, `rime_voices_cache.json`. Deployed as its own Fly app, `parrot-ai-agent` via `fly.ai-agent.toml` (dev) and `fly.ai-agent.prod.toml` (prod).

## Data Flow

**Human call:** React softphone (Telnyx WebRTC, `client/src/context/WebRTCContext.jsx`) -> `server/routes/calls.js` / `webhooks.js` (Telnyx webhook, signature-verified via `server/utils/telnyxSignature.js` and `telnyxWebhookGuard.js`) -> DB update -> `io.to('user:N').emit(...)` -> client SocketContext.

**AI dialer:** `startAiQueue({ io })` tick (`server/services/aiDialer/queue.js`) -> eligibility, guardrails, claim lease -> `dispatch.js` -> LiveKit SIP dispatch to the Python worker (`workerRouting.js` mirrors `ai-agent/worker_routing.py`) -> worker posts callbacks to `/api/ai-calls/events` (`routes/ai-calls.js`, `callback_transport.py`) -> outcomes, bookings, recordings, cost sync -> `ai-run-update` socket events.

**Wave dialer:** `routes/dialerWaves.js` -> `services/dialing/wave*.js`, gated by `WAVE_DIALER_ENABLED`.

**Embed:** parent app issues a JWT (`EMBED_JWKS_URI`, `EMBED_EXPECTED_ISS`) -> `/api/embed` + `client/src/pages/EmbedBootstrap.jsx` -> tenant resolved in `server/services/embedTenants.js`. Frame ancestors are controlled by `createEmbedFramePolicy`.

**Lead ingest:** `/api/webhooks/openclaw-leads` (`routes/openclaw-leads.js`).

**State Management:** server state lives in Postgres; the Socket.IO fan-out uses the Redis adapter when multi-machine. The client uses React contexts.

## Entry Points

- `server/index.js` (exports `app`, `server`, `io`): start with `node init_db.js && node index.js` (render.yaml); Docker runs the server. It starts `startScheduler(io)`, `startAiQueue({ io })` and the cost and CDR jobs after listen.
- `ai-agent/agent.py`: LiveKit worker (`ai-agent/Dockerfile.worker`).
- `client/src/main.jsx`: SPA.
- `scripts/*.mjs`, `scripts/zt/*`, `server/scripts/*`: operational and audit CLIs.

## Error Handling

- Background jobs are env-flag gated (`AI_QUEUE_ENABLED`, `REAPER_ENABLED`, `CDR_SYNC_ENABLED`, `AI_SWEEP_ENABLED`, `NUMBER_OPTIMIZATION_ENABLED`). Failures raise Slack/SMS ops alerts through `server/services/opsAlerts.js` (`AI_ALERT_*`).
- Webhook signature mode is configurable per webhook family (`TELNYX_WEBHOOK_SIG_MODE*`).

## Cross-Cutting Concerns

**Logging:** `console.*` with bracketed tags (e.g. `[DB]`); `requestId.js` middleware.
**Validation:** ad hoc in routes; `utils/phone.js` for number normalization.
**Authentication:** Clerk (`@clerk/backend`, `@clerk/express`, `utils/clerk.js`), `jose` for JWTs, API keys (`apiKeyAuth.js`), embed JWTs, Cloudflare Access assertions, socket token auth.

## Coupling and External Surface (for the split inventory)

- Neon Postgres (`NEON_DATABASE_URL`), Redis (`REDIS_URL`), Telnyx (`TELNYX_*`), Vapi (`VAPI_*`), Anthropic (`ANTHROPIC_API_KEY`), LiveKit + Rime + Cal.com (worker), Clerk, Cloudflare (zero-trust tooling, `scripts/zt/cloudflareClient.mjs`), Instantly (`services/instantly.js`), email OAuth, Slack/SMS alerts, and the OpenClaw leads webhook.
- Hosting: Fly apps `parrot-o3vkuq` (web, ams, `fly.toml`), `parrot-ai-agent` (dev worker), a prod worker (`fly.ai-agent.prod.toml`) and `fly.dev.toml`. `render.yaml` is a legacy `parrot-softphone` Render service.
- Env var names read in `server/config.js` (names only): the AI_*, TELNYX_*, EMBED_*, VAPI_*, REDIS_URL, ENCRYPTION_KEY, PUBLIC_URL, WAVE_DIALER_ENABLED and others.
- The worker contract is duplicated between `ai-agent/worker_routing.py` and `server/services/aiDialer/workerRouting.js`, which must be kept in sync.
- The `Dockerfile` copies `ai-agent/prompts/` into the server image, because `services/aiDialer/research.js` reads it at runtime. This is a cross-directory build coupling.
- No internjobs-cms code imports were found in the tree listing; this was not exhaustively grepped (needs_followup if the inventory requires proof).

---
*Architecture analysis: 2026-10-08*
