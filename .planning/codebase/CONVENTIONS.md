<!-- generated from internjobs-cms @ d1658aa5ba0ce397788cd79c34b425c459eaa0da on 2026-10-08 -->
# Coding Conventions

**Analysis Date:** 2026-10-08
**Baseline:** merged main `d1658aa5ba0ce397788cd79c34b425c459eaa0da` (tracked files only; untracked `apps/canary-monitor/` is not mapped)

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md`, `AGENTS.md` or `CLAUDE.md` exists in the repo root.
- Locked source: global `~/.claude/CLAUDE.md` — "Plan → rrr-plan-checker → execute → rrr-verifier" and "TDD-driven, always" (failing test and RED evidence first). Applies to how code is written, not to its style.
- Locked source: project memory — "Auth: two Clerk apps, not one" (Students = LinkedIn-only, Employees = phone-OTP-only; do not merge). "Clerk JWT claims are minimal" (only `sub` is guaranteed; never require email/phone). "LLM via AI Gateway not direct REST" (Parrot LLM calls go through CF AI Gateway; the student app stays on direct REST; do not migrate as a side effect). "App naming" (say "Workspace" in narrative, never "parrot" as a product name, though `apps/parrot/` is the directory).
- Locked source: project memory — "Workspace deploy = full replace" (deploy `internjobs-parrot` only from main).

## Repo Layout Facts That Drive Conventions

- Root `package.json` is an npm workspace for `apps/*` and `packages/*` but EXCLUDES `apps/agentic-inbox`, `apps/parrot`, `apps/startup`. Those three have their own `package.json` and lockfile, are installed with their own `npm ci`, and are built and tested in separate CI jobs (`.github/workflows/ci.yml`).
- Three language modes coexist. Match the mode of the app you are editing:
  - `apps/app` (student app), `apps/email-worker`, `scripts/*`, `apps/marketing/scripts/*`: plain ESM JavaScript (`.mjs`, or `.js` with `"type": "module"`), no build step, no TypeScript.
  - `apps/parrot` (Workspace), `apps/startup`, `apps/employers`, `apps/marketing/src`, `packages/shared`: TypeScript, `strict: true`.
  - `apps/parrot/workers` and `apps/startup/workers`: Cloudflare Workers running Hono.
- `packages/shared/src/index.ts` is the only shared package (`@internjobs/shared`, exports `./src/index.ts` directly with no build).

## Naming Patterns

**Files:**
- TypeScript worker modules: kebab-case, e.g. `apps/parrot/workers/lib/inbound-email.ts`, `apps/parrot/workers/routes/reply-forward.ts`, `apps/parrot/workers/lib/mattermost-pat` tests as `mattermost-pat.test.ts`.
- React components: PascalCase `.tsx`, e.g. `apps/parrot/app/components/AgentPanel.tsx`, `ChatPane.tsx`, `apps/marketing/src/components/*`.
- React Router routes in `apps/parrot/app/routes/`: dot-segmented lowercase, e.g. `admin.invite.tsx`, `dashboard.tsx`, registered in `apps/parrot/app/routes.ts`.
- Plain ESM JS: lowercase single-word or kebab-case `.mjs`, e.g. `apps/app/src/auth.mjs`, `apps/app/src/spectrum-listener.mjs`.
- Phase-scoped one-off scripts are prefixed with the phase number: `scripts/26-kgraph-smoke.mjs`, `scripts/33-clerk-restrictions-config.mjs`.
- Tests are co-named with the subject (`screen.mjs` / `screen.test.mjs`) or live under a mirrored `tests/` tree (see TESTING.md).
- Verification and runbook documents: `<phase>-<plan>-<topic>.md`, e.g. `apps/parrot/test/25-01-mattermost-sso-runbook.md`.

**Functions / variables:** camelCase (`getClerkClient`, `screenMessage`, `chatCompletion`, `verifyDraft`). Module-private singletons use a leading underscore (`_clerkClient` in `apps/app/src/auth.mjs`). Constants are UPPER_SNAKE (`MAX_RESERVE_ATTEMPTS`, `RESOLVE_TIMEOUT_MS`, `PARROT_AGENT_TOOLS`).

**Types:** PascalCase (`Env` in `apps/parrot/workers/types.ts`). Use `import type` for type-only imports (`verbatimModuleSyntax: true` in `apps/parrot/tsconfig.json`).

**Requirement and decision IDs:** features and tests are tagged with plan IDs in comments and test names (`CHAT-HARD-02`, `SAFETY-VERIFY-01..03`, `STARTUP-AGENT-EMAIL-01`, `VERIFY-03a`). Reuse the owning plan's ID when adding code or tests.

## Code Style

**Formatting:**
- No Prettier, Biome, ESLint or `.editorconfig` is tracked anywhere (verified via `git ls-files`). Style is by convention only.
- `apps/parrot` and `apps/startup` TypeScript: TAB indentation, double quotes, semicolons, trailing commas in multi-line literals.
- `apps/app` `.mjs` and `scripts/*.mjs`: 2-space indentation, double quotes, semicolons.
- `apps/startup` and `apps/parrot` tests use tabs; `scripts/*.test.mjs` use 2 spaces. Follow the surrounding file.

**Type checking is the only automated static gate:**
- `apps/parrot`: `npm run typecheck` = `npm run cf-typegen && react-router typegen && tsc -b` (CI-enforced).
- `apps/startup`: `npm run typecheck` = `tsc --noEmit` (CI-enforced).
- `apps/email-worker`: `npm run check` = `node --check src/index.js` (CI-enforced).
- `apps/marketing`, `apps/employers`: type-checked during `npm run build`.
- `apps/app`: no typecheck; `checkJs` is not used; `npm run verify` runs `apps/app/scripts/verify-app.mjs`.

## Import Organization

**Order (TypeScript workers, as in `apps/parrot/workers/routes/agent.ts`):**
1. Third-party packages (`hono`, `@clerk/backend`).
2. Relative `../lib/*` helpers, using multi-line named imports, one name per line when more than two.
3. `import type { Env } from "../types"` for types.

**Frontend (`apps/parrot/app/`):** React and `react-router` first, then `~/components/...`, `~/lib/...` via the `~` alias (defined in `apps/parrot/tsconfig.cloudflare.json` `paths`).

**Plain ESM:** Node built-ins with `node:` prefix (`node:test`, `node:assert/strict`, `node:fs`), then packages, then relative imports WITH the `.mjs` extension (`./http.mjs`). TypeScript worker imports omit extensions.

## Error Handling

- Workers fail soft on non-critical side effects: catch, log with `console.warn("<name> failed (non-fatal)", err)`, continue (`apps/parrot/workers/lib/mailbox.ts` `touchLastSeen`).
- Hard failures use `console.error` with a bracketed or descriptive prefix, e.g. `console.error("[parrot] unhandled error:", err)` in `apps/parrot/workers/index.ts` (global Hono error handler).
- Auth-gated routes use `requireEmployeeMailbox` (`apps/parrot/workers/lib/mailbox.ts`), which returns 401 when `c.var.employee` is missing. Operator-only routes additionally return 403.
- Safety screening FAILS OPEN: if the Lakera call has no key, errors or times out, return `action: "passed_lakera_unavailable"` and `flagged: false` (`apps/app/src/safety/screen.mjs`, `apps/parrot/workers/lib/safety.ts`).
- Cross-service handoffs use explicit timeouts, with the constants checked cross-package by `scripts/check-email-timeout-invariant.mjs`. Do not change `RESOLVE_TIMEOUT_MS`, `INSERT_TIMEOUT_MS`, `EMPLOYERS_HANDOFF_TIMEOUT_MS` or `OVERHEAD_BUDGET_MS` without re-running that script.
- Auth: Clerk only requires `sub`. Never reject a session for missing email/phone claims.

## Logging

**Framework:** plain `console.log/warn/error` (no logger library). Use stable snake_case event keys with a structured object where possible, e.g. `console.warn("chat_bootstrap_failed", { ... })` in `apps/parrot/workers/index.ts`. Never log secrets, tokens or message bodies.

## Comments

- Files open with a header comment: path on line 1 (`// workers/tests/routes/chat-token.test.ts` or `// apps/startup/workers/routes/email.test.ts`), then a plan or requirement ID and a multi-line rationale.
- Comments explain WHY, including incident history and invariants (see the `ci.yml` job comments and `apps/app/src/auth.mjs` Clerk handshake note). Keep that style; add the plan or phase ID when behaviour is changed.
- Tests carry a "Scope note" when they can only prove part of an invariant (`apps/startup/workers/routes/email.test.ts`).
- JSDoc is used sparingly (`/** Minimal Env stub ... */` in `apps/parrot/workers/tests/helpers.ts`).
- White-label rule in Workspace agent prompts and responses: refer to "the agent" or "Parrot Agent"; never mention agentic-inbox or Maya (`apps/parrot/workers/routes/agent.ts`).

## Function and Module Design

- Hono routes: one router per file in `apps/parrot/workers/routes/`, mounted from `apps/parrot/workers/index.ts` (the inner `app`). Clerk auth and the dev bypass live in the outer wrapper `apps/parrot/workers/app.ts`.
- Business logic goes in `workers/lib/*.ts` as pure or injectable functions (take `fetch`/env as arguments), so tests can stub them. Routes stay thin.
- Named exports only; no default exports in workers libs (`apps/parrot/workers/app.ts` default export is the Worker entry). No barrel files except `packages/shared/src/index.ts`.
- Database schema: `apps/parrot/workers/db/schema.ts`; student DB migrations via `apps/app/scripts/migrate.mjs` and `apps/app/db/`.

## Process Conventions (affect every commit)

- Phase work lands on branches and is submitted with `scripts/submit-phase.mjs`, which writes per-phase `submissions/<phase>.json`; PRs are gated by `scripts/check-submission.mjs`. Never hand-edit submission markers.
- Commit messages: `type(phase-plan): subject`, e.g. `feat(38-02): ...`, `docs(38-01): ...`.
- Code maps in `.planning/codebase/` are checked by `scripts/verify-code-maps.mjs`.

---

*Convention analysis: 2026-10-08*
