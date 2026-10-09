---
phase: 38-code-map-coupling-inventory
plan: 02
verified: 2026-10-08T23:00:00Z
status: passed
score: 6/6 must-haves verified
gaps: []
advisories:
  - "T-guard-legacy-index and T-readonly-index fail when GIT_OPTIONAL_LOCKS=0 is exported (test-env fragility, not a tool defect)"
  - "--maps secret scan only matches *KEY= assignments (plan-compliant); SECRET=/TOKEN=/PASSWORD=/DB-URL-with-password not matched"
  - "maps/parrot/{STACK,ARCHITECTURE,INTEGRATIONS}.md equate the Parrot repo with the 'Workspace' naming and call its deploy a 'full replace'; contradicts PARROT-RELATIONSHIP.md"
---

# Plan 38-02 Verification Report

**Goal:** three stamped 7-doc code maps (cms, Parrot, legacy) and a machine-checked Parrot relationship doc, with a verifier that fails on stale/partial/leaking/repo-touching maps.
**Status:** passed (3 advisories, none blocking). Initial verification; review round 1 registered (breaker closed).

## Architectural Context Loaded
- No `.planning/NORTH-STAR.md`, no repo AGENTS.md/CLAUDE.md. Global CLAUDE.md rules applied: TDD RED-before-GREEN, read-only on Parrot/legacy, rrr flow. Memory rule "Workspace = true thin integration" is relevant to advisory 3.

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Entry gate `--gate-prev 38-01` (T-gate-plan) | VERIFIED | 38-01-VERIFICATION.md is `passed`; gate tests in the 81/81 suite pass. |
| 2 | `--maps` completeness (7 docs x 3 dirs) | VERIFIED | Live `--maps --manifest` exit 0. Mutation on scratchpad copy (deleted cms/CONCERNS.md) exit 1 naming `cms/CONCERNS.md: missing`. |
| 3 | Staleness stamps vs MANIFEST | VERIFIED | All 21 docs line 1 stamped: cms `internjobs-cms @ d1658aa5... 2026-10-08`, Parrot `PA-Ai-Team/Parrot @ 74880e45...`, legacy `growthpods/Internjobs @ 99bcced9...`; matches MANIFEST.json and ff-record/baseline. Mutation (parrot sha 74880e45 -> 74880e46) exit 1 naming the doc. |
| 4 | Map hygiene (secrets) | VERIFIED | Live clean. Independent broader grep (sk-, AKIA, ghp_, xox, PEM, JWT, SECRET/TOKEN/PASSWORD=, URL creds) over all maps and relationship doc: only commit shas. Redaction in parrot/TESTING.md: real Parrot tests (`server/test/aiCallNowRoute.test.js:35-37` at 74880e45) assign `LIVEKIT_URL='http://127.0.0.1:1'`, `LIVEKIT_API_KEY='fake'`, `LIVEKIT_API_SECRET='fake'`; nothing real was hidden. |
| 5 | Untouched repos; map dirs only in this repo | VERIFIED | Live `--guard --baseline` exit 0; `--parrot-ff-check --repo ~/Documents/Parrot --baseline ... --expect-after 74880e45...` exit 0; Parrot HEAD 74880e45; no MANIFEST/WORKTREES/PARROT-RELATIONSHIP files in either tree. Legacy/Parrot status per 38-02-GREEN-live.txt matches baseline. |
| 6 | `--relationship` agrees with files | VERIFIED | Live exit 0. Independently confirmed: `apps/parrot/wrangler.jsonc` name `internjobs-parrot` (no wrangler.toml; checker reads jsonc), `apps/parrot/package.json` name `parrot`; Parrot at 74880e45 has no wrangler config, no `.github`, root package.json has no `name`; `POST /api/embed/parrot-token` in `apps/parrot/workers/index.ts:369`; shared-item files exist in both trees (`app/lib/parrot-embed.ts`, `workers/lib/embed-jwt.ts`, `server/routes/embed.js`, `server/services/embedTenants.js`); `PARROT_EMBED_URL` in wrangler.jsonc:82; `/oidc/jwks` in `workers/app.ts:263`; `internjobs` embed tenant seed in `server/db.js:1253`; EMBED_JWKS_URI/EMBED_EXPECTED_ISS in Parrot. `must_not_change` and `relationship` rows present. |

## Test and TDD evidence
- `node --test scripts/verify-code-maps.test.mjs` with GIT_OPTIONAL_LOCKS unset: 81 pass, 0 fail.
- RED: `38-02-RED.txt` has 31 pass / 50 fail, failures are assertion failures from the stub ("not implemented", exit 2 vs expected 0/1), no ENOENT/unknown-flag noise. Committed in 54670f3 (22:29:50) together with the implementation; file mtime RED 22:28 < GREEN 22:29. RED-live (`38-02-RED-live.txt`, `-pre-stamp.txt`) show exit 1 before maps/stamps existed (maps commit f6a4d0b is later). GREEN-live shows all four modes exit 0. Caveat: RED and GREEN landed in the same commit, ordering shown by file times and content only.
- `lint-plan-truths.js --require-spec`: all 4 plans OK (9, 6, 7, 6 truths falsifiable, spec resolved).
- Live modes re-run by verifier: `--maps` 0, `--relationship` 0, `--guard` 0, `--parrot-ff-check` 0.

## Claim sampling (5+ per map, checked against tree)
- cms @ d1658aa: apps/ list (agentic-inbox, app, email-worker, employers, mac-bridge, marketing, mattermost-proxy, parrot-mattermost, parrot, startup; canary-monitor untracked/excluded) TRUE; workspaces exclude agentic-inbox/parrot/startup TRUE; apps/app node >=22, @clerk/backend 3.4.9, @mastra/core 1.35.0 TRUE; apps/parrot react ^19.1, react-router ^7.5.3, hono ^4.7, vitest ^3.2, drizzle ^0.45.1 TRUE; marketing wrangler name `internjobs-ai` TRUE; migrations through 0014 TRUE; mac-bridge launchd plist, employers playwright config, `.github/workflows/ci.yml` TRUE. 0 false.
- Parrot @ 74880e45: Dockerfile node:20-slim; server deps express ^5.2.1, socket.io ^4.8.3, pg ^8.18, node-cron ^4.2.1, jose ^5.10, @clerk/express ^2.1.22; ai-agent files and `python:3.11-slim` + `CMD python agent.py start`; fly configs; no tsconfig; render.yaml present; `server/services/telnyx.js`, `ops/zero-trust/callers.json`, `fly.ai-agent.prod.toml`; Fly app `parrot-o3vkuq` in fly.toml. 0 false facts, but see advisory 3 (framing).
- legacy @ 99bcced: 1 commit, 66 files; Next 14.1.4; `@mastra/core: latest`; drizzle ^0.45.1; render.yaml services internjobs-ai-frontend/-mastra, oregon, starter; router.agent gpt-4o-mini; LibSQL `MASTRA_DATABASE_URL || file:./data/mastra.db`; 36 CREATE TABLE; next.config.js inlines OPENAI/MASTRA/BRIGHT_DATA keys; drizzle.config.ts imports dotenv not in package.json; committed `data/mastra.db-shm/-wal` and `.env.local.example`; one API route. 0 false.

## Hygiene
- Nothing pushed? Branch is `ahead 8` of origin/docs/phase-38-code-map: unpushed local commits only, no push occurred.
- Untracked `.planning/.subagent-runs-state.json`, `.planning/subagent-runs.jsonl`, `apps/canary-monitor/` not tracked (git ls-files empty). Verifier created untracked `.review-rounds.json` in the phase dir (not committed; orchestrator may ignore or commit).
- Parrot map dir has 8 files (7 + `WORKTREES.md`, required by plan Task 3); `--maps` accepts it.

## Advisories (non-blocking)
1. Test fragility. `T-guard-legacy-index` and `T-readonly-index` use plain `git status` as a positive control that rewrites the index; with `GIT_OPTIONAL_LOCKS=0` exported (the very env the plan tells operators to use for legacy/Parrot calls) they fail (79/81, confirmed). The verifier tool itself is read-only and passes live under the variable, so this is a test-environment defect, not a product defect. Fix: have those two tests delete `GIT_OPTIONAL_LOCKS` from the child env for the control invocation only.
2. Scanner breadth. Mutation: appending `KEY_X=abcdefghijklmnop123` to a legacy doc is NOT flagged (regex needs the name to end in `KEY`; `scanSecrets` line 275). `SECRET=`, `TOKEN=`, `PASSWORD=`, and `postgres://user:pw@` are likewise unmatched. Plan spec only requires `KEY=`-style, and my broader grep found no real hit, so not a gap; consider broadening before 38-03/04 add more docs.
3. Parrot map framing. `maps/parrot/STACK.md:7` ("In the internjobs-cms repo it is called Workspace") and `ARCHITECTURE.md:11` ("the separate repo behind the Workspace naming") conflict with PARROT-RELATIONSHIP.md, where Workspace = `apps/parrot` and Parrot is an iframe-embedded backing service. `INTEGRATIONS.md:74` applies the "Workspace deploy = full replace" memory (about the internjobs-parrot Worker) to the Fly app `parrot-o3vkuq` without evidence in the Parrot repo. Recommend correcting these three lines before 38-03/04 consume the maps for the coupling inventory; the sample facts themselves are correct.

_Verifier: Claude (rrr-verifier)_
