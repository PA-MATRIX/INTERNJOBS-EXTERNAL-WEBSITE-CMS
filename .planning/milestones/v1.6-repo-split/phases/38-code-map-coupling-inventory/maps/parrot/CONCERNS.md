<!-- generated from PA-Ai-Team/Parrot @ 74880e45226e4920cfdf1dec6b36bea5fd8a190b on 2026-10-08 -->
# Codebase Concerns (Parrot, PA-Ai-Team/Parrot, main)

**Analysis Date:** 2026-10-08
**Source:** read-only, `origin/main` sha `74880e45226e4920cfdf1dec6b36bea5fd8a190b`, main worktree `/Users/rajren/Documents/Parrot`. All paths below are repo-relative to that repo.

## Architectural Context Loaded

- `.planning/NORTH-STAR.md`: not present in `/Users/rajren/internjobs-cms`. No locked NORTH-STAR rule applies.
- Memory (global MEMORY.md index) relevant entries: "Workspace = true thin integration" (Parrot is the backing service for Workspace SMS/phone) and "Workspace deploy = full replace" (deploy internjobs-parrot only from main). These shape the coupling findings below. No `*-locked*` memory files were opened.
- Scope note: this doc maps the Parrot repo only. Items touching internjobs-cms (Workspace embed, Clerk apps) are coupling facts, not gaps.

## Tech Debt

**Monolithic server files:**
- Issue: very large single files hold most backend logic.
- Files: `server/db.js` (~117 KB, 116 `ALTER TABLE`/schema statements, inline boot-time migrations and seeds), `server/routes/ai-calls.js` (~109 KB), `server/routes/webhooks.js` (~84 KB), `server/routes/admin.js` (~73 KB), `server/routes/calls.js` (~57 KB), `server/routes/contacts.js` (~55 KB), `ai-agent/agent.py` (~131 KB).
- Impact: any split of the repo or extraction of a module (SMS/phone, AI dialer) must cut through these files. Merge conflicts are likely.
- Fix approach: extract by domain (schema, AI dialer, webhooks) before moving code across repos.

**Schema managed by idempotent boot-time DDL, no migration framework:**
- Issue: `server/db.js` runs `ALTER TABLE ... IF NOT EXISTS` and seeds on every boot. `server/migrations` is a single entry.
- Files: `server/db.js`, `server/init_db.js`, `server/migrations`.
- Impact: no versioned rollback and boot-order dependence. The code itself documents an ordering hazard (internjobs org vs email_inbox seed guard, `server/db.js` ~1329-1354).
- Fix approach: introduce versioned migrations before multiple deployers touch the schema.

**Planning artifacts and evidence committed into the product repo:**
- Issue: 534 files under `.planning/milestones`, 167 under `ops/zero-trust`, plus multi-hundred-KB test-output dumps.
- Files: `.planning/milestones/v6.1/phases/45-cloudflare-zero-trust/*-SERVER-TESTS.txt` (up to ~338 KB each, ten files), `ops/zero-trust/capabilities.json` (~164 KB), `ops/zero-trust/evidence/dev-provider-audit.json` (~137 KB), `.planning/artifacts/zt-dev-baseline/` (a full duplicate copy of `db.js` and `middleware/`).
- Impact: repo bloat, grep noise (TODO scans mostly hit planning docs), duplicate source copies that can drift or be mistaken for live code.
- Fix approach: exclude `.planning/artifacts/` and evidence dumps from code maps and from any split.

**Vendored/minified and cache blobs in source tree:**
- Files: `server/public/js/telnyx_webrtc.min.js` (~112 KB), `ai-agent/rime_voices_cache.json` (~243 KB).
- Impact: version of the Telnyx WebRTC client is not tracked by a package manifest.

**Root `package.json` is only script shims:**
- Files: `package.json` (jarvis, mcp:setup, visual:proof, browser:uat, scaffold:e2e, chrome:visual, sessions:index). No workspace manifest; `server/package.json` and `client/package.json` are independent.
- Impact: no single install/test entry point; CI not visible (see below).

## Known Bugs

No open bug markers found. Source TODO/FIXME scan returned essentially only planning docs. One deliberate note: `server/db.js` ~1693 "Phase 37 owns the cost model + CDR boundary match" (intentional, not a TODO).
- Known failing test per phase 46 evidence: `devRecovery` fails in the server suite (1744/1746 pass). A flaky `aiDialOverrideGuardrails` was observed once. Files: `server/test/` (see Test Coverage Gaps).

## Security Considerations

**Database TLS verification disabled:**
- Risk: man-in-the-middle on the Postgres connection.
- Files: `server/db.js` line ~34, `ssl: { rejectUnauthorized: false }` (non-Neon-serverless branch).
- Mitigation: Neon serverless branch skips this. Recommendation: pin CA or use verify-full.

**Wide-open CORS:**
- Files: `server/index.js` line ~115, `app.use(cors());` with no origin allowlist globally. Per-API-key origins exist in `server/middleware/apiKeyAuth.js` only.
- Recommendation: restrict to known origins (`parrot*.projecta.ai`, `workspace.internjobs.ai` embed).

**Hardcoded operator identity seeded on boot:**
- Files: `server/index.js` lines ~168-180 (`seedAdmin`, inserts `rraj@projecta.ai` as admin in org `projecta`), `server/db.js` ~1450-1461 (operator promotion).
- Impact: identity and org slug are baked into code; a split or a new environment silently creates this admin.

**Error message leakage:**
- Files: `server/routes/*` (12 occurrences of `res.status(500).json({ error: err.message })`-style responses).
- Recommendation: return generic errors, log detail server-side.

**Secrets handling:**
- Files: `.gitignore` ignores `.env`, `.mcp.json`, `server/scripts/innovantech-cutover/rollback-logs/` (comment says a captured Telnyx key lived there). `server/.env.example` exists. Evidence JSON such as `ops/zero-trust/evidence/dev-worker-credentials-staged.json` records only credential names and flags (no values seen; checked with values redacted). ~105 distinct `process.env.*` names are read across `server` and `client/src`.
- Recommendation: before any repo split or history rewrite, run a secret scan across history, since a captured key once existed in rollback logs and `.planning/` holds ~800 evidence files. Rotation status of that Telnyx key is not recorded in code.

**Logging volume:**
- ~760 `console.log/error` calls in `server/`, no structured logger. Risk of PII (phone numbers, call content) in logs. Files: `server/routes/webhooks.js`, `server/routes/ai-calls.js`.

## Performance Bottlenecks

Not measured. Large synchronous boot DDL in `server/db.js` runs on every start (connection timeout 15 s, query timeout 60 s). `client/src/hooks/useWebRTC.js` (~47 KB) and `client/src/features/campaigns/CampaignTable.jsx` (~44 KB) are the largest client units.

## Fragile Areas

**Cross-repo coupling to internjobs-cms / Workspace (key for the split):**
- `server/config.js` lines ~222-223: `EMBED_JWKS_URI` / `EMBED_EXPECTED_ISS` point to `https://workspace.internjobs.ai` (`/oidc/jwks`). Parrot verifies Workspace-issued embed tokens.
- `server/middleware/bearerVerifier.js` (and baseline copy): bearer is either Parrot embed HS256 token or a Clerk token via `@clerk/backend`. Comment documents a past bug where the public `verifyToken` does not return `{data, errors}`; pinned by `server/test/clerkVerifyTokenContract*`.
- `server/db.js` ~1139-1148, 1247-1354: `users.clerk_user_id` column, seeded `internjobs` org (slug) with explicit entitlements, and a guard preventing default `email_inbox` entitlement for it. CSP interpolates `https://workspace.internjobs.ai` (~153, 192).
- `server/utils/clerk.js` used by `server/routes/admin.js` and `server/routes/saas-admin.js` (ensure/delete/revoke Clerk users). `server/scripts/import-users-to-clerk.js` exists. Impact: Parrot has its own Clerk dependency, which is a separate instance from the Students/Employees apps in internjobs-cms. Confirm which Clerk app it uses before moving secrets.
- Embed demo pages hardcode `https://parrot-dev.projecta.ai` and `https://parrot-embed-dev.projecta.ai` in `client/src/pages/DevEmbedDemoPage.jsx` and `server/services/devEmbedDemo.js`.

**Hardcoded environment hostnames in AI worker routing:**
- Files: `ai-agent/worker_routing.py` (lines ~16-21: dev allows `parrot-dev.fly.dev` / `parrot-dev.projecta.ai`, prod `parrot.projecta.ai`), `ai-agent/test_worker_routing.py`. Renaming or moving domains requires code edits.
- Also `server/routes/contacts.js` ~867 posts to `https://aeo.projecta.ai/api/webhook/audit` (hardcoded external dependency on another Projecta service).
- `ai-agent/agent.py` ~1440 string-matches `"projecta"` in the opener to decide the recording-notice branch (brand string used as logic).

**Deploy topology (Fly + Cloudflare Zero Trust):**
- Files: `fly.toml`, `fly.dev.toml`, `fly.ai-agent.toml`, `fly.ai-agent.prod.toml`, `Dockerfile`, `ai-agent/Dockerfile.worker`, `scripts/provision-ai-workers.mjs`, `scripts/verify-ai-worker-split.mjs`, `scripts/inspect-ai-workers.mjs`, `ops/zero-trust/`, `scripts/zt/` (56 files). Prod and dev AI workers are separate Fly apps with Access client credentials staged but (per evidence) not always deployed.
- Why fragile: dev/prod routing guards are code-enforced; the evidence trail shows approval-hash gated assistant creates (phase 46). Changing any guard rule needs a grep of every enforcement site (`ai-agent/worker_routing.py`, `scripts/verify-ai-worker-split.mjs`, `ops/zero-trust/`).

**Stray root file:** `TELNYX_LEAK_FIX_DEPLOY_NOTES.md/` is a directory named like a file (1 entry) at repo root. Likely accidental; verify before relying on path.

## Scaling Limits

Not measured. Single Postgres pool; AI dialing uses claim leases (`server/test/aiClaimLease.test.js`) and dispatch lock, so concurrency design exists but limits are undocumented.

## Dependencies at Risk

- `@clerk/backend` 3.x: public `verifyToken` return shape changed historically (see `server/middleware/bearerVerifier.js`). Pinned by a contract test.
- Telnyx (SDK, WebRTC min.js, webhook signature verification in `server/routes/webhooks.js`): provider lock-in; Phase 44 raw-body capture depends on middleware order in `server/index.js`.
- `server/package-lock.json` present; client lockfile and Python `ai-agent/requirements.txt` pinning level not verified.

## Missing Critical Features

- No CI configuration in the tree (no `.github/` directory). Test, lint and deploy gates are manual or script-driven (`scripts/jarvis.sh`, ~46 KB).
- No structured logging, no error tracking service detected in code.

## Test Coverage Gaps

- Server: 157 files under `server/test/`; strong on AI dialer, entitlement, compliance. Suite state: 1744/1746 passing at the last recorded run, with `devRecovery` failing.
- Client: only 16 `*.test.js` unit files under `client/src` (utils, embed, practice) plus `client/test/zero-trust-browser/run.test.mjs`. No component or hook tests for `client/src/hooks/useWebRTC.js` or the large feature components. Priority: Medium.
- Python: `ai-agent/test_worker_routing.py` only seen; `ai-agent/agent.py` (131 KB) coverage is thin. Priority: High given call compliance (recording notice) logic lives there.
- Route files `server/routes/webhooks.js`, `admin.js`, `contacts.js`: covered only indirectly via named route tests; no coverage tool configured.

## Operator Review Items (ADQ)

- ADQ-1: Should Parrot keep its own Clerk integration (`server/utils/clerk.js`, `users.clerk_user_id`) or consume the Workspace OIDC/JWKS embed identity only? Options: (a) keep both, (b) embed-only, (c) migrate to the Employees Clerk app. Not decided here (see memory "Auth: two Clerk apps, not one").
- ADQ-2: Should `.planning/` and `ops/zero-trust/evidence/` history travel with Parrot in a split, or be archived separately? Affects secret-scan scope.

---

*Concerns audit: 2026-10-08*
