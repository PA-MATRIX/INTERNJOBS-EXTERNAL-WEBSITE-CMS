<!-- generated from growthpods/Internjobs @ 99bcced93f997c8f09147c0cb18e132f8f3da751 on 2026-10-08 -->
# Testing Patterns

**Analysis Date:** 2026-10-08
**Source:** growthpods/Internjobs, committed tree at `99bcced93f997c8f09147c0cb18e132f8f3da751` (committed blobs only).

## Test Framework

**Runner:**
- Playwright `@playwright/test ^1.57.0` (E2E only). Config: `playwright.config.ts`.

**Assertion Library:** Playwright `expect` (web-first assertions).

**Run Commands (from `package.json`):**
```bash
npm test                 # playwright test (all projects)
npm run test:chrome      # --project=chrome
npm run test:chromium    # --project=chromium
npm run test:ui          # --ui
npm run test:debug       # --debug
npm run test:codegen     # playwright codegen
npm run test:report      # show-report
```
Coverage tooling: none. There is no unit test runner (no Jest or Vitest), and no `test` step runs lint or typecheck.

## Test File Organization

**Location:** Separate top-level `tests/e2e/` (`testDir: './tests/e2e'`).

**Naming:** `<feature>.spec.ts`. The only committed spec is `tests/e2e/chat-interface.spec.ts`.

**Structure:**
```
tests/
└── e2e/
    └── chat-interface.spec.ts   # the only spec in the tree
```
No unit or integration tests exist for `src/lib/agents`, `src/lib/tools`, `src/lib/services` or `src/db`.

## Playwright Configuration

- Projects: `chromium` (Desktop Chrome), `chrome` (channel chrome, 1920x1080), `Mobile Chrome` (Pixel 5), `firefox`, `webkit`.
- `fullyParallel: true`. `retries: 2` and `workers: 1` on CI (`process.env.CI`). `forbidOnly` on CI.
- `baseURL`: `process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'`.
- `webServer`: `npm run dev` at `http://localhost:3000`, `reuseExistingServer: !CI`, timeout 120s.
- Per-test timeout 30s, action timeout 10s, global timeout 1h.
- Artifacts: `trace: 'on-first-retry'`, screenshot and video on failure. Reporters are `html`, `list` and `json` (`test-results.json`). Artifact dirs (`playwright-report/`, `test-results*`) are generated output, not source.
- No CI workflow is committed (no `.github/`). Deployment config is `render.yaml`.

## Test Structure

**Suite organization (actual pattern):**
```typescript
import { test, expect } from '@playwright/test';

test.describe('InternJobs AI - Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display welcome suggestions', async ({ page }) => {
    const suggestions = page.locator('button:has-text("Find my perfect internship")');
    await expect(suggestions.first()).toBeVisible();
  });
});
```

**Patterns:**
- One `describe` block, `beforeEach` navigates to `/`. Test names start with "should ...".
- Selectors are text and CSS based (`button:has-text(...)`, `page.locator('aside')`, `.fixed.left-0.top-0`, `button:has(svg)`). `data-testid` is not used, so tests are coupled to copy and class names.
- Responsive checks call `page.setViewportSize(...)` inside the test (1280x720 desktop, 375x667 mobile).
- Waiting uses `expect(...).toBeVisible({ timeout })` and an occasional fixed `page.waitForTimeout(300)` for animation.
- Several tests are weak or vacuous. For example, the animation test asserts `count >= 0`, and the desktop-only test gates on viewport width with an `if`.
- The suite asserts hardcoded sidebar fixtures ("Resume Review Session", "Tech Internship Search", "Student User") that come from `useState` seed data in `src/components/chat/ChatInterface.tsx`, not from real data.

## Mocking

**Framework:** None. There is no network interception (`page.route`), no LLM mock, and no DB fixture. The message-send test hits the real `/api/chat` (Mastra agent with OpenAI, plus Neon DB), so a full run needs `DATABASE_URL` and model credentials in a local env file. Never commit or quote the values.

**What to mock (recommended when extending):** `/api/chat` via `page.route('**/api/chat', ...)` and the DB via a test branch or database.

## Fixtures and Factories

None. No `tests/fixtures`, no factories, no seed script for tests. Seed-like UI data lives in the component source.

## Coverage

**Requirements:** None enforced. `/coverage` is gitignored but unused.

## Test Types

- **Unit:** Not present.
- **Integration:** Not present (no agent, tool, service or route tests).
- **E2E:** Playwright against the dev server, UI smoke level (load, suggestions, sidebar toggle, mobile menu, send message).

## Common Patterns

**Async testing:**
```typescript
await messageInput.fill('Hello, I need help finding an internship');
await sendButton.click();
await expect(page.locator('text=Hello, I need help finding an internship')).toBeVisible({ timeout: 10000 });
```

**Error testing:** Not covered. No test exercises failure paths of `src/app/api/chat/route.ts`.

## Gaps to Carry Into the Split

- Zero tests protect `src/lib/mastra/`, `src/lib/agents/`, `src/lib/services/memory.service.ts` or `src/db/schema/`, which are the coupling surface other repos may depend on.
- Tests rely on live external services and are not hermetic, so they are not a reliable safety net for refactors or extraction.

---

*Testing analysis: 2026-10-08*
