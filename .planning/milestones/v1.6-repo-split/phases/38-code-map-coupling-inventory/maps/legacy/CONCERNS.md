<!-- generated from growthpods/Internjobs @ 99bcced93f997c8f09147c0cb18e132f8f3da751 on 2026-10-08 -->
# Codebase Concerns: legacy repo growthpods/Internjobs

**Analysis Date:** 2026-10-08
**Source:** `/Users/rajren/MayaOS/internjobs-ai`, committed tree only at HEAD `99bcced93f997c8f09147c0cb18e132f8f3da751` (single commit, dated 2025-12-21). Read via `GIT_OPTIONAL_LOCKS=0 git show/ls-tree/grep`. Working-tree changes to `package.json`, `package-lock.json`, `src/app/api/chat/route.ts`, `tests/e2e/chat-interface.spec.ts` were NOT read; every path below describes the committed blob. No `.env*` content was opened and no secret values appear here.

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` exists in `/Users/rajren/internjobs-cms`.
- Locked source: `/Users/rajren/.claude/projects/-Users-rajren-internjobs-cms/memory/MEMORY.md` (index lines only) says "Auth: two Clerk apps, not one" and "App naming: 3 apps in repo". The legacy repo uses neither Clerk nor that app layout (it uses Neon Auth plus a single Next.js app). Differences from the current repo below are inventory facts, not gaps, and none is flagged as a defect against those rules.
- Milestone context: `v1.6-repo-split` phase 38 (code map and coupling inventory). This doc feeds coupling decisions, so items affecting a split are tagged **[SPLIT]**.
- Any decision on what to keep, port or drop is an operator decision. Items worded "ADQ" below need that call.

## Scale and Shape (context for every concern)

- Small prototype: 65 committed files (excluding playwright-report, test-results and .env*), 1 commit, no history to mine.
- Stack at HEAD: Next.js `14.1.4`, React 18, Drizzle ORM `^0.45.1` on `@neondatabase/serverless`, Mastra (`@mastra/core`, `@mastra/libsql`, `@mastra/memory`, all `latest`), `@assistant-ui/react` `^0.5.x`, Playwright. Deploy target declared in `render.yaml` (Render web service `internjobs-ai-frontend`, region oregon, plan starter).
- Source layout: `src/app` (page, layout, providers, one API route `src/app/api/chat/route.ts`), `src/components/{chat,tools,assistant-ui,ui}`, `src/db/{index.ts,schema/*,migrations/*}`, `src/lib/{agents,mastra,services,tools,auth}`, `tests/e2e/chat-interface.spec.ts`, `memory-bank/*.md`.

## Tech Debt

**Stub implementations presented as features:**
- Issue: UI tool components and agent steps are TODO shells.
- Files: `src/components/tools/ApplicationStatus.tsx` (lines 12, 29), `src/components/tools/CandidateList.tsx` (15, 41), `src/components/tools/JobPosting.tsx` (13), `src/components/tools/ResumeEditor.tsx` (13, 46), `src/lib/agents/student-onboarding.agent.ts` (57 DB save, 66 memory save), `src/lib/tools/job-discovery.tool.ts` (107 "actual database query with joins to orgs and tags").
- Impact: Onboarding never persists a profile and job discovery never queries the real schema, so the agent layer is not wired to the database it declares. Only 10 TODO markers, but they sit on the core product path.
- Fix approach: Treat the legacy agent code as reference only. **[SPLIT]** Do not count these files as live behaviour when inventorying coupling.

**Two parallel persistence systems for chat memory:**
- Issue: Chat history is stored through Drizzle tables (`chat_sessions`, `chat_messages`, `conversation_context`, `agent_handoffs` in `src/db/schema/conversations.ts`, accessed by `src/lib/services/memory.service.ts`) while Mastra has its own libsql memory (`src/lib/mastra/index.ts` uses `MASTRA_DATABASE_URL` or `file:./data/mastra.db`; `src/lib/mastra/config.ts` uses `DATABASE_URL` or `file:mastra.db`).
- Files: `src/lib/mastra/index.ts`, `src/lib/mastra/config.ts`, `src/lib/services/memory.service.ts`, `src/db/schema/conversations.ts`.
- Impact: Two Mastra config files point at different default stores. `config.ts` can receive a Postgres `DATABASE_URL` into a libsql `url`, which is a likely mismatch. Behaviour depends on which file is imported.
- Fix approach: Pick one memory store before any port. ADQ for the operator.

**Destructive ad-hoc DB scripts committed at repo root:**
- Files: `drop-conversation-tables.js`, `drop-tables.sql`.
- Issue: Both run `DROP TABLE IF EXISTS ... CASCADE` on `agent_handoffs`, `conversation_context`, `chat_messages`, `chat_sessions`. The JS version loads `.env.local` and runs against whatever `DATABASE_URL` is set, with no environment guard or confirmation.
- Impact: Running it with a production URL drops all conversation data. These tables are the same ones `memory.service.ts` depends on.
- Fix approach: Do not carry these scripts into any new repo. **[SPLIT]** Exclude from any copied tree.

**Single-commit history, no changelog:**
- Impact: No blame or history to explain design intent. `memory-bank/*.md` (`projectbrief.md`, `techContext.md`, `systemPatterns.md`, `progress.md`, `activeContext.md`, `productContext.md`) is the only narrative and may be stale against the code.

## Known Bugs

**Fake streaming of a fully generated response:**
- Symptoms: `src/app/api/chat/route.ts` awaits `routerAgent.generate(...)`, then splits `result.text` on spaces and emits chunks with `setTimeout` per index to simulate streaming.
- Trigger: Every chat request.
- Impact: Latency is full generation time plus the simulated delay. `export const maxDuration = 30` caps the route, so long generations time out. Timers can still fire after a client disconnect.
- Workaround: None in code.

**Context extraction is a one-line regex:**
- Files: `src/app/api/chat/route.ts` (matches `my name is (\w+)` and stores a `profile` context with a 90 value).
- Impact: Misses multi-word and non-ASCII names; "my name is" inside other text triggers it. This is the only context extractor.

**Next.js API misuse for the pinned version:**
- Files: `src/app/api/chat/route.ts` (`const cookieStore = await cookies();` is the Next 15 form), `next.config.js` (`serverExternalPackages` is the top-level Next 15 key; Next `14.1.4` expects `experimental.serverComponentsExternalPackages`).
- Impact: The external-packages setting is likely ignored on 14.1.4, which can break bundling of `@mastra/*`. `await` on a sync `cookies()` happens to work in 14 but signals that code was written for a different Next version.
- Fix approach: Pin versions deliberately. **[SPLIT]** Do not assume this code runs unmodified on the current repo's Next version.

## Security Considerations

**Anonymous identity is a client-controlled cookie:**
- Risk: `userId` is read from a cookie; if absent a `temp_<nanoid>` is minted. The code comment says "in production, this would come from auth". `sessionId` may also be supplied in the POST body (`providedSessionId`), and is then reconciled with the session found by `userId`.
- Files: `src/app/api/chat/route.ts`.
- Current mitigation: cookies are `httpOnly`, `sameSite: 'strict'`, `secure` in production. This protects transport, not identity.
- Recommendations: Nothing in the route calls `NeonAuth`. There is no authorization on the chat endpoint. Role is hard-coded to `'student'` when creating the session, so the `employer` and `admin` memory scopes are unreachable from this route.

**JWT verification does not verify the signature:**
- Risk: `NeonAuth.verifyToken` in `src/lib/auth/neon-auth.ts` fetches the JWKS and then discards it, decoding the payload with a hand-written `parseJWT` and checking only `exp`. The source comment says "use a proper JWT library like jose". Any forged token with a future `exp` would be accepted as valid.
- Files: `src/lib/auth/neon-auth.ts`.
- Current mitigation: None found, but the class is not called from the API route at HEAD, so exposure is limited to future use.
- Recommendations: **[SPLIT]** Do not port this module. It also opens its own `neon()` connection and Drizzle instance at import time using non-null-asserted env vars.

**Server secrets are wired into `next.config.js` `env`:**
- Risk: `next.config.js` has an `env` block that includes `OPENAI_API_KEY`, `MASTRA_API_KEY`, `BRIGHT_DATA_API_KEY`, `DATABASE_URL` and `NEON_AUTH_URL`. Next inlines `env` values into the bundle wherever referenced, including client code. Current server-only usage keeps this latent, but any client import of a module reading these vars would embed the value in shipped JS.
- Files: `next.config.js`.
- Recommendations: Remove the `env` block and read from `process.env` on the server only.

**Env file exposure surface:**
- Facts: `.gitignore` covers `.env*.local` and `.env.local`. `.env.local.example` is committed (not opened here). `render.yaml` marks secrets `sync: false` (dashboard-set) and uses `generateValue: true` for `NEXTAUTH_SECRET`. Variables named in `render.yaml`: `DATABASE_URL`, `DIRECT_URL`, `OPENAI_API_KEY`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `BRIGHT_DATA_API_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `MASTRA_SERVER_URL`. Only `.env.local` and `.env*.local` patterns are ignored, so a plain `.env` or `.env.production` would NOT be ignored.
- Recommendation: Before any split or archive, check that no `.env*` other than `.env.local.example` is tracked. At HEAD the tracked set is only `.env.local.example`. **[SPLIT]** Credentials that lived in this repo's `.env.local` must be rotated or moved to Infisical per the existing secrets policy. The values themselves were not inspected.

**Unused or mismatched auth and payment variables:**
- `render.yaml` names `NEXTAUTH_*` while code uses `NEON_AUTH_URL` and `NEON_AUTH_JWKS_URL`; Stripe, Resend and Bright Data are declared but no committed `src` code calls Stripe or Bright Data (the `src/db/schema/billing.ts` schema models billing). Resend and `@supabase/supabase-js` are installed but no `src` import was found in the grep of `process.env` usage. Supabase is unused by committed code.

**Committed local database artifacts:**
- Files: `data/mastra.db-wal` (about 94 KB) and `data/mastra.db-shm` (about 32 KB) are tracked even though the main `data/mastra.db` file is not in the tree.
- Impact: SQLite WAL and SHM files can contain fragments of conversation content (user chat text). They are binary, uninspectable here, and meaningless without the main DB file. Treat as potential personal-data leakage and exclude from any copy. **[SPLIT]**

## Performance Bottlenecks

**Per-request multi-query memory round trips over HTTP:**
- Problem: Each chat turn runs `getOrCreateSession`, `storeMessage` (x2), `getConversationHistory`, `getActiveContext` and optional `storeContext` through `neon-http` (one HTTP request per query, no transaction).
- Files: `src/app/api/chat/route.ts`, `src/lib/services/memory.service.ts`, `src/db/index.ts`.
- Cause: `drizzle-orm/neon-http` driver, sequential awaits.
- Improvement path: Batch or use a pooled driver if this is ever revived. Writes are not atomic, so a failure after the user message is stored leaves an orphan.

**Hand-rolled history window:**
- `route.ts` loads 5 messages and then keeps only the last 3 plus a one-line system summary. Context quality is low and is not token-aware.

## Fragile Areas

**Unpinned and mismatched dependency set:**
- Files: `package.json`, `package-lock.json`.
- Why fragile: `@mastra/core`, `@mastra/libsql`, `@mastra/memory` are `latest`. `ai` is `^5.0.116` while `@ai-sdk/openai` is `^0.0.39` (an old major paired with a new core) and `@assistant-ui/react-ai-sdk` is `^0.5.16`. `next` is `14.1.4` but `eslint-config-next` is `14.2.10`. `lucide-react` `^0.562.0`, `tailwind-merge` `^3.4.0` and `zustand` `^5.0.9` are recent majors. The lockfile (committed) is the only thing holding versions stable.
- Safe modification: Install only from the lockfile; any `npm update` can break Mastra APIs. Note the working tree has uncommitted changes to both manifests, so the committed lockfile may not match what actually runs locally.

**Large generated and monolithic files:**
- `src/db/migrations/meta/0000_snapshot.json` (~97 KB) and `src/db/migrations/0000_flippant_silvermane.sql` (~27 KB) are generated by drizzle-kit; only one migration exists, so schema changes made later via `db:push` may have no migration trail.
- Largest hand-written files: `src/components/assistant-ui/thread.tsx` (~12.7 KB), `src/components/chat/ChatInterface.tsx` (~10.4 KB), `src/lib/services/memory.service.ts` (~9.4 KB), `src/db/schema/hiring.ts` (~7.3 KB), `src/db/schema/billing.ts` (~7.1 KB).

**Duplicate chat UI paths:**
- `src/components/chat/ChatInterface.tsx`, `src/components/chat/CustomThread.tsx` and `src/components/assistant-ui/thread.tsx` all implement thread UI. The route emits a custom SSE shape (`text-delta`, `metadata`, `[DONE]`) rather than the AI SDK 5 data-stream protocol, so the client wiring is coupled to that bespoke format.

**Schema far larger than the running app:**
- `src/db/schema/` has 9 files (`hiring.ts`, `billing.ts`, `moderation.ts`, `conversations.ts`, `jobs.ts` and others) covering jobs, hiring, billing and moderation, while the only live route touches the conversation tables. **[SPLIT]** The schema is the likeliest place for data-shape coupling to the current repo and needs a table-by-table check, not a file copy.

## Scaling Limits

- Next.js `starter` Render plan, single web service; no queue, cache or worker. `maxDuration = 30` on the chat route. Mastra libsql file store (`./data/mastra.db`) is local disk and does not survive redeploy on Render's ephemeral filesystem unless `MASTRA_DATABASE_URL` points elsewhere.

## Dependencies at Risk

**`@mastra/*` at `latest`:** API churn risk; `src/lib/mastra/index.ts` and `config.ts` are written against whatever version was installed in Dec 2025.
**`@ai-sdk/openai ^0.0.39`:** pre-1.0 line, mismatched with `ai ^5`.
**`next 14.1.4`:** old patch release with known security advisories in the 14.x line; the project is private and unmaintained since 2025-12-21.
**`@supabase/supabase-js`, `resend`, `@lottiefiles/*` (two overlapping packages), `lottie-react`:** declared; usage by committed code is thin or absent.

## Missing Critical Features

- No authentication enforcement, no authorization, no rate limiting on `src/app/api/chat/route.ts`.
- No real job search, application tracking, employer flows (see TODO stubs).
- No payment or email code paths despite Stripe and Resend configuration.
- No CI configuration found in the committed tree (only `render.yaml` for deploy).

## Test Coverage Gaps

**Only one E2E spec, no unit or integration tests:**
- Files: `tests/e2e/chat-interface.spec.ts` (committed blob), `playwright.config.ts`. `package.json` has Playwright scripts only (`test`, `test:chrome`, `test:chromium`, `test:ui`, `test:debug`, `test:codegen`, `test:report`).
- What's not tested: memory service, agent routing, `neon-auth`, DB schema, API route error paths.
- Risk: The single spec exercises the chat UI. The working tree has uncommitted edits to it and to the route, so the committed spec and route may disagree with local behaviour. Priority: Low for a repo slated for split or archive, High if any module is ported.
- Report directories `playwright-report/` and `test-results*` were deliberately ignored.

## Open Decisions for Operator (ADQ)

1. **Memory store:** Mastra libsql vs Drizzle `chat_*` tables vs neither. Options: port the Drizzle schema, port Mastra memory only, or drop both.
2. **Auth lineage:** Neon Auth (legacy) vs the current repo's Clerk apps. The memory index says "Auth: two Clerk apps, not one"; legacy code is a different auth model, so no legacy auth module should be assumed reusable.
3. **Uncommitted working-tree changes** (4 files): whether they hold work worth preserving before the split cannot be assessed from the committed tree. Flag for the owner to review separately.
4. **`data/mastra.db-wal` and `-shm` in git:** whether history rewrite or just exclusion is appropriate for a split.

---

*Concerns audit: 2026-10-08*
