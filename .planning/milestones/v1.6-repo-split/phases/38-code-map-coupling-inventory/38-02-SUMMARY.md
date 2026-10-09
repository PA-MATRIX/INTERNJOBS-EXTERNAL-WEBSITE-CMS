---
phase: 38-code-map-coupling-inventory
plan: 02
subsystem: code-mapping
tags: [code-map, verifier, parrot-relationship, read-only]
requires: [38-01 verified]
provides: [".planning/codebase/ (7 docs)", "maps/parrot (7 + WORKTREES.md)", "maps/legacy (7)", "PARROT-RELATIONSHIP.md", "verify-code-maps --maps/--relationship"]
affects: [38-03, 38-04]
key-files:
  created: [PARROT-RELATIONSHIP.md, maps/parrot/*, maps/legacy/*, maps/MANIFEST.json]
  modified: [scripts/verify-code-maps.mjs, scripts/verify-code-maps.test.mjs, .planning/codebase/*]
decisions: []
duration: multi-session
completed: 2026-10-08
---

# Phase 38 Plan 02: Code maps (cms, Parrot, legacy) + Parrot relationship Summary

## What Shipped

Three stamped 7-doc code maps (cms at d1658aa, Parrot at origin/main 74880e4, legacy at 99bcced), a Parrot relationship document whose facts table is machine-checked against both trees, and verifier modes `--maps` and `--relationship` proven with negative controls. Parrot and legacy were not modified.

Relationship finding: apps/parrot (Cloudflare Worker `internjobs-parrot`, forked from agentic-inbox) and PA-Ai-Team/Parrot (Express/React/Fly dialer) share no source; the link is a runtime iframe embed seam with signed token and JWKS verification. The AI Gateway question is reconciled: the gateway is used by apps/parrot (`workers/lib/ai.ts`), not by the Parrot repo.

## Evidence (RED before GREEN)

- RED (tests): `38-02-RED.txt` (stub exit 2, assertion failures). GREEN (tests): `38-02-GREEN.txt`.
- RED (live, no maps): `38-02-RED-live.txt`. RED (live, docs present but unstamped): `38-02-RED-live-pre-stamp.txt`, `--maps` exit 1 (21 stamp failures plus one secret-shaped hit), `--relationship` exit 1 (doc absent).
- GREEN (live): `38-02-GREEN-live.txt`: `--maps` 0, `--relationship` 0, `--guard` 0, `--parrot-ff-check` 0; Parrot `status --short` empty; legacy porcelain identical to baseline (4 modified + 3 untracked).
- `node --test scripts/verify-code-maps.test.mjs`: 81/81 pass. Note: two 38-01 tests (T-guard-legacy-index, T-readonly-index) fail if run with `GIT_OPTIONAL_LOCKS=0` exported in the shell, because they rely on plain `git status` rewriting the index. They pass in a clean env.
- `lint-plan-truths.js --require-spec`: 4 plans clean.

Spot-check claims for the verifier (5 per map, each provable by the named file):
- cms: `apps/` holds agentic-inbox, ai-worker, app, canary-monitor (untracked, excluded), email-worker, employers, mac-bridge, marketing, mattermost-proxy, parrot, parrot-mattermost, startup (ls apps); apps/parrot is a Worker named internjobs-parrot (`apps/parrot/wrangler.jsonc`); AI via Gateway (`apps/parrot/workers/lib/ai.ts`); CI in `.github/workflows/ci.yml`; TypeScript in `apps/parrot/package.json` and `packages/shared/src/index.ts`.
- Parrot: Python worker `ai-agent/agent.py`; Telnyx `server/services/telnyx.js`; zero-trust policy `ops/zero-trust/callers.json`; Fly config `fly.ai-agent.prod.toml`; root `package.json` has no name; no wrangler config.
- legacy: single commit 99bcced, 66 files; Next.js (`next.config.js`); Drizzle (`drizzle.config.ts`); Playwright (`playwright.config.ts`); `render.yaml` deploy; `drop-tables.sql` at root.

## Deviations from Plan

- [Rule 1 - Bug] `maps/parrot/TESTING.md` quoted a `process.env.X = '...'` line that the secret scan flagged as a dotenv assignment. Doc line redacted to a comment; checker not weakened. Value was a fake loopback URL, not a secret.
- Extra evidence file `38-02-RED-live-pre-stamp.txt` (not in plan) records the stamp-stage RED.
- Limitations: cms ARCHITECTURE/STRUCTURE descriptions of `apps/app/src/*` and Parrot `lib/` come from names and routes, not full reads. cms docs describe d1658aa; working HEAD is later (Phase 38 files only).

## Rulings

None - no plan conflicts arose.

## Authentication Gates

None. Permission prompts for out-of-cwd paths were handled by the orchestrator.

## Decisions for Raj

- (a) Ship 38-02 as planned (done, kept whole) vs. splitting mapping from checker work: moot now; recorded for future size guidance.
- (b) `apps/canary-monitor/` is excluded from the cms map until committed; map it later once tracked?
- unknown (in PARROT-RELATIONSHIP.md): why Parrot was never folded into the monorepo.

## Next Phase Readiness

Position records set to `executed, pending verification`. Next: rrr-verifier on 38-02 (sample claims against the trees), then plan 38-03.
