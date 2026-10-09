<!-- generated from PA-Ai-Team/Parrot @ 74880e45226e4920cfdf1dec6b36bea5fd8a190b on 2026-10-08 -->
# Codebase Structure

**Analysis Date:** 2026-10-08
**Source:** PA-Ai-Team/Parrot `origin/main` @ `74880e45226e4920cfdf1dec6b36bea5fd8a190b`

## Directory Layout

```
Parrot/
├── server/            # Node 20 ESM Express 5 + Socket.IO API (own package.json, no root workspace)
│   ├── index.js config.js db.js init_db.js
│   ├── middleware/    # auth, org, zero-trust boundaries, socket auth
│   ├── routes/        # REST routers; routes/api/v1 = API-key public API
│   ├── services/      # domain logic; aiDialer/ dialing/ numberOptimization/
│   ├── utils/         # phone, dnc, crypto, clerk, telnyx signature helpers
│   ├── data/          # defaultPersonas.js
│   ├── migrations/    # 001-hash-passwords.js only
│   ├── scripts/       # one-off ops (innovantech-cutover/, seed, prove-*)
│   ├── test/          # node --test suites; test/zero-trust/ (58 files)
│   └── public/
├── client/            # React + Vite SPA (own package.json)
│   ├── src/{pages,features,components,context,hooks,utils,assets}
│   └── test/zero-trust-browser/
├── ai-agent/          # Python LiveKit voice worker + prompts/ + py tests
├── ops/zero-trust/    # Zero-trust JSON/MD configs, decisions, evidence/ (123), staging/
├── scripts/           # root CLIs: provision/verify AI workers, audits, zt/, telnyx/, shell helpers
├── docs/              # API.md, embed integration, zero-trust docs, AI-WORKER-ISOLATION.md, superpowers/
├── .planning/         # RRR planning artefacts (milestones v1.0-v6.1, proposals, artifacts)
├── .claude/ .playwright-mcp/ .rrr-search.json
├── Dockerfile  fly.toml  fly.dev.toml  fly.ai-agent.toml  fly.ai-agent.prod.toml  render.yaml
├── package.json       # root: only shell-helper scripts, no deps
└── CLERK_MIGRATION.md  TELNYX_LEAK_FIX_DEPLOY_NOTES.md  README.md  CLAUDE.md  sample_contacts.csv
```

## Directory Purposes

**`server/routes/`:** one file per domain: `calls`, `contacts`, `campaigns`, `groups`, `messaging`, `messaging-webhook`, `webhooks`, `email*`, `emailOAuth`, `ai-calls`, `ai-voice`, `dialerWaves`, `embed`, `saas-admin`, `saasAdminEmbedTenants`, `admin*`, `practice`, `coaching`, `recordings`, `analytics`, `openclaw-leads`, `devEmbedDemo`, and others.

**`server/services/`:** see ARCHITECTURE.md Layers. Provider clients are flat files (`telnyx.js`, `vapi.js`, `anthropic.js`); multi-file domains get a subfolder.

**`client/src/features/`:** admin, aiDialer, analytics, call-logs, campaigns, contacts, dialer, email-inbox, practice, saas-admin, sms-inbox. `pages/` holds the route-level screens (about 19). `context/` holds AuthContext, SocketContext, WebRTCContext and PowerDialerContext.

**`ops/zero-trust/` and `scripts/zt/`:** large (about 120 evidence files and 40+ `scripts/zt/*.mjs`), with parallel tests under `server/test/zero-trust/`. This is a high-volume candidate area for the split inventory.

## Key File Locations

**Entry Points:** `server/index.js`, `server/init_db.js`, `ai-agent/agent.py`, `client/src/main.jsx`, `client/index.html`.
**Configuration:** `server/config.js` (env reading), `server/.env.example` (names only), `fly*.toml`, `render.yaml`, `Dockerfile`, `ai-agent/Dockerfile.worker`, `client/vite.config.js`, `client/eslint.config.js`.
**Core Logic:** `server/services/aiDialer/queue.js`, `dispatch.js`; `server/services/dialing/waveOrchestrator.js`; `server/services/telnyx.js`; `server/middleware/auth.js`.
**Testing:** `server/test/*.test.js` (run via `cd server && npm test`, with an explicit file list in `server/package.json`; `npm run test:zero-trust` and `test:zero-trust:postgres` also exist); `ai-agent/test_*.py`; `client/test/zero-trust-browser/`.
**Planning:** `.planning/milestones/v1.0` through `v6.1`, `.planning/proposals/parrot-zero-trust`.

## Naming Conventions

**Files:** server routes are kebab-case or camelCase (mixed, e.g. `ai-calls.js` and `dialerWaves.js`); services are camelCase; React components and pages are PascalCase `.jsx`; features use kebab-case or camelCase directories; Python is snake_case; tests are `<camelName>.test.js`.
**Directories:** lowercase, with zero-trust tooling under `zero-trust` / `zt`.

## Where to Add New Code

- **New API route:** `server/routes/<domain>.js` exporting a router (or a `create…Router({ pool, io })` factory). Mount it in `server/index.js` after `requireAuth`, with `requireAppEntitlement('<app>')` if gated.
- **Business logic:** `server/services/` (subfolder if 3+ files).
- **New test:** `server/test/<name>.test.js` AND append it to the explicit file list in the `test` script of `server/package.json`. Tests are not auto-discovered.
- **UI:** `client/src/features/<domain>/` with a page in `client/src/pages/`.
- **AI worker change:** `ai-agent/`; keep `server/services/aiDialer/workerRouting.js` in sync with `worker_routing.py`.
- **Schema change:** edit `server/init_db.js` (idempotent). `server/migrations/` is not the active mechanism.

## Special Directories

- `client/dist`: generated by the Docker build (not committed).
- `.planning/`: committed RRR planning (v1.0-v6.1, large: about 500 files).
- `ops/zero-trust/evidence/`: committed evidence artefacts.
- `server/.env.example`: the only env file in the tree (names only; not read for this map).
- `.playwright-mcp/`, `.claude/settings.local.json`: committed tool state.

---
*Structure analysis: 2026-10-08*
