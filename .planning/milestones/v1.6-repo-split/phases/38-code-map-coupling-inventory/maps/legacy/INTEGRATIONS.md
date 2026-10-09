<!-- generated from growthpods/Internjobs @ 99bcced93f997c8f09147c0cb18e132f8f3da751 on 2026-10-08 -->
# External Integrations (legacy repo growthpods/Internjobs)

**Analysis Date:** 2026-10-08
**Source:** committed tree at `99bcced93f997c8f09147c0cb18e132f8f3da751` only. No secret values read or recorded; env var NAMES only.

Legend: ACTIVE = imported/called in committed `src/`; DECLARED = in manifest/env/render only; SCHEMA-ONLY = columns exist, no code.

## APIs & External Services

**LLM:**
- OpenAI - ACTIVE via Mastra model strings (`openai/gpt-4o-mini`, `openai/gpt-4-turbo-preview`) in `src/lib/agents/router.agent.ts`, `job-discovery.agent.ts`, `student-onboarding.agent.ts`. Auth: `OPENAI_API_KEY`. Direct provider; no AI Gateway.
- Chat endpoint `src/app/api/chat/route.ts` calls `mastra.getAgent('routerAgent').generate(...)` then emits a synthetic SSE stream (chunked text, not true streaming) to assistant-ui.

**Agent runtime:**
- Mastra - ACTIVE in-process (`src/lib/mastra/index.ts`); also a separate Mastra server on :4111 (`npm run mastra:start`, `MASTRA_SERVER_URL`/`MASTRA_API_KEY` in `render.yaml`) but the chat route imports Mastra directly and does not call that URL.

**Neon Auth:**
- `src/lib/auth/neon-auth.ts` (class `NeonAuth`) - builds sign-in URLs (`email|google|github`) from `NEON_AUTH_URL`, fetches `NEON_AUTH_JWKS_URL`, parses JWT manually (no signature verification library). Env: `NEON_AUTH_URL`, `NEON_AUTH_JWKS_URL`; example file also lists `NEXT_PUBLIC_NEON_AUTH_URL`, `NEON_AUTH_SERVICE_ROLE_KEY`. Not wired into the chat route (it uses an unauthenticated `temp_<nanoid>` userId cookie).

**Job scraping - Bright Data:** DECLARED only (`BRIGHT_DATA_API_KEY` in `next.config.js`, `render.yaml`, `.env.local.example`); no call site in `src/`. Related tables `job_sources`, `job_raw`, `job_dedupe_keys` (SCHEMA-ONLY).

**Payments - Stripe:** DECLARED/SCHEMA-ONLY. Env `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`; columns `stripe_customer_id`, `stripe_invoice_id`, `stripe_payment_intent_id`, `stripe_refund_id` in `src/db/migrations/0000_flippant_silvermane.sql` / `src/db/schema/billing.ts`. No `stripe` package, no webhook route.

**Email:** `resend` ^3.2.0 in `package.json` and `RESEND_API_KEY`/`EMAIL_FROM` (`noreply@internjobs.ai`) in `render.yaml` - DECLARED only. `.env.local.example` instead lists SMTP vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). No send code.

**Supabase:** `@supabase/supabase-js` in `package.json`; `memory-bank/techContext.md` mentions Supabase MCP. No use in `src/`. DECLARED only.

## Data Storage

- Postgres on Neon: ACTIVE. Env `DATABASE_URL` (also `DIRECT_URL` in `render.yaml`). Client `@neondatabase/serverless` `neon()` + `drizzle-orm/neon-http` in `src/db/index.ts` and `src/lib/auth/neon-auth.ts` (second independent connection). Used by `src/lib/tools/job-discovery.tool.ts` and `src/lib/services/memory.service.ts` (chat sessions/messages/context/handoffs).
- LibSQL/SQLite for Mastra state: `MASTRA_DATABASE_URL` or local `file:./data/mastra.db` (`src/lib/mastra/index.ts`). On Render (ephemeral FS) this would not persist.
- File storage: none. Caching: none (client-side TanStack Query only).
- Dangling client call: `src/components/tools/JobsList.tsx` does `fetch('/api/jobs/search')`; no such route exists in the committed tree (only `/api/chat`).

## Authentication & Identity

- Intended: Neon Auth (Better Auth compatible) with OTP/MFA tables in `src/db/schema/auth.ts`. Actual runtime: anonymous cookie identity (`userId=temp_<nanoid>`, `sessionId`, httpOnly, 30d/24h) in `src/app/api/chat/route.ts`. Roles student|employer|admin modelled in `router.agent.ts` `UserContextSchema`.

## Monitoring & Observability

- None. Logging via `console` only. No error tracker.

## CI/CD & Deployment

- Hosting: Render Blueprint `render.yaml` (frontend + Mastra service); no GitHub Actions or other CI committed.
- Playwright CI toggles (`process.env.CI`) exist but no pipeline.

## Environment Configuration

**Env var names referenced in committed code:** `DATABASE_URL`, `MASTRA_DATABASE_URL`, `NEON_AUTH_URL`, `NEON_AUTH_JWKS_URL`, `OPENAI_API_KEY`, `MASTRA_API_KEY`, `BRIGHT_DATA_API_KEY`, `NODE_ENV`, `CI`, `PLAYWRIGHT_TEST_BASE_URL`.
**Additional names only in `render.yaml` / `.env.local.example`:** `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `MASTRA_SERVER_URL`, `STRIPE_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `PORT`, `HOST`, `NEXT_PUBLIC_NEON_AUTH_URL`, `NEON_AUTH_SERVICE_ROLE_KEY`, `SMTP_*`, `NEXT_PUBLIC_APP_URL`.
**Secrets location:** `.env.local` (git-ignored, not read) locally; Render dashboard (`sync: false`) intended for production.

## Webhooks & Callbacks

- Incoming: none (no Stripe/other webhook routes). Only API route: `POST /api/chat`.
- Outgoing: none beyond OpenAI (via Mastra) and the unused Neon Auth JWKS fetch.

## Coupling notes for repo split

- Schema overlap candidates with the new repo: users/orgs/jobs/applications/chat tables (36-table single migration) - no migration history beyond `0000`.
- No shared package or imports from the CMS monorepo; integration surface is the Neon DB, OpenAI, and Render only.

---
*Integration audit: 2026-10-08*
