<!-- generated from growthpods/Internjobs @ 99bcced93f997c8f09147c0cb18e132f8f3da751 on 2026-10-08 -->
# Coding Conventions

**Analysis Date:** 2026-10-08
**Source:** growthpods/Internjobs (`/Users/rajren/MayaOS/internjobs-ai`), committed tree at `99bcced93f997c8f09147c0cb18e132f8f3da751`. Read via `git show`; working-tree changes ignored.

## Naming Patterns

**Files:**
- React components: PascalCase `.tsx` in `src/components/chat/` and `src/components/tools/` (`ChatInterface.tsx`, `JobsList.tsx`, `WalkingCat.tsx`).
- shadcn-style primitives and assistant-ui wrappers: kebab-case (`src/components/ui/button.tsx`, `src/components/assistant-ui/tooltip-icon-button.tsx`, `thread.tsx`).
- Mastra agents: `<name>.agent.ts` (`src/lib/agents/router.agent.ts`, `job-discovery.agent.ts`, `student-onboarding.agent.ts`).
- Tools: `<name>.tool.ts` (`src/lib/tools/job-discovery.tool.ts`). Services: `<name>.service.ts` (`src/lib/services/memory.service.ts`).
- Drizzle schema: one lowercase domain file per area in `src/db/schema/` (`jobs.ts`, `identity.ts`, `billing.ts`, ...), re-exported from `src/db/schema/index.ts`.

**Functions/Variables:** camelCase. Agent and tool instances are camelCase consts (`routerAgent`, `jobDiscoveryTool`). Components are `const X: FC = () => ...` (arrow functions typed with `FC`) or named functions.

**Types/Schemas:** Zod schemas are PascalCase with a `Schema` suffix (`UserContextSchema`, `JobSearchSchema`). Interfaces are PascalCase (`SessionContext`, `Message`). Drizzle enums are `<name>Enum` (`jobTypeEnum`). DB columns are snake_case strings mapped to camelCase TS keys (`orgId: uuid('org_id')`).

## Code Style

**Formatting:** No Prettier config is committed. Observed style is inconsistent: the UI code has no semicolons and uses single quotes (`ChatInterface.tsx`), while the server code uses semicolons and mixed quotes (`route.ts` uses double quotes for imports and single quotes elsewhere). Two-space indent. Some files have trailing whitespace.

**Linting:** `npm run lint` runs `next lint`, with `eslint@^8` and `eslint-config-next@14.2.10` in devDependencies. No `.eslintrc*` or `eslint.config.*` is committed, so Next prompts for a config on first run and lint is effectively unconfigured.

**TypeScript:** `strict: true` in `tsconfig.json`, `moduleResolution: bundler`, `target: ES2015`. `any` is used freely (`const contextMessages: any[]`, `Record<string, any>`).

## Import Organization

**Order (observed, not enforced):**
1. Framework and third-party (`@mastra/core/agent`, `zod`, `react`, `@assistant-ui/react`, `lucide-react`)
2. Path-alias internal (`@/db`, `@/lib/...`, `@/components/...`)
3. Relative siblings (`./CustomThread`, `./WalkingCat`)

**Path Aliases:** `@/*` maps to `./src/*` (`tsconfig.json`). Use it for everything outside the same directory. Examples: `import { db } from '@/db'`, `import { cn } from '@/lib/utils'`.

## Error Handling

- API route: a single `try { ... } catch` wraps the handler in `src/app/api/chat/route.ts`. It throws plain `Error('No message found')` and `Error('Invalid message format')` for bad input.
- Tools: `try/catch` that does `console.error('Job discovery error:', error)` and rethrows a generic `Error('Failed to search jobs')` (`src/lib/tools/job-discovery.tool.ts`).
- Input validation uses Zod `inputSchema` and `outputSchema` on Mastra tools. The route does only ad hoc shape checks.

## Logging

**Framework:** `console` (`console.error`). No structured logger.

## Comments

- File-level JSDoc block comments describe the responsibilities of agents, tools and services (`router.agent.ts`, `memory.service.ts`, `job-discovery.tool.ts`).
- Inline `//` comments explain intent. Schema files annotate columns (`// hourly, weekly, monthly, fixed`).
- `TODO` and "mock data" markers remain in code (`job-discovery.tool.ts`: "TODO: Implement the actual database query ... return mock data").

## Function Design

- Agents are declared with `new Agent({ name, description, instructions, model, agents, tools })`. Instructions are long template strings. Model strings look like `'openai/gpt-4o-mini'`.
- Tools use `createTool({ id, description, inputSchema, outputSchema, execute: async ({ context }) => ... })`. Tool UI is signalled through an `emitToolUI: 'JobsList'` literal in the output.
- Services are classes exported as a singleton (`export class MemoryService`, used as `memoryService`).
- Route handlers are `export async function POST(req: Request)` with `export const maxDuration = 30`.

## Module Design

**Exports:** Named exports throughout. Next pages and layouts use the required default exports.

**Barrel Files:** Used only for the DB schema (`src/db/schema/index.ts` does `export * from './x'`). `src/db/index.ts` exports `db` and `schema`. `src/lib/mastra/index.ts` exports the `mastra` instance.

**Client components:** `'use client'` is the first line of interactive components. Styling uses Tailwind utility classes composed with `cn()` (`clsx` + `tailwind-merge`, in `src/lib/utils.ts`) and `class-variance-authority` for variants.

**Env access:** Read directly from `process.env` with a non-null assertion (`neon(process.env.DATABASE_URL!)` in `src/db/index.ts`). There is no env validation layer. Never commit `.env*` values. Only `.env.local.example` is tracked.

**Data access:** Drizzle ORM over the Neon HTTP driver. Queries are built with `drizzle-orm` helpers (`eq`, `and`, `or`, `gte`, `lte`, `sql`). Migrations are generated by `drizzle-kit` into `src/db/migrations/`.

## Prescriptive Summary

- New server modules: follow the `<name>.agent.ts`, `.tool.ts` or `.service.ts` suffix, with a leading JSDoc header, named exports and `@/` imports.
- New tables: add a file under `src/db/schema/` and re-export it from `index.ts`. Run `npm run db:generate`.
- Do not copy the inconsistent semicolon style. Pick one per file and stay consistent.

---

*Convention analysis: 2026-10-08*
