<!-- generated from internjobs-cms @ d1658aa5ba0ce397788cd79c34b425c459eaa0da on 2026-10-08 -->
# Technology Stack

**Analysis Date:** 2026-10-08
**Source:** merged main `d1658aa5ba0ce397788cd79c34b425c459eaa0da` (read via `git show`/`git ls-tree`; untracked `apps/canary-monitor/` excluded).
**Locked sources:** No `.planning/NORTH-STAR.md`, `AGENTS.md` or `CLAUDE.md` in the repo. Global memory rules apply (two Clerk apps, LLM via AI Gateway for Parrot, Workspace deploy = full replace from main). See INTEGRATIONS.md.

## Languages

**Primary:**
- TypeScript ^5.6-5.8 - `apps/marketing`, `apps/employers`, `apps/parrot`, `apps/startup`, `apps/agentic-inbox`, `packages/shared/src/index.ts`
- JavaScript (ESM `.mjs`, `"type": "module"`) - `apps/app/src/*.mjs` (student app), `apps/mac-bridge/src`, `apps/email-worker/src/index.js`, `infra/graph-api/src/index.mjs`, `infra/startup-api/src/index.mjs`, `scripts/*.mjs`

**Secondary:**
- SQL - `apps/app/db/migrations/0001..0014_*.sql` (Postgres + pgvector)
- Shell/Docker/TOML - `apps/mac-bridge/setup.sh`, `infra/*/Dockerfile`, `infra/*/fly.toml`, `infra/falkordb/entrypoint.sh`

## Runtime

- Node >=22 (`engines` in `apps/app`, `apps/email-worker`, `apps/mac-bridge`; CI uses Node 22; Docker `node:22-slim` for `infra/graph-api`, `infra/startup-api`)
- Cloudflare Workers (`nodejs_compat`) for `apps/parrot`, `apps/startup`, `apps/agentic-inbox`, `apps/email-worker`, `apps/mattermost-proxy`
- Cloudflare Pages for `apps/marketing` (`apps/marketing/wrangler.toml`, project `internjobs-ai`) and `apps/employers` (Pages Functions in `apps/employers/functions/api/[[path]].ts`, project `internjobs-employers`)
- Fly.io (region `ord`) for `apps/app`, `infra/*`, `apps/parrot-mattermost`
- macOS launchd for `apps/mac-bridge` (`apps/mac-bridge/launchd/ai.internjobs.mac-bridge.plist`)

**Package manager:** npm. Lockfile `package-lock.json` present at root; per-package lockfiles in `apps/startup`, `infra/graph-api`, `infra/startup-api`.
**Workspaces** (root `package.json`): `apps/*`, `packages/*`, EXCLUDING `apps/agentic-inbox`, `apps/parrot`, `apps/startup` (these install independently with their own `npm ci`). Effective workspaces: marketing, app, employers, email-worker, mac-bridge, mattermost-proxy, `packages/shared`.

## Frameworks

**Core:**
- Marketing CMS (`apps/marketing`): React ^18.3, Vite ^8, Tailwind ^3.4, framer-motion ^12, lucide-react ^0.468, simple-icons
- Employers SPA (`apps/employers`): React ^18.3, react-router-dom ^6, Vite ^8, Tailwind ^3.4, `@clerk/clerk-react` ^5, `svix` ^1.42, `jose` ^6
- Student app (`apps/app`): plain Node HTTP server (`apps/app/src/server.mjs`, no web framework); Mastra agents (`@mastra/core` 1.35.0, `@mastra/memory` 1.18.2, `@mastra/pg` 1.11.0); `@clerk/backend` 3.4.9; `pg` ^8.20; `falkordb` 6.6.2; `@aws-sdk/client-s3` + presigner 3.1048.0 (R2 via S3 API); `qrcode`; `spectrum-ts` ^1.5
- Workspace (`apps/parrot`): React 19 + react-router ^7.5 (framework mode, `react-router build`), `@cloudflare/vite-plugin`, Vite ^6, Tailwind ^4 (`@tailwindcss/vite`), Hono ^4.7 Worker API, Drizzle ORM ^0.45 (DO SQLite, `apps/parrot/workers/db/schema.ts`), TipTap 3.20.2 (pinned via `overrides`), `@tanstack/react-query` ^5, Daily (`@daily-co/daily-js` ^0.87, `daily-react`), `@clerk/react-router` ^3.2, `@clerk/backend` 3.4.9, `jose`, `zod` ^3.25, `postal-mime`, `dompurify`, `falkordb` ^6.6, three/vanta
- Startup MCP (`apps/startup`): Hono ^4.7 on Workers, `@modelcontextprotocol/sdk` 1.26.0, `agents` ^0.7.9, `postal-mime`, `zod`
- Agentic Inbox (`apps/agentic-inbox`): upstream Cloudflare fork; `agents` ^0.7, `ai` ^6, `@ai-sdk/react`, `workers-ai-provider`, `@cloudflare/kumo`, zustand, react-markdown
- Graph API (`infra/graph-api`) and Startup API (`infra/startup-api`): Hono + `@hono/node-server`; `falkordb` 6.6.2 / `pg` ^8.13

**Testing:**
- Vitest ^3.2 - `apps/parrot` (`npm test` = `vitest run`, config `apps/parrot/vitest.config.ts`, tests in `apps/parrot/workers/tests/**`)
- `node --test` - `apps/app` (`npm run test:auth` -> `src/auth.test.mjs`; other `*.test.mjs` beside source), `apps/email-worker` (`src/*.test.js`), `scripts/verify-v15-promotion.test.mjs`
- `tsx --test` - `apps/startup`; `tsx "functions/api/[[path]].test.ts"` - `apps/employers`
- Playwright ^1.60 - `apps/employers/playwright.config.ts` (`test:e2e`)

**Build/Dev:**
- Wrangler ^4.x (`4.74`-`4.92` ranges) - deploy for Workers/Pages
- `tsc -b` + `vite build` (marketing, employers); `react-router typegen` + `wrangler types` + `tsc -b` for typecheck (parrot, agentic-inbox)
- Fly CLI + Dockerfiles for Node services

## Key Dependencies

**Critical:**
- `@clerk/backend` 3.4.9 (pinned, in `apps/app` and `apps/parrot`) - session JWT verification
- `@mastra/*` 1.x - student agent core, memory and Postgres/pgvector store (`apps/app/src/mastra.mjs`)
- `falkordb` 6.6.2 - knowledge graph client (app, parrot, graph-api)
- `hono` ^4.7 - HTTP layer for every Worker and Fly API
- TipTap 3.20.2 - `overrides` block pins all `@tiptap/*` in `apps/parrot` and `apps/agentic-inbox`; keep in lockstep

**Infrastructure images:**
- `pgvector/pgvector:pg17` (`infra/student-db`), `postgres:17` (`infra/mattermost-db`), `falkordb/falkordb:latest` (`infra/falkordb`), `mattermost/mattermost-team-edition:11.6.2` (`apps/parrot-mattermost`)

## Configuration

**Environment:**
- Student app: env vars read in `apps/app/src/config.mjs`; template `apps/app/.env.example` (never read/commit real `.env*`). Secrets live in Infisical (`.infisical.json`, default env `prod`) and are pushed to Fly/Wrangler secrets.
- Workers: non-secret `vars` in each `wrangler.jsonc`/`wrangler.toml`; secrets via `wrangler secret put`.
- Feature flags: KV `PARROT_FEATURE_FLAGS` (Parrot); `WAITLIST_MODE`, `SMS_PROVIDER`, `LLM_PROVIDER`, `EMBED_PROVIDER`, `OUTBOUND_DRY_RUN` env toggles (student app; `WAITLIST_MODE` defaults true unless set to `"false"`).

**Build:**
- `apps/marketing/{tsconfig*.json,wrangler.toml}`, `apps/parrot/{wrangler.jsonc,tsconfig*.json,vitest.config.ts}`, `apps/startup/{wrangler.jsonc,tsconfig.json}`, `apps/agentic-inbox/wrangler.jsonc`, `apps/email-worker/wrangler.toml`, `apps/mattermost-proxy/wrangler.jsonc`, `infra/*/fly.toml`, `apps/app/fly.toml`
- Root scripts (`package.json`): `build` = marketing + app verify; `verify`; `deploy:pages`; `smoke:parrot-graph`
- `apps/app` "build" is `node scripts/verify-app.mjs` (no bundling)

**Cloudflare Worker bindings summary:**
- `apps/parrot` (`internjobs-parrot`, route `workspace.internjobs.ai`): DOs `EMPLOYEE_MAILBOX`/`EmployeeMailboxDO`, `WORKSPACE`/`WorkspaceDO` (SQLite migrations v1, v2); R2 `BUCKET` = `internjobs-parrot-attachments`; KV `PARROT_FEATURE_FLAGS`; `send_email` `EMAIL`; cron `*/5 * * * *`; models `KIMI_MODEL`=`@cf/moonshotai/kimi-k2.6`, `PARROT_FAST_MODEL`=`@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- `apps/startup` (`internjobs-startup-mcp`, route `mcp.internjobs.ai`): `AI`, `send_email` `EMAIL`, KV `TOUCHBASE_CURSORS`, R2 `VOICE_AUDIT` = `internjobs-startup-call-audit`, cron `0 14 * * 1`
- `apps/agentic-inbox` (`internjobs-agentic-inbox`): DOs `MAILBOX`, `EMAIL_AGENT`, `EMAIL_MCP`; R2 `BUCKET` = `internjobs-agentic-inbox`; `AI`; `send_email`
- `apps/email-worker` (`internjobs-email-ingest`): plain vars only
- `apps/mattermost-proxy` (`internjobs-mattermost-proxy`, route `chat.internjobs.ai`)

## CI

- `.github/workflows/ci.yml`: on PR to `main`/`integration/**` and push to `integration/**`. Jobs: submission gate (`scripts/check-submission.mjs`), root workspaces (build marketing, build employers, verify app), parrot (typecheck, vitest, build, advisory wrangler dry-run), startup (typecheck, tests, dry-run), `scripts/check-email-timeout-invariant.mjs`, email-worker (check + tests). Node 22.

## Platform Requirements

**Development:** Node 22, npm, Wrangler, Fly CLI, Docker (infra images), Infisical CLI. Mac mini with BlueBubbles for `apps/mac-bridge`.

**Production:** Cloudflare (Workers, Pages, R2, KV, DO, Workers AI, AI Gateway, Email Routing) + Fly.io (`ord`) + macOS host for iMessage bridge.

---

*Stack analysis: 2026-10-08*
