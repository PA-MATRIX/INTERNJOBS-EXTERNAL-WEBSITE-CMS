<!-- generated from internjobs-cms @ d1658aa5ba0ce397788cd79c34b425c459eaa0da on 2026-10-08 -->
# Testing Patterns

**Analysis Date:** 2026-10-08
**Baseline:** merged main `d1658aa5ba0ce397788cd79c34b425c459eaa0da` (tracked files; `apps/canary-monitor/` excluded)

## Test Framework

There are FOUR runners; use the one the target package already uses.

| Package | Runner | Config | Script |
|---|---|---|---|
| `apps/parrot` (Workspace) | Vitest `^3.2.0` | `apps/parrot/vitest.config.ts` | `npm test` = `vitest run` |
| `apps/startup` | `node:test` via `tsx` | none | `npm test` = `tsx --test` |
| `apps/email-worker` | `node:test` (plain JS) | none | `npm test` = `node --test src/*.test.js` |
| `apps/app` (student) | `node:test` (plain ESM) | none | `npm run test:auth` = `node --test src/auth.test.mjs` (other tests run with `node --test <file>`) |
| `apps/employers` | `tsx` script (unit), Playwright `^1.60.0` (e2e) | `apps/employers/playwright.config.ts` | `npm test`, `npm run test:e2e` |
| `scripts/` | `node:test` | none | `node --test scripts/*.test.mjs` |

`apps/marketing` has NO unit tests; its gates are `npm run verify:dist` (`apps/marketing/scripts/verify-site-assets.mjs`, `verify-phone-animation-source.mjs`) and `verify-brand.mjs`. `packages/shared` has no tests. `apps/agentic-inbox`, `apps/mac-bridge`, `apps/mattermost-proxy`, `apps/parrot-mattermost`, `infra/*` have no tracked test files (infra has smoke scripts such as `infra/graph-api/smoke.mjs`).

**Assertions:** Vitest `expect` in Parrot; `node:assert/strict` (`import assert from "node:assert/strict"`) everywhere else.

**Run commands:**
```bash
cd apps/parrot && npm test                       # vitest run (all workers/tests)
cd apps/parrot && npx vitest run workers/tests/lib/safety.test.ts   # single file
cd apps/parrot && npm run typecheck              # tsc gate, run with tests
cd apps/startup && npm test                      # tsx --test
cd apps/startup && npx tsx --test workers/routes/email.test.ts
cd apps/email-worker && npm run check && npm test
node --test apps/app/src/safety/screen.test.mjs  # student app, per file
node --test scripts/verify-code-maps.test.mjs scripts/verify-v15-promotion.test.mjs
node scripts/check-email-timeout-invariant.mjs   # cross-package invariant
cd apps/employers && npm run test:e2e:install && npm run test:e2e
```
No coverage tooling is configured anywhere.

## Test File Organization

**Parrot (`apps/parrot/vitest.config.ts`):** only `workers/tests/**/*.test.ts` is included (`environment: "node"`, `globals: false`, so import `describe/it/expect/vi` explicitly). Browser or React tests are not supported.
```
apps/parrot/workers/tests/
├── __mocks__/cloudflare-workers.ts   # alias target for "cloudflare:workers" (DurableObject stub)
├── helpers.ts                        # minimalEnv and shared stubs
├── csp-header.test.ts, healthz.test.ts
├── lib/*.test.ts                     # unit tests for workers/lib/* (safety, embed-jwt, mattermost-*, inbound-email, spam-purge, ...)
└── routes/*.test.ts                  # route smoke tests against the inner Hono app
```
**Other packages co-locate** tests: `apps/startup/workers/lib/slug.test.ts`, `apps/startup/workers/routes/{email,scheduled,telnyx}.test.ts`, `apps/app/src/{auth,safety/screen,storage/r2,workflows/reply-to}.test.mjs`, `apps/email-worker/src/index.test.js`, `apps/employers/functions/api/[[path]].test.ts`, `apps/employers/e2e/founder-flow.spec.ts`.

**Naming:** `<subject>.test.ts|mjs|js`; Playwright uses `.spec.ts`. Test names carry plan IDs (`VERIFY-03a:`, `CHAT-HARD-02`).

**Manual and UAT artifacts (not executed):** `apps/parrot/test/*.md|.sh` (runbooks, `agent-uat-results.md`, `25-01-mmctl-commands.sh`) and `apps/app/test/integ-01-*.md`. Live-proof evidence belongs there or in phase SUMMARY files.

## Test Structure

**Parrot route smoke pattern (`apps/parrot/workers/tests/routes/chat-token.test.ts`):**
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { app } from "../../index";          // INNER Hono app, not workers/app.ts
import type { Env } from "../../types";

const mockEnv: Partial<Env> = { MATTERMOST_URL: "https://mattermost.example.com" };
afterEach(() => vi.unstubAllGlobals());

it("returns 401/403 without auth", async () => {
	const req = new Request("https://parrot.example.com/api/admin/chat/backfill-tokens", { method: "POST" });
	const res = await app.fetch(req, mockEnv as Env, {} as ExecutionContext);
	expect([401, 403]).toContain(res.status);
});
```
- Import the INNER `app` from `workers/index.ts`. Clerk auth and the `X-Parrot-Dev-Employee` dev bypass live in `workers/app.ts`, so `c.var.employee` is never populated and auth-gated routes return 401. Route tests therefore assert "mounted (not 404), auth fires, no crash (not 500)", not 200.
- Happy paths are covered at the `workers/lib/*` unit level (e.g. `lib/mattermost-pat.test.ts`) and in live UAT.
- Public routes (`/healthz`, `/oidc/...`) can assert 200.

**`node:test` pattern (`apps/startup/workers/routes/email.test.ts`, `apps/app/src/safety/screen.test.mjs`):**
```typescript
import test from "node:test";
import assert from "node:assert/strict";

test("VERIFY-03a: missing API key returns fail-open immediately", async () => {
  const result = await screenMessage("...", "");
  assert.equal(result.action, "passed_lakera_unavailable");
});
```
Flat `test()` calls, descriptive sentence names, assertion messages as the third argument.

## Mocking

- Vitest: `vi.stubGlobal("fetch", vi.fn()...)` and `vi.unstubAllGlobals()` in `afterEach`. The `cloudflare:workers` module is aliased to `workers/tests/__mocks__/cloudflare-workers.ts` in `vitest.config.ts`; add new Workers-only module stubs there.
- `node:test`: replace `globalThis.fetch` directly and restore in a `finally` block. "NO REAL NETWORK CALLS" is the rule (`apps/startup/workers/routes/email.test.ts`).
- Env vars: save, set and restore `process.env.X` in try/finally (`apps/app/src/safety/screen.test.mjs`). Note modules that read env at import time need a re-import.
- Env objects for Workers are built as `Partial<Env>` and cast `as Env`.
- Mock: outbound HTTP (Mattermost, Lakera, Clerk admin, Telnyx, AI Gateway), time. Do NOT mock the Hono router or the code under test.

## Fixtures and Factories

- Shared Worker env and request stubs: `apps/parrot/workers/tests/helpers.ts` (`minimalEnv`).
- Script tests build real throwaway git repos in `os.tmpdir()` using `mkdtempSync` and helper functions `git`, `put`, `makeLegacy` (`scripts/verify-code-maps.test.mjs`), including a planted secret canary (`SECRET_CANARY_9f3a1c77`) to prove secrets never leak into output, and index-stat checks to prove read-only behaviour. Reuse this pattern for any script that touches git.
- No shared fixture directory exists; keep fixtures inline.

## Coverage and CI

**Requirements:** none enforced. CI (`.github/workflows/ci.yml`, Node 22) on PRs to `main` and `integration/**`, and pushes to `integration/**`:
- `submission-gate` (`scripts/check-submission.mjs`, PRs only)
- `workspaces`: `npm ci`, build marketing, build employers, `npm run build:app`
- `parrot`: `npm ci`, `npm run typecheck`, `npm test` (vitest), `npm run build`, advisory `wrangler deploy --dry-run` on push
- `startup`: `npm ci`, `npm run typecheck`, `npm test`, advisory dry-run
- `email-timeout-invariant`: `node scripts/check-email-timeout-invariant.mjs`
- `email-worker`: `npm run check`, `npm test`

NOT run in CI: `apps/app` unit tests (`*.test.mjs`), `apps/employers` unit and e2e tests, `scripts/*.test.mjs`, `apps/marketing` `verify:dist`. Run these locally before merging changes there.

## Test Types

- **Unit:** the bulk. Parrot `workers/tests/lib/*`, startup `slug`/`email`/`scheduled`/`telnyx`, student `auth`/`screen`/`r2`/`reply-to`.
- **Route smoke:** Parrot `workers/tests/routes/*` (mounted and gated, per above).
- **Invariant / meta tests:** `scripts/check-email-timeout-invariant.mjs` reads real constants from two packages; `scripts/verify-code-maps.test.mjs` and `verify-v15-promotion.test.mjs` test the repo's own verifiers.
- **E2E:** Playwright in `apps/employers/e2e/founder-flow.spec.ts`. Targets `https://employers.internjobs.ai` by default, override with `TEST_BASE_URL`. 3 unauthenticated tests always run; 4 authenticated tests are skipped unless `PLAYWRIGHT_CLERK_TEST_TOKEN` is set (never commit a value).
- **Live and smoke:** `apps/app/scripts/smoke-*.mjs`, `scripts/26-kgraph-*.mjs`, `infra/graph-api/smoke.mjs`, `npm run verify:marketing:production`. These hit real services; run only with approval.

## Common Patterns

**TDD workflow required by the project (global CLAUDE.md):** write the failing test with a negative control, run and record RED output, implement, record GREEN, then refactor. Plan SUMMARY files must contain the RED evidence before the GREEN evidence. Live production steps need a readback that fails before and passes after.

**Async testing:** `async` test functions with `await app.fetch(...)` or `await fn(...)`; no fake timers convention.

**Error / fail-open testing:** assert the degraded result rather than a throw, e.g. dead endpoint gives `action === "passed_lakera_unavailable"` and `flagged === false`.

**Honest scope notes:** when a test only proves a local number (e.g. startup timeout constants), say so in the header comment and point to the real guard.

**Adding a test:**
- Parrot lib or route: new file under `apps/parrot/workers/tests/{lib,routes}/<name>.test.ts`, header comment with path and plan ID.
- Startup Worker: co-locate `<name>.test.ts` beside the module, `node:test` plus `tsx`.
- Student app: co-locate `<name>.test.mjs`, then add a script or run with `node --test`; consider wiring into CI.
- New root script: `scripts/<name>.test.mjs` using temp-dir fixtures.

---

*Testing analysis: 2026-10-08*
