---
phase: 44-telnyx-sms-provider
plan: 04
verified: 2026-10-15T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Plan 44-04 Verification Report

**Goal:** Telnyx inbound end to end on the shared handler (SMS-01, SMS-03, SMS-04, OPT-01 inbound, PAIR-01 route part), D34 gate.
**Code:** /Users/rajren/internjobs-cms-wt-44, feat/v1.7-44-telnyx-sms, HEAD efe4729 (clean before and after).
**Status:** passed

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` in this repo.
- Locked source: 44-CONTEXT.md D34 (route gated on TELNYX_WEBHOOK_PUBLIC_KEY, fail closed; Telnyx-route replies via Telnyx) and Amendment 2 (Server D on a reachable fresh DB, no production change). Both are implemented as written; APP-BOOT-DB and HELP-AFTER-STOP are intentional carry-overs, not gaps.

## Tests re-run literally (not from SUMMARY)

| File | Result |
|------|--------|
| src/store.test.mjs | 4/4 |
| src/sms/inbound-handler.test.mjs | 31/31 |
| src/sms/inbound-handler-telnyx.test.mjs | 22/22 |
| src/sms/registry.test.mjs | 5/5 |
| src/sms/telnyx-route.e2e.test.mjs (throwaway PG16 via TEST_DATABASE_URL, Server D ran, 0 skipped) | 6/6 |
| src/sms/mac-bridge-route.e2e.test.mjs | 5/5; ok-lines identical to 44-03-baseline-e2e-after.txt |
| src/sms/mac-bridge-route-pg.e2e.test.mjs | 4/4; ok-lines identical to 44-03-baseline-pg-after.txt |

Cleanup: Postgres stopped, data dir deleted, no `t44d_%` database existed after the run, nothing listening on 3931-3937 or the PG port.

## RED before GREEN

Commit order: 32d1aa5 (tests) < 14f0976 (impl); b022044 (tests) < efe4729 (impl). RED evidence present: red-store 0/4, red-registry 0/1 (module missing), red-handler (export missing), red-e2e re-captured after Amendment 2 (0 pass, 6 fail, route 404, Server D booted on fresh DB) with the pre-amendment capture kept separately.

## Sabotage controls re-applied by the verifier (each reverted, tree clean)

| Control | Result |
|---------|--------|
| isTelnyxRouteEnabled also requires SMS_PROVIDER=telnyx (D34 gate) | e2e "D34 gate" fails |
| handler skips provider.verifyWebhook | e2e "signature" and "D34 gate" fail |
| earlyDedupe disabled | e2e "retry of the same event id is a no-op" fails |

## Specific checks

| Check | Verdict | Evidence |
|-------|---------|----------|
| D34 gate | VERIFIED | server.mjs:900 route; `!isTelnyxRouteEnabled(config)` returns 401 public_key_missing before `telnyxInbound` (body never read); key = `Boolean(config.telnyx.publicKey)`; e2e server B (mac-bridge + key) processes signed request, server C (telnyx, no key) 401 |
| Ack timing | VERIFIED | `ackEarly:true`; `run()` queues sendSms/Lakera/dispatch/welcome until after `respond`; verify, dedupe and DB writes precede respond; handler test asserts order log |
| Early dedupe on Telnyx id | VERIFIED | `store.hasMessagingEvent("telnyx", providerEventId)` right after event filter, before keywords and claim; both stores implemented; sabotage proves it |
| STOP/START/HELP exact keywords | VERIFIED | `classifyKeyword` (exact), opt-out state written before messaging_events row, failure propagates (5xx); "stop texting me" and START-AB12CD not keywords (tests) |
| Short codes get no reply | VERIFIED | `suppressShortCodeReplies` and `!toE164`, logs `unmatched_inbound_no_reply` with last4 and length only; e2e case |
| ASCII hard-block reply | VERIFIED | `SMS_HARD_BLOCK_REPLY` ASCII from buildTelnyxInboundOptions; mac-bridge profile still uses `LEGACY_HARD_BLOCK_REPLY` (em dash) in server.mjs |
| buildTelnyxInboundOptions single source | VERIFIED | server.mjs spreads `...buildTelnyxInboundOptions()`; no inline duplicate option set |
| /healthz keys | VERIFIED | configured.telnyx, configured.telnyxWebhookKey, top-level smsProvider; booleans and name only; e2e asserts |
| Photon route untouched | VERIFIED | photon route at 709, diff hunks at 8, 65, 92, 194, 198, 892; none inside 709-886 |
| Registration check (`:(glob)`) | VERIFIED | every branch-added test file in package.json test script |
| Secrets | VERIFIED | none in diff; e2e keys generated in-test |
| Scope | VERIFIED | 9 files changed since 30e4ffa, all in files_modified |
| Failing store -> 5xx | VERIFIED | e2e Server D on fresh DB (tables absent); route has no try/catch, outer catch gives 500 |

## Anti-patterns / Security pass

No TODO/stub patterns in phase files. Pass 1: no SQL interpolation (hasMessagingEvent parameterised), no shell or eval, no LLM-output-to-DB path added. No findings.

## Informational notes (not gaps)

- Early dedupe trade-off (crash between messaging_events and inbound_messages writes makes the retry a no-op) is recorded in SUMMARY and accepted by the plan.
- `confirmation.error` still answers 422 on the Telnyx route, so Telnyx would retry; pre-existing handler semantics, worth a look in 44-05/46.
- HELP-AFTER-STOP (guard blocks HELP reply to opted-out number) and APP-BOOT-DB are logged in CARRYOVER.md for Phase 45/46 and a separate plan.
- SUMMARY says commit trailers used Opus 5.5 rather than Sonnet 5.5; cosmetic.

## Gaps

None. Safe to stack 44-05 on efe4729.

_Verifier: Claude (rrr-verifier)_
