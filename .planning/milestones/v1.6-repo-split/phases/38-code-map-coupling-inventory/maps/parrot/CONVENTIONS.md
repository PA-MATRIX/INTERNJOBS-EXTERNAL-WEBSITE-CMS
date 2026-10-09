<!-- generated from PA-Ai-Team/Parrot @ 74880e45226e4920cfdf1dec6b36bea5fd8a190b on 2026-10-08 -->
# Coding Conventions (Parrot)

**Analysis Date:** 2026-10-08
**Source:** PA-Ai-Team/Parrot `origin/main` @ `74880e45226e4920cfdf1dec6b36bea5fd8a190b`, main worktree `/Users/rajren/Documents/Parrot` (read-only, via `git show`/`ls-tree`).

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` found in `/Users/rajren/internjobs-cms`. No locked sources were applied to this mapping.
- Parrot root `CLAUDE.md` is only a vendored Neon-Postgres skill doc. It holds no repo conventions.
- Parrot carries its own `.planning/` tree (milestones v1.0 to v6.1, `.planning/codebase/*.md`). It is not authoritative for this map.

## Repo Shape (conventions differ per package)

| Package | Language / module system | Style |
|---|---|---|
| `server/` | Node ESM (`"type": "module"`), Express 5 | semicolons, single quotes, 2-space indent |
| `client/` | React 19 + Vite 8, ESM, `.jsx` | NO semicolons, single quotes, 2-space indent |
| `ai-agent/` | Python (LiveKit voice worker) | PEP8, stdlib `unittest` |
| `scripts/`, `scripts/zt/`, `server/scripts/` | `.mjs` Node scripts (plus a few `.sh`, `.ps1`, `.py`) | semicolons |

No Prettier, EditorConfig or Biome config exists. Style is by convention only. There is no root workspace manager. Root `package.json` holds only helper `bash scripts/*.sh` scripts, and `server/` and `client/` each have their own `package.json` and lockfile.

## Naming Patterns

**Files (server):**
- Routes: `server/routes/<kebab-or-camel>.js`. Mixed, e.g. `ai-calls.js`, `email-inbox.js`, `messaging-webhook.js` and `adminLocalPresence.js`, `scheduledCalls.js`, `saasAdminEmbedTenants.js`. For new files use camelCase, as the more recent files do.
- Services: camelCase `server/services/<name>.js`. Subsystems get subfolders: `server/services/aiDialer/`, `server/services/dialing/`, `server/services/numberOptimization/`.
- Utils: `server/utils/<name>.js` (`phone.js`, `dnc.js`, `telnyxSignature.js`).
- Middleware: `server/middleware/<name>.js`.
- Migrations: `server/migrations/001-*.js`. Schema is mostly applied by `server/init_db.js` and `server/db.js`.

**Files (client):**
- Components and pages: PascalCase `.jsx` (`client/src/pages/`, `client/src/components/`).
- Feature folders: `client/src/features/<kebab-or-camel>/` (`aiDialer`, `call-logs`, `sms-inbox`, `practice`, `saas-admin`).
- Hooks: `use*.js` in `client/src/hooks/`. Contexts: `*Context.jsx` in `client/src/context/`.
- Pure logic helpers: camelCase `.js` in `client/src/utils/`, each with a sibling `*.test.js`.

**Functions/variables:** camelCase. Constants are UPPER_SNAKE (`PRACTICE_MAX_DURATION_MS`). Route factories are `createXRoutes(deps)` / `createXRouter(deps)` (`createAiCallsRouter`, `createWebhookRoutes`, `createAdminLocalPresenceRoutes`). Bearer/embed verifiers are `createBearerVerifier`.

**Python:** snake_case modules and functions (`worker_routing.py`, `callback_transport.py`); tests are `test_*.py`.

**DB:** snake_case tables/columns (`org_settings.ai_kill_switch_at`, `embed_tenants`, `user_phone_numbers`). Multi-tenancy key is `org_id`.

## Code Style

**Formatting:** None enforced. Follow the neighbouring file. Server: semicolons. Client: none.

**Linting:** Client only, `client/eslint.config.js` (ESLint 9 flat config): `@eslint/js` recommended, `react-hooks` flat recommended, `react-refresh` vite. Custom rule: `'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }]`. Run `npm run lint` in `client/`. There is NO server linter and no Python linter. No CI workflow files (`.github/` absent), so lint is not enforced by automation.

## Import Organization

Server file order observed in `server/index.js` and `server/middleware/auth.js`:
1. `config.js` first in the entrypoint (so dotenv loads before anything else).
2. Third-party packages (`express`, `socket.io`, `@clerk/express`).
3. Local `db.js`, `middleware/`, `services/`, `utils/`.
4. Route imports are grouped under a `// Route imports` comment.

Rules:
- ESM everywhere in `server/`; relative imports MUST include the `.js` extension.
- No path aliases in `server/` or `client/` (relative imports only).
- `server/test_backend.js` is a stray CommonJS `require` script, not a convention to copy.
- Tests that must avoid real infrastructure set `process.env.*` fakes BEFORE a dynamic `await import('../routes/...')`.

## Dependency Injection (most important server pattern)

Modules that touch the DB or the outside world take injected collaborators so tests can fake them:
```js
export async function allocatePoolNumber({ orgId, leadNumber, userId, contactId = null, db = pool }) { ... }
export const verifyBearerToken = createBearerVerifier({ pool, getEmbedSecret, verifyClerkToken });
const { createAiCallsRouter } = await import('../routes/ai-calls.js');
```
Prefer `db = pool` default params and `create*(deps)` factories over importing singletons into new logic. Pure policy logic lives in its own module (`server/services/aiDialer/eligibility.js`, `server/services/dialing/guardrails.js`) and is imported by the orchestrators (`queue.js`, `waveOrchestrator.js`).

## Route Conventions

Pattern from `server/routes/dnc.js`:
```js
const router = Router();
const orgOf = (req) => req.orgId || req.user?.org_id;
router.get('/', async (req, res) => {
  try { ... res.json({ ...result }); }
  catch (err) { console.error('[DNC] List error:', err.message); res.status(500).json({ error: 'Failed to load DNC list' }); }
});
```
- Org scope comes from the SESSION (`req.orgId` / `req.user.org_id`), NEVER from body or query. Tests assert this (`aiKillSwitch.test.js`, `apiContactsOrgScope.test.js`).
- Auth middleware: `requireAuth`, `requireAdmin`, `requireAppEntitlement` from `server/middleware/auth.js`. `req.user` shape is `{ id, username, email, role, org_id, is_platform_operator }`.
- Status codes: 400 validation, 401 unauthenticated, 403 not provisioned/forbidden, 500 on caught errors.
- Pagination: `Math.min(parseInt(req.query.limit, 10) || 100, 500)`.
- Machine routes (webhooks, API-key `server/routes/api/`) use separate verifiers (`server/middleware/apiKeyAuth.js`, `server/services/machineBoundaryVerifiers.js`, `server/utils/telnyxSignature.js`).

## Error Handling and Logging

- try/catch per handler; log with `console.error('[Tag] message:', err.message)`; return a generic JSON `{ error }` (no stack or secret leakage).
- Logging is plain `console.*` with bracketed area tags: `[Webhook]`, `[ADMIN]` (also `[Admin]`, inconsistent casing), `[ai-calls]`, `[Contacts]`, `[Messaging]`, `[Scheduler]`, `[Practice]`, `[saas-admin]`, `[Analytics]`, `[CallLogs]`. No logger library. Use the tag of the area you are in. Never log tokens: auth code throws `AuthError { reason, credentialType, tokenPresent }` "never the token".
- Fail-safe degrade is a stated norm: local presence "degrades safely to the agent's primary number whenever ... anything errors".
- Python worker config validates strictly and raises `ValueError` (`ai-agent/worker_routing.py`).

## Feature Flags and Safety Defaults

Risky background subsystems ship OFF by default and are env-gated in `server/config.js` (`aiQueueEnabled` from `AI_QUEUE_ENABLED`, `reaperEnabled`, `cdrSyncEnabled`, Telnyx webhook signature mode and auto-configure policy in `server/services/telnyxStartupPolicy.js`). A test asserts the default is OFF. Org-level flags live in `org_settings` (`local_presence_pool_enabled`, `ai_kill_switch_at`; NULL means running; a missing row means running).

## Comments

- Long file-header block comments are the norm in server code. They state purpose, phase/requirement IDs (e.g. `Phase 35-02 / QUEU-06`, `DISP-01`, `SOCK-01`), load-bearing invariants and honesty notes about what is NOT proven. Keep this style. Reference planning IDs where a decision came from them.
- JSDoc `@returns {Promise<{...}>}` used for non-obvious return shapes.
- Client files carry a similar `// Phase NN — ...` header (`client/src/features/practice/telnyxPracticeClient.js`).

## Client Conventions

- Data access via `useApi(url, options)` in `client/src/hooks/useApi.js`, which wraps `apiFetch` from `AuthContext` and returns `{ data, loading, error, refetch }`. Do not call `fetch` directly for API calls.
- Global state through React Context (`client/src/context/AuthContext.jsx`, `SocketContext.jsx`, `WebRTCContext.jsx`, `PowerDialerContext.jsx`). No Redux.
- Styling: Tailwind v4 via PostCSS (`client/postcss.config.js`, `client/src/index.css`); icons `lucide-react`.
- Provider abstraction facade: Practice clients (`telnyxPracticeClient.js`, vapi client) share one API (`start / setMuted / stop / destroy`, `onStatus`, `onError`, `onTranscript`), selected by `practiceClientFactory.js`.
- Embed mode (`client/src/embedMode.js`, `client/src/utils/embed*.js`, `client/src/hooks/useEmbedBridge.js`) is cookie-free and storage-blocked-tolerant. Keep embed logic in those modules, with tests.
- Telnyx WebRTC SDK is self-hosted at `/js/telnyx_webrtc.min.js` (served from `server/public/js/`), not imported from npm in the client.

## Module Design

- Named exports; default export only for routers (`export default router`) and route modules imported in `server/index.js`.
- No barrel files except `server/routes/api/index.js`.
- One concern per service file; subsystem folders replace mega-files.

## Operational/Tooling Script Conventions

- `scripts/zt/*.mjs` (zero-trust tooling) follow a strict pattern: a `prepare-*` script produces a reviewable plan/JSON under `ops/zero-trust/`, an `apply`/`reconcile` script applies it, a `*Readback` script verifies. Every script has a matching `server/test/zero-trust/*.test.js`.
- Scripts and tests must not read `.env` or application config in isolation harnesses (explicit "No dotenv" headers).

## Where These Conventions Are Inconsistent

- `[ADMIN]` vs `[Admin]` log tags; kebab vs camel route filenames.
- Server uses semicolons, client does not.
- `jest` and `supertest` are in `server/package.json` devDependencies, but tests run on `node --test`. Jest is not used.

---
*Convention analysis: 2026-10-08*
