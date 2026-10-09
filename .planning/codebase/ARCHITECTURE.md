<!-- generated from internjobs-cms @ d1658aa5ba0ce397788cd79c34b425c459eaa0da on 2026-10-08 -->
# Architecture

**Analysis Date:** 2026-10-08
**Mapped commit:** `d1658aa5ba0ce397788cd79c34b425c459eaa0da` (merged main)

## Architectural Context Loaded

- `.planning/NORTH-STAR.md`, `AGENTS.md`, `CLAUDE.md` (repo root): not present in this repo.
- Locked decisions come from user memory. They are treated as intentional design, not gaps:
  - Two Clerk apps, not one. Students use LinkedIn-only auth at `app.internjobs.ai`. Employees use phone-OTP-only auth at `workspace.internjobs.ai`. A third Clerk app serves startups at `employers.internjobs.ai` (Phase 28.5). Do not merge them.
  - Only `sub` is guaranteed in a Clerk session JWT. Do not require email or phone claims.
  - Parrot LLM calls go through CF AI Gateway. The student app stays on direct REST.
  - Workspace deploys are a full replace. Deploy `internjobs-parrot` only from `main`.
  - Workspace panes are thin entry points into real backing services (Mail to Agent Inbox, Chat to Mattermost, SMS/phone to Parrot).
  - The Phone/SMS dialer and Daily.co vanity domain are future work.
- Say "Workspace" in narrative. `apps/parrot/` is its directory name.

## Pattern Overview

**Overall:** Polyglot monorepo of independently deployed services. There is no shared runtime. Each app has its own deploy target, auth boundary and datastore. Services talk over HTTPS with shared-secret or JWT auth.

**Key Characteristics:**
- Root npm workspaces cover only `apps/marketing`, `apps/app`, `apps/employers`, `apps/email-worker`, `apps/mac-bridge`, `apps/mattermost-proxy` and `packages/*`. `apps/parrot`, `apps/startup` and `apps/agentic-inbox` are excluded and have their own `package-lock.json` (`package.json`).
- Student side is a plain Node HTTP server on Fly with hand-written routing. Workspace and startup MCP sides are Cloudflare Workers using Hono.
- Postgres on Fly (`infra/student-db`) is the student and startup system of record. Workspace state lives in Durable Object SQLite plus R2 plus KV.
- A FalkorDB knowledge graph on Fly sits behind an HTTP proxy, `infra/graph-api`.
- Process is gated by RRR (`.planning/`). CI enforces team submission markers (`scripts/check-submission.mjs`).

## Deployable Units

| Unit | Path | Runtime / host | Public surface |
|------|------|----------------|----------------|
| Marketing site | `apps/marketing/` | Vite + React SPA on Cloudflare Pages (`wrangler.toml`, `dist`) | internjobs.ai |
| Student app | `apps/app/` | Node ESM on Fly (`fly.toml`, app `internjobs-ai-student-app`, port 3000) | app.internjobs.ai |
| Workspace | `apps/parrot/` | CF Worker, Hono API + React Router 7 SSR (`wrangler.jsonc`, `internjobs-parrot`) | workspace.internjobs.ai |
| Startup MCP | `apps/startup/` | CF Worker, Hono + MCP (`internjobs-startup-mcp`) | mcp.internjobs.ai |
| Employers portal | `apps/employers/` | Vite SPA plus Pages Functions `functions/api/[[path]].ts` | employers.internjobs.ai |
| Email ingest | `apps/email-worker/` | CF Email Worker (`internjobs-email-ingest`) | catch-all email routing |
| Mattermost proxy | `apps/mattermost-proxy/` | CF Worker (`internjobs-mattermost-proxy`) | chat.internjobs.ai |
| Mattermost | `apps/parrot-mattermost/` | Fly Docker (`internjobs-mattermost`) | via proxy |
| Mac bridge | `apps/mac-bridge/` | Node on a Mac mini (BlueBubbles, launchd) | bridge.internjobs.ai |
| Agentic Inbox | `apps/agentic-inbox/` | Upstream CF Worker fork; Email tab iframe target | `workers.dev` |
| Graph API | `infra/graph-api/` | Node on Fly | internal, called by `apps/app` and `apps/parrot` |
| Startup API | `infra/startup-api/` | Node on Fly (`internjobs-startup-api`) | internal, called by `apps/startup` |
| Databases | `infra/student-db/`, `infra/mattermost-db/`, `infra/falkordb/` | Fly Docker | internal |

## Layers

**Presentation (Marketing):**
- Location: `apps/marketing/src/` (`App.tsx`, `main.tsx`, `components/StartupAccessSection.tsx`)
- Depends on: `public/` assets only, plus a CTA to the startup Worker `/api/*`.

**Presentation (Workspace):**
- Location: `apps/parrot/app/`
- Contains: React Router routes (`routes/`), panes (`components/`), client helpers (`lib/api.ts`, `lib/auth.ts`).
- Depends on: Clerk (employee instance) and the Worker `/api/*`.
- Panes: `WorkspaceShell.tsx` stays mounted. `InboxPane`, `ChatPane`, `MeetingsPane` and `ParrotEmbedPane` are children. `crosspane/` holds cross-pane actions.

**Workspace API (edge):**
- Location: `apps/parrot/workers/`
- `app.ts`: top-level Hono. It verifies the Clerk JWT with `jose` against `PARROT_CLERK_JWKS_URL`. It sends `/api/*` to `index.ts` and everything else to the React Router SSR handler. It also exports the DO classes.
- `index.ts`: large Hono API.
  - `/api/me` and `/api/health` plus `/healthz`.
  - `/api/inbox/*`.
  - `/api/chat/*` (Mattermost bridge plus the WebSocket proxy).
  - `/api/dev/*` smoke routes.
  - Mounted sub-routers: `routes/agent.ts`, `routes/admin-employees.ts`, `routes/oidc.ts`, `routes/ops-safety.ts`, `routes/chat-files.ts`.
- `lib/`: integration clients and domain logic. `mattermost.ts`, `mm-ws-proxy.ts`, `daily.ts`, `graph.ts`, `ai.ts`, `safety.ts`, `inbound-email.ts`, `email-sender.ts`, `embed-jwt.ts`, `mailbox.ts` (`requireEmployeeMailbox` middleware), `operator.ts`, `agent-tools.ts`, `spam-purge.ts`, `auto-clear.ts`.
- `durableObject/`: `EmployeeMailboxDO` (per-employee SQLite mailbox, `index.ts`, `migrations.ts`) and `WorkspaceDO` (`workspace.ts`).
- Bindings: `BUCKET` (R2 `internjobs-parrot-attachments`), `PARROT_FEATURE_FLAGS` (KV), `EMAIL` (send_email), the two DOs, and a cron `*/5 * * * *`.
- `shared/` (`dates.ts`, `folders.ts`) is imported by both Worker and UI.

**Student app (Node):**
- Location: `apps/app/src/`
- `server.mjs`: single `http.createServer` with an if-chain on `req.method` and `url.pathname`.
  - Student routes: `/waitlist`, `/auth/callback`, `/onboard/*`, `/pairing/*`, `/profile`, `/linkedin/profile-url`.
  - Webhooks: `/webhooks/photon`, `/webhooks/mac-bridge`, `/webhooks/email`.
  - Internal: `/internal/safety-events*`.
  - Startup pages: `/startup/*`.
  - Health: `/healthz`, `/config/status`.
- Domain modules: `auth.mjs`, `config.mjs`, `store.mjs` (Postgres access), `messaging.mjs`, `outbound.mjs`, `mastra.mjs` (agent core), `embeddings.mjs`, `views.mjs` (server-rendered HTML), `http.mjs`.
- Subfolders: `workflows/` (`student-inbound.mjs`, `reply-to.mjs`), `sms/` (`provider.mjs` selects `mac-bridge.mjs` or `spectrum.mjs`; `SMS_PROVIDER=mac-bridge` in `fly.toml`), `safety/screen.mjs`, `memory/graph.mjs`, `onboarding/` (`brightdata.mjs`, `pairing.mjs`), `email/outbound.mjs`, `storage/r2.mjs`, `routes/admin.mjs`.
- Schema: SQL migrations in `apps/app/db/migrations/` applied by `apps/app/scripts/migrate.mjs`.

**Startup MCP Worker:**
- Location: `apps/startup/workers/`
- `app.ts` is the Hono root. Routes: `/mcp` (per-request `McpServer` built in `server.ts`; never share one across requests), `/admin/*`, `/api/*` (marketing CTA receiver), `/healthz`, Telnyx and voice routes, inbound email (`/internal/email/inbound`), and a Monday cron (`0 14 * * 1`) in `routes/scheduled.ts`.
- Tools: `tools/` (`search`, `me`, `discover-actions`, `execute`).
- Auth: per-startup Bearer token validated against the Fly `startup-api` by SHA-256 hash (`lib/auth.ts`).
- Bindings: `AI`, `EMAIL`, KV `TOUCHBASE_CURSORS`, R2 `VOICE_AUDIT`.

**Shared types:**
- `packages/shared/src/index.ts` (`@internjobs/shared`): audience, channel and waitlist TypeScript types. Used by the workspace packages only.

## Data Flow

**Student inbound message:**
1. iMessage reaches the BlueBubbles Mac, and `apps/mac-bridge/src/listener.mjs` or `server.mjs` forwards it to `POST /webhooks/mac-bridge` on `apps/app`. Photon Spectrum arrives at `/webhooks/photon`.
2. `safety/screen.mjs` screens the message.
3. `workflows/student-inbound.mjs` runs the Mastra agent (`mastra.mjs`) using Postgres, embeddings and graph memory (`memory/graph.mjs` to `infra/graph-api`).
4. Replies go out via `sms/provider.mjs` and `outbound.mjs`.

**Inbound email:**
1. Cloudflare Email Routing hits `apps/email-worker/src/index.js`.
2. The worker POSTs to `app.internjobs.ai/webhooks/email` (`FLY_INGEST_URL`). Mail for `*@employers.internjobs.ai` goes to `mcp.internjobs.ai/internal/email/inbound` (`STARTUP_EMAIL_HANDOFF_URL`), authenticated by `EMAIL_HANDOFF_SECRET`.
3. Employee mail (`*@internjobs.ai`) is handled in Workspace `lib/inbound-email.ts` and stored in the `EmployeeMailboxDO`.

**Workspace chat:**
1. The browser calls `/api/chat/*` with a Clerk JWT.
2. `lib/mattermost.ts` mints per-user tokens and calls Mattermost REST at `MATTERMOST_URL` (`chat.internjobs.ai`, the CSP-rewriting `apps/mattermost-proxy`).
3. Live updates use `lib/mm-ws-proxy.ts`, a Worker-proxied WebSocket. It upgrades directly to `MATTERMOST_WS_URL` (the Fly backend) because the proxy does not pass `Upgrade`.

**Workspace email pane and Parrot pane:**
- The Email tab embeds Agentic Inbox (`AGENTIC_INBOX_URL`).
- `lib/embed-jwt.ts` mints short-lived RS256 tokens for the `PARROT_EMBED_URL` pane (`ParrotEmbedPane.tsx`).

**State Management:**
- Student app: Postgres (`store.mjs`) plus session cookies.
- Workspace: DO SQLite (mailboxes and workspace state), R2 attachments, KV flags, 30-second in-isolate caches for graph health in `workers/index.ts`.
- Client: React state in panes. There is no global store.

## Key Abstractions

**`requireEmployeeMailbox` / `ParrotContext`:** Hono middleware in `apps/parrot/workers/lib/mailbox.ts`. It resolves the Clerk `sub` to an employee and mailbox DO stub. Every authenticated API route uses it.

**Durable Object stubs:** `getWorkspaceStub()` in `apps/parrot/workers/durableObject/workspace.ts`.

**SMS provider seam:** `apps/app/src/sms/provider.mjs` is selected by `SMS_PROVIDER`.

**Per-request MCP server:** `buildMcpHandler()` in `apps/startup/workers/server.ts`.

## Entry Points

- `apps/parrot/workers/app.ts`: Worker `fetch` plus `scheduled`. `wrangler.jsonc` main.
- `apps/startup/workers/app.ts`: Worker entry.
- `apps/app/src/server.mjs`: `npm run start:app`.
- `apps/marketing/src/main.tsx`: SPA entry (`index.html`).
- `apps/employers/src/main.tsx` and `apps/employers/functions/api/[[path]].ts`.
- `apps/email-worker/src/index.js`.
- `apps/mac-bridge/src/server.mjs`.
- `infra/graph-api/src/index.mjs` and `infra/startup-api/src/index.mjs`.

## Error Handling

**Strategy:** Fail soft at integration edges. Health checks distinguish proxy-up from DB-down. Auth failures return 401 JSON for `/api/*` and redirect to `/sign-in` otherwise.

**Patterns:**
- Parrot posts unhandled errors to Sentry through a minimal envelope POST (no SDK) in `apps/parrot/workers/index.ts`.
- `apps/app/src/server.mjs` wraps routes in try/catch and returns JSON via `http.mjs`.
- `/healthz` on Workspace (`apps/parrot/workers/index.ts`), the student app and the startup Worker are the liveness probes.

## Cross-Cutting Concerns

**Logging:** Cloudflare `observability.enabled` on Workers. `console` on Node.
**Validation:** `workers/lib/schemas.ts` in Workspace. Inline checks in `apps/app`.
**Safety:** Lakera screening in `apps/app/src/safety/screen.mjs` and `apps/parrot/workers/lib/safety.ts`. Events are stored through `/internal/safety-events` in `apps/app` and viewed at `/ops/safety` in Workspace.
**Authentication:**
- Workspace: Clerk employee instance, JWT verified via JWKS (`apps/parrot/workers/app.ts`). Mattermost SSO runs through `routes/oidc.ts`.
- Student: Clerk LinkedIn instance (`apps/app/src/auth.mjs`).
- Startup: Clerk employers instance for the portal. MCP uses a per-startup Bearer token.
- Service to service: shared secrets (`EMAIL_WORKER_SECRET`, `EMAIL_HANDOFF_SECRET`, and others). Secrets are never in git. They live in Infisical and wrangler or Fly secrets.

## Governance and CI

- `.github/workflows/ci.yml` jobs: `submission-gate`, `workspaces` (build marketing, build employers, verify app), `parrot` (vitest, advisory wrangler dry-run), `startup` (typecheck, node:test), `email-timeout-invariant` (`scripts/check-email-timeout-invariant.mjs`), `email-worker`.
- Phase submissions use `scripts/submit-phase.mjs`, which writes `submissions/<phase>.json`. `scripts/check-submission.mjs` validates them. `scripts/verify-v15-promotion.mjs` checks promotion.

---

*Architecture analysis: 2026-10-08*
