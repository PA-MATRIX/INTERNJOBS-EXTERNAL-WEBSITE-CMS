<!-- generated from PA-Ai-Team/Parrot @ 74880e45226e4920cfdf1dec6b36bea5fd8a190b on 2026-10-08 -->
# Technology Stack

**Analysis Date:** 2026-10-08
**Source:** PA-Ai-Team/Parrot, main worktree, read at origin/main `74880e45226e4920cfdf1dec6b36bea5fd8a190b` (read-only, via `git show`/`ls-tree`/`grep` on the ref).

Parrot is the employee-facing sales dialer product (a softphone and AI dialer CRM). It is a separate repo from internjobs-cms and is deployed from here as the Fly apps below. The internjobs-cms Workspace (`apps/parrot/`) is a different codebase that embeds Parrot in an iframe; see PARROT-RELATIONSHIP.md.

## Languages

**Primary:**
- JavaScript (ES modules, `"type": "module"`) - Express server in `server/` and React client in `client/src/`.

**Secondary:**
- Python 3.11 (`python:3.11-slim`) - LiveKit AI voice worker in `ai-agent/` (`agent.py`, `callback_transport.py`, `place_call.py`, `worker_routing.py`).
- Bash and Node `.mjs` scripts - ops tooling in `scripts/` and `scripts/zt/` (zero-trust provisioning and audit).
- No TypeScript in the repo (no `tsconfig*.json`).

## Runtime

**Environment:**
- Node 20: `node:20-slim` in `Dockerfile`; `NODE_VERSION 20.11.0` in the legacy `render.yaml`.
- Python 3.11 for the worker (`ai-agent/Dockerfile.worker`, `CMD ["python","agent.py","start"]`).

**Package Manager:**
- npm. Three independent manifests, no workspaces:
  - `package.json` (root, scripts only, no dependencies)
  - `server/package.json`
  - `client/package.json`
- Lockfiles: `package-lock.json`, `server/package-lock.json`, `client/package-lock.json` (all present).
- Python: `ai-agent/requirements.txt` (exact pins).

## Frameworks

**Core (server, `server/package.json`):**
- express ^5.2.1 - HTTP API. Entry `server/index.js`, DB init `server/init_db.js` and `server/db.js`.
- socket.io ^4.8.3 with `@socket.io/redis-adapter` ^8.3.0 and `redis` ^6 - realtime (live coaching, presence, live AI feed). The Redis adapter is optional and enabled only when `REDIS_URL` is set.
- pg ^8.18 and `@neondatabase/serverless` ^1.0.2 - Postgres. `USE_NEON_SERVERLESS=true` switches to Neon WebSocket-over-443 (local dev).
- node-cron ^4.2.1 - scheduler (AI queue tick, stale-call reaper, hourly CDR sync, number-optimization weekly job).
- `@clerk/express` ^2.1.22 and `@clerk/backend` ^3.4.14 - auth. `jose` ^5.10 - JWT/JWKS verification (embed and zero-trust access assertions).
- axios, nodemailer ^8, bcrypt ^6, cors, body-parser, express-fileupload, ws.

**Core (client, `client/package.json`):**
- React ^19.2.4, react-dom, react-router-dom ^7.13.
- Vite ^8 (`client/vite.config.js`: dev port 5173, proxies `/api`, `/socket.io`, `/health`, `/js`, recording streams to `localhost:3001`; build output `client/dist`).
- Tailwind ^4.2 via `@tailwindcss/postcss`.
- `@clerk/clerk-react` ^5.61, `@vapi-ai/web` ^2.5, `@telnyx/webrtc` (server manifest, softphone), chart.js ^4.5 and react-chartjs-2, lucide-react, dompurify, write-excel-file, socket.io-client.

**Core (AI worker, `ai-agent/requirements.txt`):**
- livekit-agents 1.6.4 plus plugins (rime, silero, turn-detector, deepgram, openai, anthropic), all pinned to 1.6.4.
- anthropic 0.115.0, aiohttp 3.14.1, httpx 0.28.1, requests 2.34.2, watchfiles 1.2.0.
- `livekit-server-sdk` ^2.17 is also in `server/package.json` (Node side, room and SIP control).

**Testing:**
- Server: Node built-in runner (`node --test`), with an explicit file list in `server/package.json` `test` and a `test:zero-trust` subset plus `test:zero-trust:postgres`. jest ^30 and supertest ^7 are devDependencies. Tests live in `server/test/` (157 files, incl. `server/test/zero-trust/`).
- Client: `node --test src/**/*.test.js` (`client/test/` and co-located).
- Worker: Python tests `ai-agent/test_*.py`.

**Build/Dev:**
- Docker multi-stage `Dockerfile`: builds the client (`npm ci`, `npm run build`) then a server image. The server is copied to `/app`, and the client build to `/client/dist` (the server references `../client/dist`). It also copies `ai-agent/prompts/` and `ai-agent/rime_voices_cache.json` into the Node image, because the web app reads them at runtime.
- Container start: `sh -c "node init_db.js && node index.js"`.
- ESLint ^9 (`client/eslint.config.js`).

## Key Dependencies

**Critical:**
- `@clerk/express` / `@clerk/backend` / `@clerk/clerk-react` - the auth path for employees. The publishable key is served to the SPA at runtime through `/api/config`.
- `@neondatabase/serverless` / `pg` - the single Postgres store, with all schema creation and migration inside `server/db.js` (idempotent boot-time DDL). There is only one standalone migration file, `server/migrations/001-hash-passwords.js`.
- `livekit-server-sdk` (Node) and `livekit-agents` (Python) - AI voice calling.
- `@telnyx/webrtc` - browser softphone.
- `jose` - Ed25519 and JWKS verification. Telnyx webhook public keys are parsed in `server/config.js` and `server/utils/telnyxSignature.js`.

## Configuration

**Environment:**
- Env vars via `dotenv` (`server/config.js`). Required at boot (non-test): `NEON_DATABASE_URL`, `TELNYX_API_KEY` (process exits if missing). Recommended: `ENCRYPTION_KEY` (SIP credential encryption). `server/.env.example` documents the Apollo and Clerk keys and the OpenClaw lead webhook. No `.env*` file contents were read.
- Non-secret config lives in `fly*.toml` `[env]`. Secrets are set with `fly secrets set`.
- Full env var name inventory is in `INTEGRATIONS.md`.

**Build:**
- `Dockerfile` (web), `ai-agent/Dockerfile.worker` (worker, build context is the repo root).
- `fly.toml` (prod web `parrot-o3vkuq`), `fly.dev.toml` (`parrot-dev`), `fly.ai-agent.toml` (dev worker `parrot-ai-agent`), `fly.ai-agent.prod.toml` (prod worker `parrot-ai-agent-prod`). All use `primary_region = "ams"`.
- `render.yaml` - legacy Render service `parrot-softphone` (`rootDir: server`). It appears stale next to the Fly configs.
- `client/vite.config.js`.

## Platform Requirements

**Development:**
- Node 20, Python 3.11 (worker only), a Neon (or any Postgres) database URL, a Telnyx API key. The Vite dev server proxies to the Express server on port 3001 (`PORT` default for dev; Fly sets `PORT=3000`).

**Production:**
- Fly.io, 4 apps (details above):
  - Web `parrot-o3vkuq` (prod) and `parrot-dev`: 1 GB shared-cpu x1, `min_machines_running = 1`, health check `GET /health`, `AI_WORKER_ENV` prod or dev.
  - Workers `parrot-ai-agent` and `parrot-ai-agent-prod`: 2 GB shared-cpu x2, always-on (no service block), restart policy "always", rolling deploy.
- Public hosts referenced in config: `parrot.projecta.ai` (prod callback URL), `parrot-dev.fly.dev` and `parrot-dev.projecta.ai` (dev), `parrot-embed-dev.projecta.ai`.
- No `.github/` directory, so there is no GitHub Actions CI in this repo. Deploys are manual `fly deploy`.
- Only 1 repo-level convention note: `CLAUDE.md` at the repo root, and a large `.planning/` tree (534 files under `.planning/milestones`).

## Repo Layout Relevant to Stack

- `server/` (Express app: `routes/` 41, `services/` 52, `middleware/` 9, `utils/` 13, `test/` 157)
- `client/src/` (185 files)
- `ai-agent/` (Python worker, prompts, Rime voice cache)
- `ops/zero-trust/` (167 files) and `scripts/zt/` (56 files): Cloudflare Access and zero-trust provisioning config and tooling. `docs/zero-trust/` and `docs/PARROT-*.md` cover embed and zero-trust.
- `scripts/telnyx/`, root `scripts/*.mjs`: AI worker provisioning and audits.

---

*Stack analysis: 2026-10-08*
