# Parrot relationship: apps/parrot vs PA-Ai-Team/Parrot

Phase 38-02 (MAP-05). Derived from `apps/parrot` in this repo (at the working tree) and `PA-Ai-Team/Parrot` at origin/main `74880e45226e4920cfdf1dec6b36bea5fd8a190b`. Facts table is machine-checked by `node scripts/verify-code-maps.mjs --relationship <this file>`.

## What each is

- **apps/parrot (internjobs-cms monorepo).** The employee-facing Workspace: a Cloudflare Worker (`internjobs-parrot`, `apps/parrot/wrangler.jsonc`, custom domain `workspace.internjobs.ai`) with a React Router app. Per its own wrangler header comment it was forked from `apps/agentic-inbox`, NOT from the Parrot repo. It holds mail, chat (Mattermost), meetings, Workers AI agent (via Cloudflare AI Gateway, `workers/lib/ai.ts`) and a Parrot pane.
- **PA-Ai-Team/Parrot (standalone repo).** The sales dialer product: Express + React + Postgres (Neon) on Fly.io (four Fly apps), Telnyx telephony, LiveKit AI voice worker in Python. No wrangler config, no CI under `.github`, no Cloudflare Worker, no TypeScript. Its root `package.json` has no `name` (scripts only).

## Direction of code flow

There is no shared source code and no vendored copy in either direction. The relationship is a runtime seam: the Workspace embeds Parrot in an iframe.
- Workspace Worker mints a short-lived embed token (`POST /api/embed/parrot-token`, `apps/parrot/workers/lib/embed-jwt.ts`) and loads `https://parrot.projecta.ai/embed` (`apps/parrot/app/lib/parrot-embed.ts`, `PARROT_EMBED_URL` in wrangler vars).
- Parrot verifies the token against Workspace's JWKS (`https://workspace.internjobs.ai/oidc/jwks`, `EMBED_JWKS_URI` / `EMBED_EXPECTED_ISS`, seeded into an `internjobs` embed tenant in `server/db.js` and `server/services/embedTenants.js`; embed routes in `server/routes/embed.js`).
- Parrot CSP interpolates `https://workspace.internjobs.ai`; Workspace CSP allows `frame-src https://parrot.projecta.ai`.

## Why both exist

Parrot predates the Workspace and is a separate product with its own users, DB, deploys and Clerk usage; the Workspace integrates it as a backing service (thin integration). unknown: why Parrot was never folded into the monorepo (ask Raj). Decision D1: Parrot is not moved or modified by this milestone.

## Reconciliation note: Cloudflare AI Gateway

The Parrot repo has no Cloudflare AI Gateway use (direct provider APIs and LiveKit inference). The memory note about the AI Gateway refers to apps/parrot (Workspace), where `workers/lib/ai.ts` routes through it. Not a conflict.

## Worktrees

Two local worktrees of the Parrot clone exist and are NOT mapped and stay untouched: `Parrot-wt-dedupe` (branch `fix/contact-dedupe-on-send`, head ece5eb8) belongs to open Parrot PR #11; `Parrot-wt-main-port` (branch `fix/sms-send-and-contact-dedupe-main`, head 11b2277) belongs to open Parrot PR #12. See `maps/parrot/WORKTREES.md`.

## Facts table

| fact | apps/parrot | PA-Ai-Team/Parrot |
| --- | --- | --- |
| worker_name | internjobs-parrot | none |
| package_name | parrot | none |
| shared_items | app/lib/parrot-embed.ts, workers/lib/embed-jwt.ts | server/routes/embed.js, server/services/embedTenants.js |
| must_not_change | worker name internjobs-parrot; custom domain workspace.internjobs.ai; route POST /api/embed/parrot-token; /oidc/jwks path | embed route /embed; embed tenant `internjobs` seed; hostname parrot.projecta.ai; EMBED_JWKS_URI and EMBED_EXPECTED_ISS semantics |
| relationship | other:runtime-embed-seam (iframe + signed token, no shared code) | other:runtime-embed-seam (iframe + signed token, no shared code) |
