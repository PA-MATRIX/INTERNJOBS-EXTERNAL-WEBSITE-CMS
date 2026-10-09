<!-- generated from growthpods/Internjobs @ 99bcced93f997c8f09147c0cb18e132f8f3da751 on 2026-10-08 -->
# Technology Stack (legacy repo growthpods/Internjobs)

**Analysis Date:** 2026-10-08
**Source:** committed tree only at `99bcced93f997c8f09147c0cb18e132f8f3da751` (single "Initial commit", 2025-12-21, 66 files). Read via `git cat-file`/`ls-tree`. Working-tree changes (4 modified files) and `.env*` contents were NOT read.
**Locked context (Step 0):** none consulted for this read-only legacy mapping beyond the task brief; no locked-rule conflicts asserted.

## Languages

**Primary:**
- TypeScript ^5 (`package.json`, `tsconfig.json`; path alias `@/*` -> `./src/*`) - app, agents, DB schema
**Secondary:**
- JavaScript - `next.config.js`, `postcss.config.js`, `tailwind.config.js`, `drop-conversation-tables.js` (one-off script)
- SQL - `drop-tables.sql`, `src/db/migrations/0000_flippant_silvermane.sql`

## Runtime

- Node.js 18+ (stated in `README.md` / `memory-bank/techContext.md`; no `.nvmrc`, no `engines` field)
- Package manager: npm; lockfile `package-lock.json` present (lockfileVersion 3)
- Package name `internjobs-ai` v0.1.0, private

## Frameworks

**Core:**
- Next.js 14.1.4 (App Router; `src/app/layout.tsx`, `src/app/page.tsx`, one API route `src/app/api/chat/route.ts`)
- React ^18.2, TanStack Query ^5.20.5 (`src/app/providers.tsx`), zustand ^5, @tanstack/react-virtual
- Chat UI: `@assistant-ui/react` ^0.5.100, `@assistant-ui/react-ai-sdk`, `@assistant-ui/react-markdown`; `useEdgeRuntime({ api: '/api/chat' })`
- AI agents: Mastra (`@mastra/core`, `@mastra/libsql`, `@mastra/memory`, all pinned `latest`, i.e. unpinned in manifest); Vercel `ai` ^5.0.116, `@ai-sdk/openai` ^0.0.39 (version-skewed vs `ai` 5)
- ORM: drizzle-orm ^0.45.1 + drizzle-kit ^0.30.0, driver `@neondatabase/serverless` ^0.9.0 (`drizzle-orm/neon-http`)
- Validation: zod ^3.22.4
**Styling/UI:** Tailwind ^3.4.1, PostCSS, autoprefixer, Radix (avatar/dialog/slot/tooltip), class-variance-authority, clsx, tailwind-merge, lucide-react, lottie (`@lottiefiles/dotlottie-*`, `lottie-react`; asset `public/cat-loader.json`)
**Testing:** Playwright ^1.57 (`playwright.config.ts`; e2e in `tests/e2e/chat-interface.spec.ts`; projects chromium, chrome, Mobile Chrome, firefox, webkit; webServer `npm run dev` on :3000; base URL override `PLAYWRIGHT_TEST_BASE_URL`)
**Build/Dev:** ESLint ^8 + `eslint-config-next` 14.2.10 (no `.eslintrc` committed), TypeScript, `drizzle-kit`

## Key Dependencies

**Critical:**
- `@mastra/core` (Agent, Mastra, createTool) - agent runtime; agents in `src/lib/agents/*.agent.ts`, registered in `src/lib/mastra/index.ts`
- `@neondatabase/serverless` + `drizzle-orm` - all persistence (`src/db/index.ts`)
- LLM models referenced as Mastra model strings: `openai/gpt-4o-mini` (`router.agent.ts`), `openai/gpt-4-turbo-preview` (`job-discovery.agent.ts`, `student-onboarding.agent.ts`)
**Declared but unused in committed `src/`:** `@supabase/supabase-js`, `resend`, `@mastra/memory`, `ai`, `@ai-sdk/openai` (no imports found in `src/`)

## Configuration

- Env via `.env.local` (git-ignored: `.env*.local`); template `.env.local.example` is committed. `drizzle.config.ts` loads `.env.local` through `dotenv` (note: `dotenv` is not in `package.json` dependencies).
- `next.config.js` copies `DATABASE_URL`, `NEON_AUTH_URL`, `OPENAI_API_KEY`, `MASTRA_API_KEY`, `BRIGHT_DATA_API_KEY` into the Next `env` block (inlines at build; server keys land in the bundle config). Uses `serverExternalPackages` (a Next 15 key; Next 14.1.4 expects `experimental.serverComponentsExternalPackages`).
- Drizzle: schema `./src/db/schema/*`, out `./src/db/migrations`, dialect postgresql, strict.
- Scripts: `dev`, `build`, `start`, `lint`, `db:push|studio|generate`, `mastra:start` (`node -r tsx/cjs/api src/lib/mastra/index.ts`; `tsx` not declared), `test*` (Playwright).
- Mastra storage: LibSQL, `MASTRA_DATABASE_URL` or `file:./data/mastra.db` (`src/lib/mastra/index.ts`); a second unused `src/lib/mastra/config.ts` uses `DATABASE_URL || file:mastra.db`. `data/mastra.db-shm` and `-wal` SQLite sidecar files are committed.

## Data model (Postgres, Drizzle)

Schemas in `src/db/schema/{auth,billing,conversations,hiring,identity,jobs,moderation,students}.ts`; single migration `src/db/migrations/0000_flippant_silvermane.sql` creates 36 tables (auth: otp_requests, mfa_*, sessions, auth_rate_limits; billing: billing_customers, invoices, payments, plans, usage_tracking, job_promotions; conversations: chat_sessions, chat_messages, conversation_context, agent_handoffs; hiring: applications, assignments, evaluations, certificates...; identity: users, orgs, org_memberships; jobs: jobs, job_raw, job_sources, job_tags, job_dedupe_keys; students: profiles, resumes, portfolio_items; moderation: reports, refund_cases, org_verifications, moderation_events).

## Platform Requirements

- Development: Node 18+, Neon Postgres URL, OpenAI key, `npm run dev` (:3000), `npm run mastra:start` (:4111)
- Production (intended): Render Blueprint `render.yaml` - two web services (`internjobs-ai-frontend` Next.js, `internjobs-ai-mastra` on port 4111), region oregon, plan starter, `npm install && npm run build` / `npm start`. No evidence of an actual deployment in the tree.

---
*Stack analysis: 2026-10-08*
