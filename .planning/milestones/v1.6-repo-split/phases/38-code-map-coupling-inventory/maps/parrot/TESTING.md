<!-- generated from PA-Ai-Team/Parrot @ 74880e45226e4920cfdf1dec6b36bea5fd8a190b on 2026-10-08 -->
# Testing Patterns (Parrot)

**Analysis Date:** 2026-10-08
**Source:** PA-Ai-Team/Parrot `origin/main` @ `74880e45226e4920cfdf1dec6b36bea5fd8a190b` (read via `git show`; nothing was executed).

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` in `/Users/rajren/internjobs-cms`; no locked sources applied.
- Parrot's own planning uses TDD/RED-GREEN language (`*-VERIFICATION.md`, `*-SUMMARY.md` under `.planning/milestones/`), consistent with the test-first style below.

## Test Frameworks (three suites, no CI)

| Suite | Runner | Location | Count (at this sha) |
|---|---|---|---|
| Server | Node built-in `node --test` + `node:assert/strict` + `supertest` | `server/test/*.test.js`, `server/test/zero-trust/*.test.js` | about 140 files |
| Client | `node --test` (no DOM, no Vitest/Jest) | `client/src/**/*.test.js` (all in `client/src/utils/` plus `client/src/features/practice/`) | 14 files |
| AI worker | Python stdlib `unittest` | `ai-agent/test_callback_transport.py`, `test_opening_state.py`, `test_worker_routing.py` | 3 files |
| E2E | Playwright | `tests/e2e/chat-interface.spec.ts` | 1 file; no Playwright config or dependency in tree, appears orphaned |

- `server/test_backend.js` is a manual socket.io smoke script (CommonJS, needs a running server on :3001), NOT part of any suite.
- `jest ^30` is a devDependency of `server/package.json` but nothing uses it.
- There is NO `.github/` directory, so no CI pipeline is present in the repo. Tests run only on a developer machine.

## Run Commands

```bash
cd server && npm test                    # full explicit-list suite (node --test <files...>)
cd server && npm run test:zero-trust     # zero-trust subset
cd server && npm run test:zero-trust:postgres   # opt-in real Postgres acceptance (needs PARROT_ZT_TEST_DATABASE_URL)
cd server && node --test test/aiKillSwitch.test.js   # single file
cd client && npm test                    # node --test src/**/*.test.js
cd client && npm run lint                # ESLint (only static check in the repo)
node --test client/test/zero-trust-browser/run.test.mjs   # headless Chrome acceptance, explicit opt-in
cd ai-agent && python -m unittest        # worker tests (run in ai-agent/ so imports resolve)
```

CRITICAL: `server/package.json` `"test"` is a hard-coded, space-separated list of every test file. A new `server/test/*.test.js` is NOT run by `npm test` until it is appended to that script (and to `test:zero-trust` if it belongs there). Forgetting this silently excludes the test. `.mjs` concurrency/acceptance files (`waveElection.concurrency.mjs`, `numberOptimizationConcurrency.mjs`, `zero-trust/postgresAcceptance.mjs`) are intentionally excluded and are opt-in.

## Test File Organization

- Server: flat `server/test/<subject>.test.js`, camelCase, named after the module or phase feature (`aiKillSwitch`, `waveElection`, `telnyxSignature`, `embedTenants`). Sub-grouping only for `server/test/zero-trust/` (about 70 files, one per `scripts/zt/*` tool or boundary).
- Client: co-located next to source, `name.test.js` beside `name.js` (`client/src/utils/embedMode.test.js`, `client/src/features/practice/telnyxPracticeClient.test.js`). No component (JSX) tests; only pure logic is tested.
- Python: `test_*.py` beside the module in `ai-agent/`.

## Test Structure

Server (flat `test()` calls, no `describe`), pattern from `server/test/aiKillSwitch.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

// Set BEFORE the route module loads so the file can never reach real infrastructure.
// (fake LIVEKIT_URL env value assigned here, loopback only)
const { createAiCallsRouter } = await import('../routes/ai-calls.js');

test('GET: an org with no org_settings row reads as RUNNING', async () => {
  const pool = makeFakePool({});
  const res = await request(makeApp(pool)).get('/api/ai-calls/kill-switch');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { active: false, since: null });
});
```
Conventions:
- Test names are full behavioural sentences, prefixed with the verb or route (`'GET: ...'`, `'POST {active:true} ...'`).
- Section dividers `/* --- GET --- */` group tests in a file.
- Assertions use `node:assert/strict`; include a message on non-obvious ones (`assert.equal(x, y, '"since" is the stored value')`).
- File header states phase/requirement IDs, what is and is NOT proven ("SCOPE / HONESTY NOTE").
- Negative controls are standard: tampered/expired tokens, other org, malformed body, wrong environment.

Client: `import test from 'node:test'` plus `assert/strict`, one-line `test()` with loops over cases; inject `storage`/`location` stubs as parameters (`isEmbedContext(location, blockedStorage)`).

Python:
```python
class WorkerRoutingTests(unittest.TestCase):
    def test_startup_configuration(self):
        for override in ({"AI_WORKER_ENV": ""}, {"AI_AGENT_NAME": "parrot-ai-prod"}):
            with self.assertRaises(ValueError):
                worker_config({**ENV, **override})
```
Worker logic is kept pure-stdlib (`ai-agent/worker_routing.py`) specifically so it can be tested in isolation.

## Mocking

No mocking library. Hand-rolled fakes injected through the seams described in `CONVENTIONS.md` (about 44 server tests use `supertest`; very few use `mock.fn`/`t.mock`).

**Fake DB pool: answer by SQL shape and record statements:**
```js
function makeFakePool(settings = {}) {
  const seen = [];
  return { seen, query: async (sql, params = []) => {
    seen.push({ sql: String(sql), params });
    if (String(sql).includes('SELECT ai_kill_switch_at')) { ... return { rows: [...] }; }
    return { rows: [] };
  } };
}
```
Tests then assert on `pool.seen[0].params` (e.g. that the org comes from the session). Caveat stated in test headers: SQL is READ, not executed, so `ON CONFLICT`/COALESCE semantics are unproven until run against a real DB.

**Fake app:** build a tiny `express()` app in the test, set `req.user`/`req.orgId` via a stub middleware, mount the router created by its `create*Router({ pool, ... })` factory, call with `supertest`.

**Clerk:** mock `verifyToken` as a function returning `{ data }`/`{ errors }` (`server/test/socketAuth.test.js`); production uses the adapter `adaptClerkVerifyToken` since the public export throws (`server/test/clerkVerifyTokenContract.test.js` pins that contract).

**Real local I/O is allowed:** socket tests start a real `socket.io` server and `socket.io-client` on 127.0.0.1 only. No external network.

**Mock:** DB pool, Clerk, LiveKit, Telnyx, Vapi, Cloudflare API clients (`scripts/zt/cloudflareClient.mjs`), clock where time matters.
**Do NOT mock:** pure policy modules (`aiDialer/eligibility.js`, `dialing/guardrails.js`, `utils/phone.js`); test them directly with real inputs, including raw pg value shapes (`'09:00:00'` strings, null arrays).

## Fixtures and Factories

- Inline constants at top of file (`const ORG = 42; const OTHER_ORG = 77; const USERS = {...}`). No shared fixtures dir for server tests.
- Fake secrets are obviously fake (`'test-embed-secret-at-least-32-bytes-long!!'`, `AI_AGENT_CALLBACK_KEY="test-only"`, `fixture-secret`). Never use real credentials in tests.
- JWTs are minted in-test with `jose` `SignJWT`.
- Browser acceptance fixtures: `client/test/zero-trust-browser/{fixture,clerk,phone}.jsx`.
- Real-config evidence artifacts live under `ops/zero-trust/` and `.planning/artifacts/`, not in tests.

## Safety Rules in Tests (project-specific, enforce)

- A test must never reach live infrastructure: set fake env BEFORE dynamic import; dispatch tests must not make a LiveKit call.
- Postgres acceptance (`server/test/zero-trust/postgresAcceptance.mjs`, helpers in `postgresSafety.mjs`): requires `PARROT_ZT_TEST_DATABASE_URL`; loopback host only; DB name must match `parrot_zt_test(_suffix)`; no URL options; each test creates a unique schema `zt_fixture_<uuid>` and drops it; sets `statement_timeout` and `lock_timeout`; does NOT import dotenv, `config.js`, `db.js` or start the server. A missing prerequisite is a FAILURE, never a skip.
- Browser acceptance fails (does not skip) if Chrome is absent (`ZT_CHROME_EXECUTABLE`).
- Concurrency behaviour is proven in `*.concurrency.mjs` files against a real DB, separate from the fake-pool unit tests.

## Coverage

No coverage tool or threshold. Coverage is by strong per-feature test files tied to planning requirement IDs. Well covered: AI dialer (`ai*.test.js`), wave/parallel dialer (`wave*.test.js`), auth/socket/embed boundaries, Telnyx signature and webhook, zero-trust tooling. Gaps:
- No tests for most CRUD routes (`server/routes/contacts.js`, `campaigns.js`, `analytics.js`, `activities.js`, `groups.js`, `email*.js`) beyond org-scope, ownership and DNC checks.
- No React component, hook or context tests (`client/src/features/**` JSX, `client/src/context/*`); only `utils/` and `practice/` clients.
- `server/db.js`/`init_db.js` only covered by ordering test (`initDbOrdering.test.js`); no migration tests.
- The Playwright spec `tests/e2e/chat-interface.spec.ts` has no runner config.

## Test Types

- **Unit:** pure policy and parsing (`phone`, `areaCodes`, `contactTimeZone`, `telnyxSignature`, guardrails).
- **Route/integration (fake DB):** supertest against a factory-built router.
- **Contract:** pin external SDK behaviour (`clerkVerifyTokenContract.test.js`, `aiRecordingPlaybackContract.test.js`, `zero-trust/contracts.test.js`).
- **Tooling tests:** every `scripts/zt/*` tool has a test in `server/test/zero-trust/`.
- **Real-DB / browser acceptance:** opt-in `.mjs` runners only.
- **Live-readback scripts:** `scripts/zt/*Readback.mjs`, `scripts/verify-ai-worker-split.mjs`, `server/scripts/verify-ai-claim-concurrency.mjs` run against deployed envs; they are not tests.

## Adding a Test (prescriptive)

1. Create `server/test/<subject>.test.js` with `node:test` + `assert/strict`. Write RED first, with a negative control.
2. Inject a fake pool and build the router through its `create*` factory; set env fakes before dynamic import.
3. Append the file path to the `"test"` script in `server/package.json` (and `"test:zero-trust"` if applicable).
4. Client pure logic: add `name.test.js` beside the source and make it match `src/**/*.test.js`. Note `src/**/*.test.js` is shell-glob dependent: without globstar only one directory level matches. Run the file directly if unsure.
5. Python worker: add `test_*.py` in `ai-agent/` and keep the logic under test importable without LiveKit.

---
*Testing analysis: 2026-10-08*
