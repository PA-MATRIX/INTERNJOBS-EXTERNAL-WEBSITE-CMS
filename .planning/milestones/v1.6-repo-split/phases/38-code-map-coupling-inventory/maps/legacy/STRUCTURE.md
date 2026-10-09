<!-- generated from growthpods/Internjobs @ 99bcced93f997c8f09147c0cb18e132f8f3da751 on 2026-10-08 -->
# Codebase Structure (legacy repo growthpods/Internjobs)

**Analysis Date:** 2026-10-08
**Source:** committed tree at HEAD `99bcced93f997c8f09147c0cb18e132f8f3da751`. `playwright-report/`, `test-results*` and `.env*` were excluded and not read.

## Directory Layout

```
internjobs-ai/
├── src/
│   ├── app/                     # Next App Router (layout, page, providers, globals.css)
│   │   └── api/chat/route.ts    # the only API route
│   ├── components/
│   │   ├── assistant-ui/        # thread.tsx, tooltip-icon-button.tsx
│   │   ├── chat/                # ChatInterface, CustomThread, ChatHeader, ToolRenderer, SimpleToolRenderer, WalkingCat
│   │   ├── tools/               # JobsList, JobPosting, ApplicationStatus, CandidateList, ResumeEditor
│   │   └── ui/                  # button.tsx, tooltip.tsx
│   ├── db/
│   │   ├── index.ts             # neon-http drizzle client
│   │   ├── schema/              # identity, jobs, students, hiring, moderation, billing, auth, conversations (+ index.ts)
│   │   └── migrations/          # 0000_flippant_silvermane.sql, meta/
│   └── lib/
│       ├── agents/              # router, job-discovery, student-onboarding (*.agent.ts)
│       ├── auth/neon-auth.ts
│       ├── mastra/              # index.ts (registry), config.ts (empty duplicate)
│       ├── services/memory.service.ts
│       ├── tools/job-discovery.tool.ts
│       └── utils.ts
├── tests/e2e/                   # one Playwright spec: chat-interface.spec.ts
├── memory-bank/                 # 6 markdown notes (projectbrief, productContext, techContext, systemPatterns, activeContext, progress)
├── public/cat-loader.json       # lottie asset
├── data/                        # mastra.db-wal, mastra.db-shm (committed SQLite artifacts)
├── drop-tables.sql, drop-conversation-tables.js
├── drizzle.config.ts, next.config.js, tailwind.config.js, postcss.config.js
├── playwright.config.ts, tsconfig.json
├── render.yaml                  # 2 Render services (frontend, mastra)
├── package.json, package-lock.json, README.md, .gitignore
```

The committed tree holds 65 files, excluding the paths named above. It has no `middleware.ts`, no CI workflows, no `.env.example`, no unit tests, and no `src/app/api` routes other than chat.

## Directory Purposes

**`src/app/`:** Routing and providers. `providers.tsx` wires React Query and the assistant-ui edge runtime to `/api/chat`. `layout.tsx` is the root layout.

**`src/components/chat/`:** The chat shell and tool-UI dispatch. `ChatInterface.tsx` holds the sidebar, a hard-coded conversation list, and registrations through `makeAssistantToolUI`.

**`src/components/tools/`:** The generative-UI components for the tool outputs (jobs, candidates, resume, application status). Only `JobsList` has a backing agent tool.

**`src/db/schema/`:** Drizzle table definitions, one file per domain, re-exported from `index.ts`. 8 domain files with about 40 tables.

**`src/lib/agents/`:** Mastra `Agent` definitions, one `*.agent.ts` per agent, with the prompt text inline.

**`src/lib/tools/`:** Mastra `createTool` definitions, named `*.tool.ts`.

**`src/lib/services/`:** Persistence-facing services, named `*.service.ts`.

## Key File Locations

**Entry points:** `src/app/page.tsx`, `src/app/api/chat/route.ts`, `src/lib/mastra/index.ts`
**Configuration:** `next.config.js`, `drizzle.config.ts`, `tsconfig.json` (alias `@/*` -> `./src/*`), `tailwind.config.js`, `playwright.config.ts`, `render.yaml`
**Core logic:** `src/lib/agents/router.agent.ts`, `src/lib/services/memory.service.ts`, `src/lib/tools/job-discovery.tool.ts`, `src/db/schema/*`
**Testing:** `tests/e2e/chat-interface.spec.ts`. Playwright runs `npm run dev`, with base URL `PLAYWRIGHT_TEST_BASE_URL` or `http://localhost:3000`, and projects `chrome` and `chromium`.
**Docs and planning:** `memory-bank/*.md`, `README.md`

## Scripts (`package.json`)

`dev`, `build`, `start`, `lint`, `db:push`, `db:studio`, `db:generate` (drizzle-kit), `mastra:start`, and `test*` (Playwright variants).

## Key Dependencies

next 14.1.4, react 18, `@mastra/core`/`libsql`/`memory` (`latest`), `ai` ^5, `@ai-sdk/openai` ^0.0.39, `@assistant-ui/react*`, `drizzle-orm` ^0.45, `@neondatabase/serverless`, `@supabase/supabase-js` (declared, not imported in the committed `src/`), `resend` (declared, unused), `zustand` and `@tanstack/react-query`, tailwind 3, Playwright.

## Naming Conventions

**Files:**
- Agents `<name>.agent.ts`, tools `<name>.tool.ts`, services `<name>.service.ts`, all kebab-case.
- React components PascalCase (`ChatInterface.tsx`), except shadcn `ui/` files, which are lowercase.
- Schema files named by domain, lowercase.

**Directories:** lowercase, with plural for `agents`, `tools` and `services`.

## Where to Add New Code (if work were continued here)

- New agent: `src/lib/agents/<name>.agent.ts`, registered in `src/lib/mastra/index.ts` (not `config.ts`).
- New tool: `src/lib/tools/<name>.tool.ts`, attached to an agent, with a UI component in `src/components/tools/`.
- New table: `src/db/schema/<domain>.ts`, exported from `src/db/schema/index.ts`, then `npm run db:generate`.
- New API route: `src/app/api/<name>/route.ts`.

## Special Directories

- `data/`: Mastra LibSQL runtime files (`mastra.db-wal`, `mastra.db-shm`). Generated and committed by accident. They are runtime state and should not be copied to a new repo.
- `memory-bank/`: handwritten project notes, which describe more than is implemented.
- `src/db/migrations/`: generated by drizzle-kit and committed.
- `playwright-report/`, `test-results*`: excluded from this map.

## Uncommitted Delta (existence only)

The working tree has 4 modified, uncommitted files: `package.json`, `package-lock.json`, `src/app/api/chat/route.ts` and `tests/e2e/chat-interface.spec.ts`. Their content was not read. Everything above describes the committed blobs.

---

*Structure analysis: 2026-10-08*
