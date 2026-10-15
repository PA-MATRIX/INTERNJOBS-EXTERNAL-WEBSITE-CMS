---
phase: 44-telnyx-sms-provider
plan: 04
subsystem: sms
tags: [sms, telnyx, webhook, ed25519, opt-out, dedupe, healthz, e2e, postgres, node-test, D34]

# Dependency graph
requires:
  - phase: 44-telnyx-sms-provider
    provides: "44-01 Telnyx provider + shared helpers; 44-02 opt-out store + fail-closed guard; 44-03 createInboundSmsHandler + ackEarly (feat/v1.7-44-telnyx-sms HEAD 30e4ffa)"
provides:
  - "inbound-handler.mjs Telnyx-mode options: acceptEventTypes, earlyDedupe, keywordHandling (STOP/START/HELP), suppressShortCodeReplies; SMS_HARD_BLOCK_REPLY (ASCII)"
  - "store.hasMessagingEvent(provider, id) on MemoryStore and PostgresStore"
  - "src/sms/registry.mjs: createSmsProviders (Telnyx wired to store.optOuts.isOptedOut), isTelnyxRouteEnabled (D34), buildTelnyxInboundOptions"
  - "POST /webhooks/telnyx/sms gated on TELNYX_WEBHOOK_PUBLIC_KEY (401 public_key_missing otherwise); /healthz configured.telnyx, configured.telnyxWebhookKey, smsProvider"
  - "Real-server e2e (4 servers + local Telnyx stub) incl. a fresh-database store-failure case"
affects: [44-05 chain test (uses buildTelnyxInboundOptions), 45 10DLC/HELP text, 46 cutover + signed canary, 47 mac-bridge deletion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single option builder shared by server wiring and tests (buildTelnyxInboundOptions)"
    - "Store-failure e2e on a brand-new DATABASE (create in before, drop with (force) in after), with an absence probe read after boot"
    - "Sabotage controls run against the real-server e2e, each reverted from a byte backup and the file compared afterwards"

key-files:
  created:
    - apps/app/src/sms/registry.mjs
    - apps/app/src/sms/registry.test.mjs
    - apps/app/src/sms/telnyx-route.e2e.test.mjs
    - apps/app/src/sms/inbound-handler-telnyx.test.mjs
  modified:
    - apps/app/src/sms/inbound-handler.mjs
    - apps/app/src/store.mjs
    - apps/app/src/store.test.mjs
    - apps/app/src/server.mjs
    - apps/app/package.json

key-decisions:
  - "D34: the Telnyx route is gated on TELNYX_WEBHOOK_PUBLIC_KEY, not SMS_PROVIDER; replies to Telnyx-route messages go through the Telnyx provider"
  - "Amendment 2 (orchestrator ruling, option a): Server D uses a reachable throwaway Postgres (TEST_DATABASE_URL) in a fresh database lacking messaging_events/sms_opt_outs; skipped when TEST_DATABASE_URL is unset; no production code change"
  - "Store failures on the Telnyx route are not caught in the route: they reach the server's outer catch (500), so Telnyx retries"

patterns-established:
  - "Fresh-DATABASE (not schema) isolation for e2e cases that need a table to be absent"

# Metrics
duration: about 22 min of execution across two executors (Task 1 + checkpoint, then Task 2)
completed: 2026-10-15
---

# Phase 44 Plan 04: Telnyx route, keyword hook, registry and healthz Summary

**`POST /webhooks/telnyx/sms` now exists on the shared inbound handler. It checks the Ed25519 signature, filters to `message.received`, drops retries by event id before any side effect, handles STOP/START/HELP before the agent, never replies to short codes, acks before Lakera and the agent, and replies through the Telnyx API from the configured number. It is gated on `TELNYX_WEBHOOK_PUBLIC_KEY` (D34), not on `SMS_PROVIDER`. A real-server e2e proves all of this against 4 spawned servers and a local Telnyx stub (6/6). This includes the case where a store failure returns 5xx, run on a fresh Postgres database. Six sabotage controls each turn the e2e red. The mac-bridge characterization suites match the 44-03 baseline (ok-line diffs empty).**

## Performance

- **Duration:** Task 1 2026-10-15T04:43Z to 04:50Z (first executor). Then the checkpoint. Task 2 04:52Z to 04:59Z (this executor).
- **Tasks:** 2/2
- **Files:** 4 created, 5 modified (code worktree)
- **server.mjs:** 1595 lines at the end of 44-03, 1639 now. Task 2 diff from 14f0976: 5 files, +558/-5, of which 459 lines are the two test files.

## Accomplishments

- **Task 1 (handler options + `hasMessagingEvent`).** The handler takes 4 new options, all defaulting to the mac-bridge behaviour: an event-type filter, early dedupe, keyword handling and short-code silence. It also exports the ASCII `SMS_HARD_BLOCK_REPLY`. STOP/START write the opt-out state BEFORE the `messaging_events` row. If `recordOptOut` fails, no dedupe row is left behind and the error propagates, so Telnyx's retry can redo it. HELP replies after the ack.
- **Task 2 (registry, route, healthz).** `createSmsProviders` builds spectrum, mac-bridge and telnyx. It passes `store.optOuts.isOptedOut` to Telnyx, or `undefined` when the store has none, so 44-02's `telnyx_opt_out_guard_required` fires. `server.mjs` now takes its providers from the registry. The Telnyx route sits directly after the mac-bridge route. `/healthz` reports booleans and the provider name only. The e2e asserts that the key is not echoed.
- The mac-bridge route, the photon route and the mac-bridge handler profile are unchanged. Both characterization files are GREEN and identical to the 44-03 baseline.

## TDD Evidence (RED before GREEN)

All evidence is in `.planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/`.

### Task 1

| Step | File | Result |
|------|------|--------|
| RED | `44-04-red-store.txt` | 4 tests, 0 pass, 4 fail (`hasMessagingEvent` missing) |
| RED | `44-04-red-handler.txt` | file fails to load: `does not provide an export named 'SMS_HARD_BLOCK_REPLY'` |
| commit | `32d1aa5` | tests only |
| GREEN | `44-04-green-store.txt` | 4/4 |
| GREEN | `44-04-green-handler.txt` | 22/22 |
| regression | `44-04-task1-regression-handler.txt` (inbound-handler.test, 31/31), `44-04-task1-regression-macbridge-e2e.txt` (5/5) | GREEN |
| characterization | `44-04-characterization-{e2e,pg}.txt` 5/5, 4/4; `44-04-characterization-diff.txt` | both diffs empty |
| negative controls | `44-04-negctl-task1.txt` | A (em-dash reused): 2 fail. B (keyword branch disabled): 13 fail. C (`hasMessagingEvent` always false): 4 fail |
| commit | `14f0976` | implementation |

### Task 2

| Step | File | Result |
|------|------|--------|
| RED (first capture, superseded) | `44-04-red-e2e-pre-amendment2.txt` | 6 cancelled: Server D (unreachable DB) never became healthy. This led to the checkpoint. |
| RED | `44-04-red-registry.txt` | `ERR_MODULE_NOT_FOUND .../src/sms/registry.mjs` (0 pass, 1 fail) |
| RED (re-captured after Amendment 2) | `44-04-red-e2e.txt` | 6 tests, 0 pass, 6 fail. Every case got `404` (route absent), including Server D's `STOP got 404`. Server D booted on the fresh DB, and the absence precondition passed. |
| commit | `b022044` | tests only |
| GREEN | `44-04-green-registry.txt` | 5/5 |
| GREEN | `44-04-green-e2e.txt` | 6/6 (TEST_DATABASE_URL set) |
| GREEN, no DB | `44-04-green-e2e-nodb.txt` | 5 pass, 1 skipped (`# SKIP TEST_DATABASE_URL unset`), 0 fail |
| GREEN after sabotage | `44-04-green-e2e-after-sabotage.txt` | 6/6 |
| commit | `efe4729` | implementation |

### Sabotage controls (e2e, each reverted, never committed)

| Control | File | Failing case(s) |
|---------|------|-----------------|
| a: handler skips `provider.verifyWebhook` | `44-04-sabotage-a.txt` | signature (expected 401, got 200), D34 gate (forged on B: 401 expected, got 200) |
| b: `hasMessagingEvent` returns false (both stores) | `44-04-sabotage-b.txt` | retry: the HELP retry answered `help_request` instead of `{ok:true,duplicate:true}` |
| c: keyword branch removed | `44-04-sabotage-c.txt` | retry (HELP), STOP/START round trip (`opt_out` expected, `unmatched_inbound` got), short-code/delivery (an extra outbound) |
| d (Amendment 2): create `messaging_events` (0001) + `sms_opt_outs` (0016) in the fresh DB after the absence probe | `44-04-sabotage-d-tables.txt` | store-failure case: `STOP got 200`. The log line shows both tables were present. This proves the missing tables are what produce the 5xx. |
| e: gate depends on `SMS_PROVIDER` again | `44-04-sabotage-e-gate.txt` | D34 gate (server B) |
| f: route catches the store error and answers 200 | `44-04-sabotage-f-catch.txt` | store-failure case: `STOP got 200` |

Note on b: the plain-message retry still came back `duplicate: true` with b in place, because store-level dedupe (`recordInboundMessage`) also catches it. A HELP retry has no store-level dedupe behind it, so it is the case that proves early dedupe. The test comments say so.

### Characterization (Task 2, files unchanged since 44-03)

- `44-04-task2-characterization-e2e.txt`: mac-bridge-route.e2e 5/5.
- `44-04-task2-characterization-pg.txt`: mac-bridge-route-pg.e2e 4/4.
- `44-04-task2-characterization-diff.txt`: ok-line diffs against `44-03-baseline-e2e-after.txt` and `44-03-baseline-pg-after.txt` are both **empty**.

### Other verification

- `44-04-verify-app.txt`: `npm run build --workspace apps/app`, which runs `verify-app.mjs`, exits 0.
- `44-04-hunks.txt`: the 44-03 hunk-range script against origin/main 951e103 reports PASS (no hunk inside the photon route). Task 2's own hunks against b022044 are pure insertions, apart from the provider-construction swap.
- `44-04-registration-check.txt`: with the `:(glob)` pathspec, all 13 branch-added test files are registered (exit 0). Dropping telnyx-route.e2e or registry.test from the script exits 1. Restored.
- `44-04-final-verify.txt`, each file run alone on committed HEAD efe4729: store 4/4, inbound-handler 31/31, inbound-handler-telnyx 22/22, registry 5/5, mac-bridge-route.e2e 5/5, telnyx-route.e2e 6/6, mac-bridge-route-pg.e2e 4/4. No listener on 3931-3937 afterwards.
- `grep -n "webhooks/telnyx/sms" apps/app/src/server.mjs`: exactly one route (line 900), behind `isTelnyxRouteEnabled`.

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | `32d1aa5` | test(44-04): failing tests for Telnyx-mode handler and hasMessagingEvent |
| 1 GREEN | `14f0976` | feat(44-04): Telnyx-mode options on the shared inbound handler |
| 2 RED | `b022044` | test(44-04): failing tests for sms registry and the Telnyx route (e2e) |
| 2 GREEN | `efe4729` | feat(44-04): Telnyx inbound route, registry and healthz readiness keys |

These are on `feat/v1.7-44-telnyx-sms` in `/Users/rajren/internjobs-cms-wt-44`. They are not pushed. The docs commits are on `docs/v1.7-telnyx-sms`: `2ebf00f` (Task 1 evidence + checkpoint), `5c87ef9` (Amendment 2), and this summary.

## Files Created/Modified

- `apps/app/src/sms/registry.mjs` (new): provider registry, D34 gate helper, Telnyx option builder.
- `apps/app/src/sms/registry.test.mjs` (new): 5 tests.
- `apps/app/src/sms/telnyx-route.e2e.test.mjs` (new): 6 tests across servers A/B/C/D and the stub.
- `apps/app/src/sms/inbound-handler-telnyx.test.mjs` (new, Task 1): 22 tests.
- `apps/app/src/sms/inbound-handler.mjs`: Telnyx-mode options, `SMS_HARD_BLOCK_REPLY`.
- `apps/app/src/store.mjs` / `store.test.mjs`: `hasMessagingEvent` on both stores.
- `apps/app/src/server.mjs`: registry-built providers, `telnyxInbound`, route, healthz keys.
- `apps/app/package.json`: 4 test files appended to `test`.

## Rule dispositions (from the plan; greps re-run on efe4729)

| Rule | Sites | Disposition |
|------|-------|-------------|
| Dedupe key `(provider, provider_event_id)` | `store.confirmPairingCode`, `store.recordInboundMessage`, `store.writeMessagingEvent`, `store.writeInboundMessage`, MemoryStore equivalents | UNCHANGED for photon/mac-bridge. Telnyx supplies `metadata.provider="telnyx"` and `provider: "telnyx"` to `confirmPairingCode`. ADDED `store.hasMessagingEvent`, used only by the Telnyx early dedupe. **Known trade-off:** a crash between the `messaging_events` write and the `inbound_messages` write turns the retry into a no-op. We prefer no double agent run to no lost run. |
| Provider selection / route gate | `config.smsProviderName` (validation, healthz); `server.mjs` route | D34: gated on `config.telnyx.publicKey` via `isTelnyxRouteEnabled`, not on `smsProviderName`. Without the key the route returns 401 `public_key_missing` and does not read the body. mac-bridge and photon routes are not gated (unchanged). |
| Pairing claim path | `onboarding/pairing.mjs claimPairingCode`; `store.confirmPairingCode` | The handler passes `channelType: "sms"` for Telnyx. Claim logic is unchanged. Its default channel type changes in 44-05. |
| Unknown-sender stop branch | `server.mjs createUnknownSenderText` regex | Unchanged for mac-bridge. For Telnyx, exact STOP-set keywords are consumed first. Phrases such as "please stop texting me" still reach the reply. Phase 46 UAT needs one phrase test. |
| Outbound opt-out guard | Telnyx `sendSms` (44-02) | The registry wires `store.optOuts.isOptedOut`. The e2e STOP-guard-START case proves the unknown-sender reply path is guarded. |
| `/healthz` `configured.*` | `server.mjs` healthz | ADDED `telnyx`, `telnyxWebhookKey` and top-level `smsProvider`. Existing keys are unchanged. `verify-app.mjs` is unaffected (exit 0). |

Re-running the plan's three enforcement-site greps found no new sites. The only new `/webhooks/` match is the Telnyx route itself.

## D34 guidance (for Phase 46)

- The route is gated on `TELNYX_WEBHOOK_PUBLIC_KEY`. Production has no key today, so the route answers 401 to everything there.
- Outbound for the mac-bridge and spectrum routes still goes through their own providers. Replies to messages that arrive on the Telnyx route go through the Telnyx provider, whatever `SMS_PROVIDER` says. The e2e proves this: server B (`SMS_PROVIDER=mac-bridge`) sends its reply to the Telnyx stub.
- **A signed canary is possible before the Phase 46 flip.** Set the public key plus the Telnyx send secrets (`TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`), then send a signed or real message. Inbound needs no `SMS_PROVIDER` change.

## Decisions Made

- Server D isolation uses a **fresh DATABASE**, not a schema. `create database t44d_<hex>` runs on `TEST_DATABASE_URL` and `drop database ... with (force)` runs in `after()` once Server D has exited. That way, tables other test files leave in the default `postgres` database (CI) cannot leak in through `search_path`. The Mastra schema that `initMastra` creates at boot also lands inside the fresh DB and is dropped with it.
- The absence check (`to_regclass('messaging_events')`, `to_regclass('sms_opt_outs')` both null) is read AFTER Server D's boot and asserted inside the test. A boot-time DDL path that created those tables would fail the test, not pass silently. None exists: `grep -i "create table|create schema|create extension"` over non-test `src` returns nothing, and the probe confirmed it.
- Store errors on the Telnyx route are left to the existing outer `catch` (500). The plan said to fix this only inside the Telnyx branch if the outer handler did not answer 5xx. It does, so the route has no try/catch. Sabotage f proves that catching the error would be caught by the test.

## Checkpoint and ruling

- **Checkpoint (first executor, Task 2):** Server D with `DATABASE_URL=postgres://u:p@127.0.0.1:1/x?sslmode=disable` crashed about 2 s after boot. The cause was an uncaught `MASTRA_STORAGE_PG_CREATE_TABLE_FAILED: ECONNREFUSED` in `initMastra` (`evidence/44-04-serverD-boot-crash.txt`). This is pre-existing behaviour on unmodified HEAD 14f0976. The first RED capture had all 6 cases cancelled by the `before` hook (`44-04-red-e2e-pre-amendment2.txt`).
- **Ruling (orchestrator, option a, recorded as Amendment 2 in the plan, checker-passed, docs commit 5c87ef9):** Server D uses a reachable throwaway Postgres from `TEST_DATABASE_URL`, in a fresh database or schema without `messaging_events`/`sms_opt_outs`. It is skipped when the variable is unset. No production code change. Sabotage d (create the tables) is required. Re-capture RED.
- **Checker notes honoured:** fresh database named in the test and dropped afterwards (verified: no `t44d_%` database left after each run); no boot-time creation of those tables; `initMastra` needed no missing extension (Server D booted and passed `/healthz` on a cluster without pgvector); sabotage d run and recorded.

## Deviations from Plan

- **[Amendment 2]** The Server D setup differs from the original Task 2 text (unreachable URL). It now follows the ruling above. This is not an executor deviation.
- **Extra sabotage controls e and f** were added beyond the plan's a/b/c. They cover the D34 gate and the 5xx truths' own negative controls. d is the Amendment 2 control.
- **Extra evidence files:** `44-04-red-e2e-pre-amendment2.txt` (the original RED, renamed so the re-capture could take the plan's name), `44-04-green-e2e-nodb.txt`, `44-04-green-e2e-after-sabotage.txt`, `44-04-task2-characterization-*.txt`, `44-04-hunks.txt`, `44-04-final-verify.txt`.
- **Commit trailers** use `Co-Authored-By: Claude Opus 5.5` (session attribution, matching Task 1), not the plan's `Sonnet 5.5`.
- Every committed code file is in `files_modified`. `git diff --cached --name-only` matched each commit.

## Rulings

None. No in-run plan conflicts came up in Task 2. The Server D question was settled by the orchestrator through the checkpoint (Amendment 2) and was not ruled in-run.

## Findings logged (out of scope)

- **APP-BOOT-DB** (CARRYOVER.md, 5c87ef9): with a `DATABASE_URL` that is unreachable at boot, the app process crashes about 2 s after it starts listening, because the `initMastra` PG init is unhandled. Making boot resilient changes production startup and needs its own plan (Amendment 2).
- **HELP-AFTER-STOP:** the outbound opt-out guard also blocks our HELP reply to an opted-out number. The orchestrator logged this in CARRYOVER.md (5c87ef9), and it is to be checked against the 10DLC/CTIA HELP rules in Phase 45/46. It is not changed here.

## Issues Encountered

- As in 44-02/44-03, the throwaway Postgres 16 ran TCP-only (`-k ''`), because the scratchpad path exceeds the Unix-socket length limit. The cluster on 127.0.0.1:54344 was stopped and its data directory deleted after the final run.

## User Setup Required

None. There were no secrets, no Telnyx calls (the local stub on 127.0.0.1:3933), no deploys, no pushes and no merges (D10).

## Next Phase Readiness

- 44-05 can import `buildTelnyxInboundOptions` from `src/sms/registry.mjs` for the chain test.
- Phase 45/46: the HELP reply wording (`buildHelpReply`) must match the 10DLC campaign's HELP text. HELP is a reserved keyword, so Telnyx may send its own auto-response. Confirm at cutover that the student does not get two replies.
- Phase 46: one UAT case for a phrase opt-out ("please stop texting me"), which is not consumed as a keyword. Signed canary path as above. Carry-forwards from 5c87ef9 still apply (0016 before the flip, D34 canary, D10 exception).
- CI runs the Server D case only because `ci.yml` sets `TEST_DATABASE_URL` (postgres:16 service, superuser, so `create database` is permitted).
