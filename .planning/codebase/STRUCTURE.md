<!-- generated from internjobs-cms @ d1658aa5ba0ce397788cd79c34b425c459eaa0da on 2026-10-08 -->
# Codebase Structure

**Analysis Date:** 2026-10-08
**Mapped commit:** `d1658aa5ba0ce397788cd79c34b425c459eaa0da` (from `git ls-tree`; untracked `apps/canary-monitor/` is excluded)

## Directory Layout

```
internjobs-cms/
├── apps/
│   ├── marketing/        # Marketing CMS site (Vite + React, Cloudflare Pages)
│   ├── app/              # Student app (Node ESM on Fly)
│   ├── parrot/           # Workspace (employee-facing; CF Worker + React Router 7)
│   ├── startup/          # Startup MCP Worker (mcp.internjobs.ai)
│   ├── employers/        # Startup/employer portal (Vite SPA + Pages Functions)
│   ├── email-worker/     # CF Email Worker ingest/router
│   ├── mattermost-proxy/ # CF Worker, chat.internjobs.ai CSP-rewriting proxy
│   ├── parrot-mattermost/# Mattermost Fly deploy (Dockerfile, fly.toml)
│   ├── mac-bridge/       # BlueBubbles iMessage bridge on a Mac mini
│   └── agentic-inbox/    # Upstream Agentic Inbox fork (Email tab target)
├── packages/shared/      # @internjobs/shared TypeScript types
├── infra/                # Fly services and ops docs
│   ├── graph-api/        # HTTP proxy to FalkorDB
│   ├── startup-api/      # Startup data API
│   ├── student-db/       # Postgres on Fly
│   ├── mattermost-db/    # Mattermost Postgres on Fly (MIGRATION.md)
│   ├── falkordb/         # FalkorDB on Fly
│   └── *.md              # NEON-EXIT, LAKERA-PRICING, LAKERA-VERIFY-LIVE
├── scripts/              # Repo-level Node tooling (phase submission, CI checks, smoke)
├── docs/                 # VOICE_AGENT_CONFIG.md
├── .github/workflows/ci.yml
├── .planning/            # RRR state: milestones, workstreams, codebase maps
├── package.json          # Root npm workspaces
├── package-lock.json
├── README.md
└── TEAM-WORKFLOW.md
```

## Directory Purposes

**`apps/marketing/`:**
- Contains: `src/App.tsx`, `src/main.tsx`, `src/components/StartupAccessSection.tsx`, `src/styles.css`, `public/` (logos, images, `_redirects`), `scripts/verify-*.mjs` (brand, site-assets and phone-animation checks), `wrangler.toml`, `tailwind.config.ts`, `vite.config.ts`.
- Do not start a Cleo-style animation overhaul. A previous attempt was reverted by the owner.

**`apps/app/`:**
- `src/`: server and domain modules. Subfolders are `email/`, `memory/`, `onboarding/`, `routes/`, `safety/`, `sms/`, `storage/`, `workflows/`.
- `db/migrations/`: numbered SQL files, `0001` to `0014` (no `0006`; `0003b_email_inbound.sql` is a suffix variant).
- `scripts/`: `migrate.mjs`, `verify-app.mjs`, `smoke-*.mjs`.
- `docs/`, `test/` (runbooks and verification markdown), `Dockerfile`, `fly.toml`, `.env.example`.

**`apps/parrot/` (Workspace):**
- `app/`: UI. `routes.ts` (route table), `root.tsx`, `entry.server.tsx`, `routes/*.tsx`, `components/` (with `crosspane/` and `icons/`), `lib/`.
- `workers/`: `app.ts` (Worker entry and auth), `index.ts` (API), `routes/`, `lib/`, `durableObject/`, `db/schema.ts`, `types.ts`.
- `workers/tests/`: vitest suites in `lib/` and `routes/`, plus `helpers.ts` and `__mocks__/cloudflare-workers.ts`.
- `shared/`: code used by both UI and Worker.
- `public/` (icons, `sw.js`, `ringtone.wav`), `scripts/smoke-parrot-graph.mjs`, `docs/`, `test/` (runbooks), `.dev.vars.example`.
- Config: `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `react-router.config.ts`, `tsconfig*.json`.

**`apps/startup/`:**
- `workers/app.ts` (Hono root), `workers/server.ts` (MCP builder), `workers/routes/` (`admin`, `api`, `email`, `scheduled`, `telnyx`, `voice`), `workers/lib/`, `workers/tools/`, `workers/types.ts`. Tests sit next to the source (`*.test.ts`). Also `CHANNELS.md` and `wrangler.jsonc`.

**`apps/employers/`:**
- `src/pages/` (`Dashboard`, `RoleDetail`, `RolesNew`, `SignIn`, `ThreadView`, `CandidateDetail`), `src/components/` (with `ui/`), `src/lib/api.ts`, `functions/api/[[path]].ts` (Pages Functions proxy), `e2e/founder-flow.spec.ts` (Playwright).

**`apps/email-worker/`:** `src/index.js`, `src/constants.js`, `src/index.test.js`, `wrangler.toml`.

**`apps/mac-bridge/`:** `src/` (`server.mjs`, `listener.mjs`, `bluebubbles-client.mjs`, `config.mjs`, `security.mjs`), `launchd/` plist, `setup.sh`, `.env.example`.

**`apps/mattermost-proxy/`:** `workers/index.ts`, `wrangler.jsonc`.

**`apps/agentic-inbox/`:** upstream fork with `app/`, `workers/`, `shared/`. Change it only when the change is intentional (Parrot forks its config).

**`infra/`:** each service has a `Dockerfile`, `fly.toml`, `src/index.mjs` and `smoke.mjs` where applicable.

**`scripts/`:** `submit-phase.mjs`, `check-submission.mjs`, `check-email-timeout-invariant.mjs`, `verify-v15-promotion.mjs` (+ `.test.mjs`), `33-clerk-restrictions-config.mjs`, `26-kgraph-*.mjs`.

**`.planning/`:** `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `WORKSTREAMS.md`, `team-mode.json`, `milestones/<version>/`, `workstreams/team-cms` and `team-workspace`, `codebase/`.

## Key File Locations

**Entry Points:**
- `apps/parrot/workers/app.ts`, `apps/startup/workers/app.ts`, `apps/app/src/server.mjs`, `apps/marketing/src/main.tsx`, `apps/employers/src/main.tsx`, `apps/email-worker/src/index.js`, `apps/mac-bridge/src/server.mjs`

**Configuration:**
- `package.json` (workspaces), `apps/parrot/wrangler.jsonc`, `apps/startup/wrangler.jsonc`, `apps/mattermost-proxy/wrangler.jsonc`, `apps/email-worker/wrangler.toml`, `apps/marketing/wrangler.toml`, `apps/app/fly.toml`, `infra/*/fly.toml`
- Env templates only: `apps/app/.env.example`, `apps/parrot/.dev.vars.example`, `apps/mac-bridge/.env.example`, `apps/employers/.env.example`

**Core Logic:**
- Workspace API: `apps/parrot/workers/index.ts`
- Mattermost bridge: `apps/parrot/workers/lib/mattermost.ts`, `apps/parrot/workers/lib/mm-ws-proxy.ts`
- Student request routing: `apps/app/src/server.mjs`
- Student agent: `apps/app/src/mastra.mjs`, `apps/app/src/workflows/`
- DB schema: `apps/app/db/migrations/`

**Testing:**
- `apps/parrot/workers/tests/` (vitest)
- `apps/startup/workers/**/*.test.ts` (node:test via tsx)
- `apps/app/src/**/*.test.mjs` (co-located)
- `apps/email-worker/src/index.test.js`
- `apps/employers/e2e/` (Playwright)
- `scripts/verify-v15-promotion.test.mjs`

## Naming Conventions

**Files:**
- Node ESM modules in `apps/app`, `apps/mac-bridge`, `infra/*`: lowercase kebab-case `.mjs` (`student-inbound.mjs`).
- Workers (TS) in `apps/parrot/workers` and `apps/startup/workers`: kebab-case, or camelCase in startup (`resolveChannelLink.ts`, `workEmail.ts`).
- React components: PascalCase `.tsx` (`WorkspaceShell.tsx`).
- Workspace route files: lowercase, dot-separated for nesting (`admin.invite.tsx`, `ops.safety.tsx`).
- Tests: `*.test.ts` or `*.test.mjs`, co-located in `apps/app` and `apps/startup`, and under `workers/tests/` mirroring `lib/` and `routes/` in `apps/parrot`.
- SQL migrations: `NNNN_vX_Y_description.sql`.
- Phase scripts: `NN-description.mjs` where NN is the phase number.

**Directories:** lowercase, with `durableObject/` camelCase in Workspace.

## Where to Add New Code

**New Workspace API endpoint:** a Hono sub-router in `apps/parrot/workers/routes/<name>.ts`, mounted in `apps/parrot/workers/index.ts` behind `requireEmployeeMailbox`. Put integration logic in `apps/parrot/workers/lib/`. Tests go in `apps/parrot/workers/tests/routes/` or `tests/lib/`.

**New Workspace page or pane:** add a route file in `apps/parrot/app/routes/`, register it in `apps/parrot/app/routes.ts`, and put UI in `apps/parrot/app/components/`.

**New student-app route or webhook:** a branch in `apps/app/src/server.mjs`, or a handler module under `apps/app/src/routes/`. Domain logic goes in `apps/app/src/<area>/`, with a co-located `*.test.mjs`.

**New student DB change:** the next migration file in `apps/app/db/migrations/` (use `0015_...`).

**New startup MCP tool:** `apps/startup/workers/tools/<name>.ts`, registered in `apps/startup/workers/server.ts`. HTTP routes go in `apps/startup/workers/routes/`.

**New marketing section:** `apps/marketing/src/components/`, composed in `apps/marketing/src/App.tsx`. Static assets go in `apps/marketing/public/`.

**New shared type:** `packages/shared/src/index.ts`. Parrot and startup do not consume the workspace package, so duplicate or add a local type for them.

**New Fly service:** `infra/<name>/` with `Dockerfile` and `fly.toml`.

**New repo-level script:** `scripts/`.

## Special Directories

**`.planning/`:** RRR state and phase artifacts, committed. `.planning/codebase/` holds these maps.
**`apps/*/dist`, `node_modules/`:** generated, not committed.
**`submissions/`:** per-phase submission JSON written by `scripts/submit-phase.mjs`.
**`apps/canary-monitor/`:** untracked at this commit and not part of the mapped tree.

---

*Structure analysis: 2026-10-08*
