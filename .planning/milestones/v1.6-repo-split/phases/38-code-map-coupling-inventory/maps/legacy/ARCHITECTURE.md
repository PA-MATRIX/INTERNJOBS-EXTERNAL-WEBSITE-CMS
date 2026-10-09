<!-- generated from growthpods/Internjobs @ 99bcced93f997c8f09147c0cb18e132f8f3da751 on 2026-10-08 -->
# Architecture (legacy repo growthpods/Internjobs)

**Analysis Date:** 2026-10-08
**Source:** committed tree at HEAD `99bcced93f997c8f09147c0cb18e132f8f3da751`, read via `git show`. Local checkout `/Users/rajren/MayaOS/internjobs-ai`. Uncommitted working-tree changes and `.env*` files were not read.

## Architectural Context Loaded

- No locked sources were applied. This is a map of an external legacy repo, and the v1.6 repo-split planning docs were not part of this pass.
- Per memory `project-auth-architecture` (Clerk, two apps), this legacy repo uses Neon Auth and has no Clerk. That is a coupling-inventory fact, not a gap.

## Pattern Overview

**Overall:** Single Next.js 14 (App Router) app. A chat UI posts to one API route, which calls a Mastra router agent backed by Neon Postgres (Drizzle). It is an early prototype: one working endpoint, three agents, and a large schema that is mostly unused.

**Key Characteristics:**
- Single package `internjobs-ai` v0.1.0, with no monorepo and no workspaces.
- Next 14.1.4, React 18, TypeScript, and the `@/*` -> `./src/*` alias (`tsconfig.json`).
- AI orchestration uses `@mastra/core` (`latest`). Agents are declared with model strings such as `openai/gpt-4o-mini`.
- The agent runtime store is LibSQL, separate from the product Postgres.
- The product database is Neon Postgres over HTTP (`@neondatabase/serverless` + `drizzle-orm/neon-http`).
- The chat UI uses `@assistant-ui/react`, with `useEdgeRuntime({ api: '/api/chat' })`.
- Only `src/app/api/chat/route.ts` exists as a route. There are no auth routes, webhooks, or middleware in the committed tree. `memory-bank/systemPatterns.md` mentions "Auth Routes" and "Webhooks", but they are not implemented.

## Layers

**Frontend (UI):**
- Location: `src/app/` (`layout.tsx`, `page.tsx`, `providers.tsx`, `globals.css`), `src/components/`
- Contains: `chat/` (`ChatInterface`, `CustomThread`, `ChatHeader`, `ToolRenderer`, `SimpleToolRenderer`, `WalkingCat`), `tools/` (`JobsList`, `JobPosting`, `ApplicationStatus`, `CandidateList`, `ResumeEditor`), `assistant-ui/`, `ui/` (shadcn-style `button`, `tooltip`)
- Depends on: `@assistant-ui/react`, `@tanstack/react-query`, Radix, lucide, lottie, `@/lib/utils`
- Used by: `src/app/page.tsx` renders `ChatInterface` as the only page.
- The sidebar conversation list in `ChatInterface.tsx` is hard-coded sample data, not read from the database.

**API:**
- Location: `src/app/api/chat/route.ts` (POST, `maxDuration = 30`)
- Depends on: `@/lib/mastra`, `@/lib/services/memory.service`, `next/headers` cookies, `nanoid`
- Used by: the `Providers` edge runtime in `src/app/providers.tsx`

**Agent layer (Mastra):**
- Location: `src/lib/mastra/index.ts` (registry), `src/lib/agents/*.agent.ts`, `src/lib/tools/job-discovery.tool.ts`
- `routerAgent` (`gpt-4o-mini`) has `agents: { studentOnboardingAgent, jobDiscoveryAgent }`. It has no tools and no handoff logic beyond the instructions prompt.
- `jobDiscoveryAgent` (`gpt-4-turbo-preview`) uses `jobDiscoveryTool`. The tool queries `jobs` and `orgs` through Drizzle and returns `emitToolUI: 'JobsList'`.
- `studentOnboardingAgent` has no tools. `saveStudentProfile` and `saveStudentPreferences` are TODO stubs that only `console.log`.
- `src/lib/mastra/config.ts` is a second, empty `Mastra` instance (no agents). Nothing in the committed tree imports it; the route imports `@/lib/mastra`.
- `routerAgent` also exports `UserContextSchema`, `generateMemoryScope` and `requiresGuardrails`. `memory.service.ts` imports `generateMemoryScope` from the agent, so the service layer depends on the agent layer.
- The workflows and agents listed in comments (application, billing, trust and safety, and others) are not implemented.

**Service layer:**
- Location: `src/lib/services/memory.service.ts` (`MemoryService` singleton `memoryService`)
- Handles sessions, messages, `conversationContext` and `agentHandoffs`, persisted in Postgres via Drizzle.
- Depends on: `@/db`, `@/db/schema/conversations`, `@/lib/agents/router.agent`

**Auth:**
- Location: `src/lib/auth/neon-auth.ts` (`NeonAuth` static class)
- Neon Auth (Better Auth compatible) is called by URL and JWKS URL. Its `verifyToken` fetches the JWKS but does not verify the signature. It only base64-decodes the payload and checks `exp`.
- It builds its own `neon` + `drizzle` handle.
- Nothing in the committed tree imports it. The chat route does not authenticate.

**Data:**
- Location: `src/db/index.ts` (exports `db` and `schema`), `src/db/schema/*.ts`, `src/db/migrations/`
- Config: `drizzle.config.ts` (postgresql dialect, schema `./src/db/schema/*`, out `./src/db/migrations`, `strict: true`, loads env from `.env.local`)
- The schema is organised by domain, with FKs into `users` and `orgs`:

| File | Tables |
|---|---|
| `identity.ts` | `users`, `orgs`, `org_memberships`; enum `user_role` (student, employer, admin) |
| `jobs.ts` | `job_raw`, `jobs`, `job_sources`, `job_tags`, `job_dedupe_keys`; enums job type, status, source |
| `students.ts` | `profiles`, `resumes`, `portfolio_items` |
| `hiring.ts` | `applications`, `application_events`, `assignments`, `assignment_submissions`, `evaluations`, `certificates` |
| `moderation.ts` | `moderation_events`, `reports`, `refund_cases`, `org_verifications` |
| `billing.ts` | `billing_customers`, `plans`, `invoices`, `payments`, `job_promotions`, `usage_tracking` |
| `auth.ts` | `otp_requests`, `sessions`, `mfa_factors`, `mfa_challenges`, `auth_rate_limits` |
| `conversations.ts` | `chat_sessions`, `chat_messages`, `conversation_context`, `agent_handoffs` |

- Only `jobs`, `orgs` (via the tool) and the four conversation tables (via the memory service) are read or written by running code.
- `src/db/migrations/` holds a single migration, `0000_flippant_silvermane.sql`, plus its meta snapshot and journal.
- Two root scripts drop tables: `drop-tables.sql` and `drop-conversation-tables.js`.

## Data Flow

**Chat request:**
1. The browser `useEdgeRuntime` POSTs `{ messages, sessionId? }` to `/api/chat`.
2. The route takes the last message content (`content` or `text`).
3. Identity comes from cookies. If there is no `userId` cookie, it mints `temp_<nanoid>` and sets an httpOnly 30-day cookie. It sets a `sessionId` cookie for 24 hours. The user role is hard-coded to `'student'`.
4. `memoryService.getOrCreateSession(userId, 'student')` selects the active `chat_sessions` row or inserts one.
5. It stores the user message, then loads the last 5 history rows and the active context.
6. It builds the context messages: a system summary, the last 3 messages, and the current message.
7. It calls `mastra.getAgent('routerAgent').generate(contextMessages)`, which is non-streaming.
8. It stores the assistant reply. A regex on "my name is X" stores `profile` context with confidence 90.
9. It fakes streaming by splitting `result.text` on spaces and emitting `data: {type:'text-delta'}` chunks 50 ms apart with `setTimeout`, then a `metadata` chunk carrying `sessionId`, then `[DONE]`.
10. On failure it returns a JSON 500.

**Tool UI flow:** `jobDiscoveryTool` returns `queryId`, `filters`, `totalCount` and `emitToolUI: 'JobsList'`. `ToolRenderer` and `SimpleToolRenderer` map tool names to `src/components/tools/*`.

**State Management:** Server state is in Postgres (chat tables) and in the cookies above. Mastra storage is LibSQL (`MASTRA_DATABASE_URL`, default `file:./data/mastra.db`). Client state is React Query, zustand (declared as a dependency) and local `useState`.

## Entry Points

- `src/app/page.tsx` and `src/app/layout.tsx`: the UI.
- `src/app/api/chat/route.ts`: the only API.
- `src/lib/mastra/index.ts`: the standalone Mastra server, started by `npm run mastra:start` (`node -r tsx/cjs/api src/lib/mastra/index.ts`) on port 4111.

## Deployment Topology (`render.yaml`)

- Render Blueprint, region oregon, plan starter, with two web services:
  - `internjobs-ai-frontend` runs `npm install && npm run build` then `npm start`.
  - `internjobs-ai-mastra` runs `npm run mastra:start` on port 4111.
- The frontend service gets `MASTRA_SERVER_URL` from the mastra service's `hostport`. No source file reads `MASTRA_SERVER_URL`: the route imports the Mastra instance in-process rather than calling HTTP.
- The Neon database is external.
- Env var names declared: `NODE_ENV`, `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `BRIGHT_DATA_API_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` (`noreply@internjobs.ai`), `MASTRA_SERVER_URL`, `MASTRA_API_KEY`.
- `next.config.js` inlines `DATABASE_URL`, `NEON_AUTH_URL`, `OPENAI_API_KEY`, `MASTRA_API_KEY` and `BRIGHT_DATA_API_KEY` through `env:`. These end up in the bundle. The config also sets `serverExternalPackages` at top level, which Next 14.1 ignores (it belongs under `experimental`).
- Other env vars read in source: `MASTRA_DATABASE_URL`, `NEON_AUTH_JWKS_URL`.
- Stripe, Resend and Bright Data have env or dependency presence (`resend` is in `package.json`) but no committed code calls them.

## Coupling Notes for the Repo-Split Inventory

- The product Postgres schema (`src/db/schema`) is the main shared surface. Any new-stack tables that duplicate it (`users`, `orgs`, `jobs`, `profiles`, `applications`, and so on) should be treated as a separate lineage.
- No cross-repo imports exist. The repo is self-contained.
- Mastra is the only shared concept with the current stack's agent work, and there is no code reuse path.
- Auth differs from the current stack: Neon Auth with a JWT decode, versus Clerk.
- The chat route has no authentication. The user identity is a self-minted cookie.

## Error Handling

- The route uses a single try/catch that returns a 500 JSON `{ error, details }` with the error message. `details` leaks internal messages.
- `NeonAuth` returns `{ success, message }` result objects.
- The tool catches errors in `execute`.

## Cross-Cutting Concerns

- **Logging:** `console.log` and `console.error` only.
- **Validation:** zod schemas for tool input and output and for `UserContextSchema`. The request body is not validated.
- **Guardrails:** `requiresGuardrails(intent)` is a helper that nothing calls.

---

*Architecture analysis: 2026-10-08*
