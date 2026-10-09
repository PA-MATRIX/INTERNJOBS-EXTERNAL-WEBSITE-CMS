<!-- generated from internjobs-cms @ d1658aa5ba0ce397788cd79c34b425c459eaa0da on 2026-10-08 -->
# Codebase Concerns

**Analysis Date:** 2026-10-08
**Baseline:** merged main `d1658aa5ba0ce397788cd79c34b425c459eaa0da` (an ancestor of the working HEAD `54670f3`, which adds only Phase 38 verifier files). Files enumerated with `git ls-files`. Untracked `apps/canary-monitor/` is not mapped.

## Architectural Context Loaded

- Locked source: `/Users/rajren/.claude/CLAUDE.md` (global RRR rules). Findings below are not RRR-process findings.
- `.planning/NORTH-STAR.md`: not present in this repo.
- Memory `project-llm-via-ai-gateway`: Parrot LLM calls go through CF AI Gateway; the student app stays on direct REST. Intentional, so it is not listed as a concern.
- Memory `project-auth-architecture`: two (later three) separate Clerk apps. Intentional, not a concern.
- Memory `project-workspace-deploy-full-replace`: deploy `internjobs-parrot` only from main. Recorded below as a fragile area.
- Memory `project-phone-sms-architecture` and `project-dailyco-vanity-domain`: placeholder or deferred features are intentional.
- ADQ: none raised.

## Tech Debt

**Oversized single-file modules:**
- Issue: A few files hold very large amounts of logic, which makes changes risky and review slow.
- Files: `apps/parrot/app/components/ChatPane.tsx` (3498 lines), `apps/marketing/src/App.tsx` (2825), `apps/parrot/workers/index.ts` (2755), `apps/parrot/workers/durableObject/index.ts` (2043), `apps/app/src/server.mjs` (2028), `apps/app/src/workflows/student-inbound.mjs` (1716), `apps/app/src/store.mjs` (1577), `infra/startup-api/src/index.mjs` (1506).
- Impact: Merge conflicts between teams, hard to test in isolation.
- Fix approach: Split by route group or feature when a phase touches them. Extract Hono sub-routers from `apps/parrot/workers/index.ts` into `apps/parrot/workers/routes/`. Split `ChatPane.tsx` into sub-components.

**Duplicated agent-inbox code:**
- Issue: `apps/agentic-inbox/` and `apps/parrot/` have parallel Durable Object and AgentPanel implementations (`apps/agentic-inbox/app/components/AgentPanel.tsx` vs `apps/parrot/app/components/AgentPanel.tsx`).
- Impact: A bug fix in one will not reach the other.
- Fix approach: Decide which is the system of record, or extract shared code into `packages/shared`, which has only 1 tracked file.

**Unresolved TODOs (production-adjacent):**
- `apps/agentic-inbox/workers/index.ts:139` deletes the R2 object but not the DO data or attachment blobs. This is a data-retention gap.
- `apps/email-worker/src/index.js:50` has no durable buffering. It uses an operator-forward fallback, with a CF Queue deferred (TODO v1.3).
- `apps/employers/functions/api/[[path]].ts:470,495` returns `unread_count: 0`, and `GET /v1/threads/:id/messages` is missing in `infra/startup-api` (TODO 28.5-04 or v1.5). The UI gets an empty thread shell.
- `apps/startup/workers/routes/voice.ts:47` logs verbose output that should be pruned after the first successful calls.
- `apps/app/src/workflows/student-inbound.mjs:1511` has a TODO(upstream) about `composePrompt()` input computation.
- `apps/parrot/workers/lib/agent-tools.ts:94` has no SQL LIKE/FTS search (PARROT-SEARCH).
- `apps/parrot/app/components/ParrotMascot.tsx:7` uses a placeholder mascot.

**Mixed languages and typing:**
- Issue: The student app (`apps/app/src/*.mjs`), `infra/*/src/index.mjs` and `apps/email-worker/src/index.js` are untyped JS, while Parrot, Startup and Employers are TypeScript.
- Impact: Contract drift across packages. `scripts/check-email-timeout-invariant.mjs` exists because a cross-package constant was already at risk.
- Fix approach: Put shared contracts in `packages/shared` and extend the invariant-script pattern to other cross-package constants.

**Type escapes:**
- Issue: `as any`, `@ts-ignore` and `eslint-disable` appear in `apps/agentic-inbox/workers/index.ts` (7), `apps/agentic-inbox/workers/durableObject/index.ts` (6), `apps/agentic-inbox/app/components/AgentPanel.tsx` (5) and Parrot tests.
- Fix approach: Type the DO RPC boundaries.

## Known Bugs

None confirmed from static review. The documented prior incidents are listed under Fragile Areas.

## Security Considerations

**Open CORS on MCP routes:**
- Risk: `cors({ origin: "*" })` on `/mcp` and `/mcp/*`.
- Files: `apps/startup/workers/app.ts:51,55`.
- Current mitigation: Bearer auth middleware (`bearerAuth`) in the same file. The wildcard is intentional for Cursor and ChatGPT connectors.
- Recommendations: Confirm no cookie auth reaches these routes. Keep the bearer check mandatory.

**Hard-coded operator email in source:**
- Risk: A personal address is committed as `OPERATOR_FALLBACK` in `apps/email-worker/src/index.js`. If the Cloudflare destination is unverified, `message.forward()` fails silently.
- Recommendations: Move it to a Worker var or secret and add an alert for failed forwards.

**No inbound safety screening on the startup path:**
- Risk: `apps/startup/workers/routes/email.ts` has no Lakera screening, whereas Parrot screens its mailbox.
- Recommendations: Add screening in a later phase, as the file's own header notes.

**Secret rotation backlog:**
- Risk: SEC-ROTATE items are open. `apps/app/test/integ-01-runbook.md` includes Clerk key rotation (SEC-ROTATE-01), and the memory notes secrets parked in `~/Archives` awaiting Infisical push or rotation.
- Recommendations: Complete the rotation and push to Infisical. Never commit values.

**Prompt injection and pairing surface:**
- Files: `apps/app/src/server.mjs` (webhook `/webhooks/mac-bridge`, pairing codes), `apps/mac-bridge/`.
- Risk: Inbound iMessage and email text feeds LLM workflows in `apps/app/src/workflows/student-inbound.mjs`. Webhook authenticity depends on shared-secret handling.
- Recommendations: Keep signature checks tested, and add negative-control tests for any new webhook.

## Performance Bottlenecks

**Single large Durable Objects:**
- Files: `apps/parrot/workers/durableObject/index.ts`, `apps/agentic-inbox/workers/durableObject/index.ts`.
- Cause: All per-employee or per-mailbox state and logic is serialised through one DO. Graph calls go over HTTP to Fly (`apps/parrot/workers/lib/graph.ts`, `infra/graph-api/src/index.mjs`).
- Improvement path: Cache graph reads. Keep the email latency budget (the Phase 33 cross-package contract in `apps/startup/workers/routes/email.ts`) enforced by `scripts/check-email-timeout-invariant.mjs`.

## Fragile Areas

**Workspace deploy is a full replace:**
- Files: `apps/parrot/wrangler.jsonc`.
- Why fragile: Deploying from a phase branch removed the Phase 36 Spam/Trust-sender feature in prod (fixed 2026-10-08, v1.5.1).
- Safe modification: Deploy `internjobs-parrot` only from main. The CI dry-run is advisory only.

**Fly-hosted single instances:**
- Files: `infra/falkordb/`, `infra/graph-api/`, `infra/startup-api/`, `infra/mattermost-db/` (each has a `fly.toml`).
- Why fragile: FalkorDB and Mattermost DB run as stateful single services. Neon-exit and Mattermost migration steps are documented only in `infra/NEON-EXIT.md` and `infra/mattermost-db/MIGRATION.md`.
- Safe modification: Take a backup first and follow the runbooks.

**Mac bridge dependency:**
- Files: `apps/mac-bridge/`.
- Why fragile: iMessage depends on one HostMyApple Mac mini. Outages come in two kinds, lost IDS registration and a parked macOS setup screen. SSH is firewalled, and access is through NoMachine :4000.
- Safe modification: Check `bridge.internjobs.ai/health` before calling it down. Do not reboot on `Setup state 1`.

**Phase-branch shared files:**
- Files: `.planning/STATE.md`, `.planning/workstreams/*/SUBMISSION.json` (legacy).
- Why fragile: Concurrent phase branches conflict on them. Per-phase `submissions/<phase>.json` and `scripts/submit-phase.mjs` mitigate this.

## Scaling Limits

**Email path without queue:**
- Current capacity: Synchronous forward to Fly with an operator-inbox fallback (`apps/email-worker/src/index.js`).
- Limit: A burst or a Fly outage degrades to manual handling.
- Scaling path: CF Queue plus a retry consumer (TODO v1.3).

## Dependencies at Risk

Not assessed in depth. Lockfiles are present for `infra/graph-api` and `infra/startup-api`. Worker runtimes (Cloudflare, Hono, agents SDK, `postal-mime`) move quickly. Pin versions and keep the CI `npm ci` steps.

## Missing Critical Features

**Thread messages endpoint:**
- Problem: `GET /v1/threads/:id/messages` is absent in `infra/startup-api`.
- Blocks: Real thread views in `apps/employers`.

**Observability:**
- Problem: No error tracker is detected. Code relies on `wrangler tail` and structured logs.
- Blocks: Detecting silent failures such as forward failures.

## Test Coverage Gaps

Test files counted by `git ls-files`: `apps/parrot` 24, `apps/app` 4, `apps/startup` 4, `apps/email-worker` 1, `apps/employers` 1, plus `scripts/verify-code-maps.test.mjs` and `scripts/verify-v15-promotion.test.mjs`.

**Untested apps:**
- Files: `apps/marketing/` (including the 2825-line `src/App.tsx`), `apps/agentic-inbox/` (36 tracked files, none are tests, and it has 18+ type escapes), `apps/mac-bridge/`, `apps/mattermost-proxy/`, `apps/parrot-mattermost/`, `infra/graph-api/` (only `smoke.mjs`), `infra/startup-api/`.
- Risk: Regressions go unnoticed. `infra/startup-api/src/index.mjs` (1506 lines) is the backend for the Employers and Startup apps and has no tests.
- Priority: High for `infra/startup-api` and `apps/agentic-inbox`, Medium for `apps/mac-bridge`, Low for `apps/marketing` (visual).

**CI gaps:**
- Files: `.github/workflows/ci.yml`.
- Risk: The student app only runs `npm run build:app`, with no tests. The wrangler dry-runs are advisory. There is no CI for `apps/agentic-inbox`, `apps/mattermost-proxy` or `infra/*`.
- Priority: Medium.

---

*Concerns audit: 2026-10-08*
