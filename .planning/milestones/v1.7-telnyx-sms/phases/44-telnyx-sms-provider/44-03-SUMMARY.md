---
phase: 44-telnyx-sms-provider
plan: 03
subsystem: sms
tags: [sms, inbound, refactor, characterization, mac-bridge, lakera, ackEarly, postgres, node-test]

# Dependency graph
requires:
  - phase: 44-telnyx-sms-provider
    provides: "44-01 Telnyx provider + shared helpers; 44-02 opt-out store + fail-closed guard (feat/v1.7-44-telnyx-sms HEAD 917ab1c)"
provides:
  - "apps/app/src/sms/inbound-handler.mjs: createInboundSmsHandler(deps) (provider-parameterised verify/parse/claim/legacy code/record/unknown reply/welcome/Lakera/workflow, ackEarly mode) + LEGACY_HARD_BLOCK_REPLY"
  - "server.mjs /webhooks/mac-bridge reduced to `await macBridgeInbound(req, res); return;` (ackEarly false)"
  - "Two real-server characterization suites for /webhooks/mac-bridge (DB-less on 3931, real Postgres on 3936)"
affects: [44-04 Telnyx route (reuses the handler with ackEarly true, ASCII hardBlockReply, isOptedOut-wired provider), 46 cutover, 47 mac-bridge deletion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Characterize first: spawn the real server against the UNCHANGED code, save the baseline, re-run the same file unchanged after the move, diff the ok-lines"
    - "Handler factory with every collaborator injected; one shared event log in tests to assert ordering"
    - "ackEarly: run(fn) awaits inline (late) or queues (early); respond() drains the queue after sendJson with per-step try/catch"

key-files:
  created:
    - apps/app/src/sms/inbound-handler.mjs
    - apps/app/src/sms/inbound-handler.test.mjs
    - apps/app/src/sms/mac-bridge-route.e2e.test.mjs
    - apps/app/src/sms/mac-bridge-route-pg.e2e.test.mjs
  modified:
    - apps/app/src/server.mjs
    - apps/app/package.json

key-decisions:
  - "The handler is a statement-for-statement port; only provider literals, the provider object, the hard-block text, the Lakera key read and the logger became parameters"
  - "With ackEarly the outbound unknown-reply messaging_events row is written after the ack, because it records the send result; every inbound DB write still happens before the ack"
  - "The pg characterization applies a migration subset (no pgvector locally or in CI) inside its own before() hook rather than via scripts/migrate.mjs"

patterns-established:
  - "Real-server e2e on a dedicated port with a CLEAN env (PATH only + named vars), polled /healthz like verify-app"

# Metrics
duration: 7min
completed: 2026-10-15
---

# Phase 44 Plan 03: Shared inbound SMS handler (mac-bridge unchanged) Summary

**I moved the 330-line `POST /webhooks/mac-bridge` route body into `src/sms/inbound-handler.mjs` as `createInboundSmsHandler`. It is parameterised by provider and has an `ackEarly` mode for Telnyx. The mac-bridge route is now a 2-line wrapper. Before the move, I pinned mac-bridge behaviour with two real-server characterization suites run against the unchanged server. I then re-ran both suites, unchanged, after the move. The before/after ok-line diffs are empty (5/5 DB-less, 4/4 real Postgres).**

## Performance

- **Duration:** about 7 min (2026-10-15T04:37:12Z to 04:43:44Z)
- **Tasks:** 2/2
- **Files:** 4 created, 2 modified
- **server.mjs:** 1902 lines down to 1595 (-307)

## Accomplishments

- The mac-bridge behaviour is identical to before. The same two e2e files were GREEN on the unchanged server (baseline commits `2266131` and `141233e`, made before any `server.mjs` change). Both were GREEN again on the refactored server, and the files did not change in between.
- The handler now owns the whole inbound flow. Each provider string is `providerName` or `${providerName}-pairing`, so with `"mac-bridge"` every value is byte-identical to before. A test with `providerName: "x"` proves the provider is really a parameter.
- Both Lakera blocks are now one internal `screenAndDispatch()`. The hard-block rule (`flagged === true || score >= 0.8`), the `safety_events` SQL and parameters, the log keys and the em-dash reply are all unchanged.
- `ackEarly: true` responds once verify, dedupe and the DB writes are done. After that it runs ensureLinkedIn, the screen and dispatch, the unknown-sender reply and the welcome send. If any of these throws after the ack, it is logged as `sms_post_ack_step_failed` and the remaining steps still run.
- The `/webhooks/photon` route is byte-identical. A hunk-range script exits 1 when a hunk lands inside it (negative control included).

## TDD Evidence (RED before GREEN)

All evidence is under `.planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/`.

### Task 1: regression net first

**Characterization baseline, DB-less** (`44-03-baseline-e2e-before.txt`, commit 2266131). This is a **GREEN baseline, not RED**: the run was against the unchanged server, and `git diff origin/main -- apps/app/src/server.mjs` was empty.
```
ok 1 - unsigned POST is 401 missing_signature
ok 2 - wrong signature (right length) is 401 invalid_signature
ok 3 - signed unknown-sender message is 200 unmatched_inbound
ok 4 - same providerEventId again is 200 duplicate
ok 5 - START code with no matching code (no DB) is 422 pairing_code_invalid
# tests 5  # pass 5  # fail 0
```

**Characterization baseline, real Postgres** (`44-03-baseline-pg-before.txt`, commit 141233e). This is also a GREEN baseline on the unchanged server, using local throwaway Postgres 16.15 on 127.0.0.1:54339 and schema `t44m_<hex>`.
```
ok 1 - valid START code binds the sender (pairing_started)
ok 2 - same code again from another event is pairing_expired code_already_claimed
ok 3 - expired code is pairing_expired code_expired and binds nothing
ok 4 - code for a student with another confirmed phone is pairing_rejected phone_already_bound
# tests 4  # pass 4  # fail 0  # skipped 0
```
Every characterization case was GREEN on the original code at the first run, so no test was changed to fit. The migrations applied are listed in `44-03-pg-migrations.txt`.

**Handler unit tests RED** (`44-03-red-handler.txt`, commit b2b39d6, run before `inbound-handler.mjs` existed):
```
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../apps/app/src/sms/inbound-handler.mjs' imported from .../inbound-handler.test.mjs
not ok 1 - src/sms/inbound-handler.test.mjs
# tests 1  # pass 0  # fail 1
```

### Task 2: implementation and extraction

**Handler GREEN** (`44-03-green-handler.txt`, commit 30e4ffa):
```
mac-bridge profile: 14 tests + 'Lakera parity' sub-describe 10 tests   ackEarly: 7 tests
# tests 31  # suites 3  # pass 31  # fail 0
```

**Characterization after the extraction**, with the files unchanged (`44-03-baseline-e2e-after.txt`, `44-03-baseline-pg-after.txt`, `44-03-characterization-diff.txt`):
```
DB-less e2e:  # pass 5 # fail 0     ok-line diff vs before: (empty)
real-PG e2e:  # pass 4 # fail 0 # skipped 0   ok-line diff vs before (incl. indented subtests): (empty)
git diff --stat 141233e 30e4ffa -- <both e2e files>: (no output, unchanged)
```
The plan's `grep -E "^(ok|not ok)"` only catches top-level TAP lines, and the pg file's cases are indented subtests. For the pg file I diffed with `^\s*(ok|not ok)` instead, which compares all 5 lines and is stricter.

**Negative controls** (`44-03-negctl.txt`; each mutation was in the working tree only and was restored byte-identically before the commit)

| # | Mutation | Result |
|---|----------|--------|
| NC1 | hard-block branch removed (`if (isHardBlock)` -> `if (false)`) | 6 handler tests fail (all 4 hard-block cases, the reply-failure log, and the 'x' test's block log). The workflow runs on a hard block (25/6) |
| NC2 | ackEarly reverted to always-await (`run = async (fn) => fn()`) | 5 ackEarly tests fail. The response is recorded last (26/5) |
| NC3 | `provider: providerName` hard-coded to `"mac-bridge"` (5 sites) | the "providerName 'x'" test fails (30/1) |
| NC4 | route wired to the wrong provider (`provider: spectrumProvider`) | DB-less e2e 0/5. The signed cases return 401 (`webhook_secret_missing`) |
| NC5 | same wrong wiring, real-PG e2e | 0/4 |
| NC6 | handler wired with `providerName: "spectrum"` | real-PG e2e 0/4, with every failure on `actual: 'spectrum'  expected: 'mac-bridge'` in the messaging_events / inbound_messages provider assertions |

**Smoke build:** `npm run build --workspace apps/app` exited 0 (`44-03-verify-app.txt`: "internjobs-app: waitlist smoke checks passed").

**Hunk-range check** (`44-03-hunks.txt`; the script is `44-03-hunk-check.mjs`)
```
photon route (origin/main): lines 660-823
hunk old 9,0   -> insert after 9         (import)              outside
hunk old 66,0  -> insert after 66        (macBridgeInbound)    outside
hunk old 832,4 -> lines 832-835          (mac-bridge comment)  outside
hunk old 837,332 -> lines 837-1168       (mac-bridge body)     outside
PASS, exit 0
negative control (comment appended inside photon route): hunk 661,1 INSIDE -> FAIL, exit 1
photon route old 660-823 vs new 682-845: IDENTICAL
```
`grep -n macBridgeProvider apps/app/src/server.mjs` now finds only its creation (`:66`), the `provider:` dependency (`:73`) and a comment.

**Registration check** (`:(glob)` form per the Amendment; `44-03-registration-check.txt`)
```
registered: src/config.test.mjs src/sms/inbound-handler.test.mjs src/sms/mac-bridge-route-pg.e2e.test.mjs src/sms/mac-bridge-route.e2e.test.mjs src/sms/mac-bridge.test.mjs src/sms/opt-out-store.test.mjs src/sms/shared.test.mjs src/sms/telnyx-optout.test.mjs src/sms/telnyx.test.mjs
exit 0
negative control: drop mac-bridge-route-pg.e2e.test.mjs -> NOT REGISTERED, exit 1
negative control: drop inbound-handler.test.mjs         -> NOT REGISTERED, exit 1
```

**Sanity** (`44-03-final-verify.txt`, 3 files per command): config, shared and mac-bridge passed 30/30. Telnyx, telnyx-optout and opt-out-store (no DB) passed 29/29. The pg e2e without `TEST_DATABASE_URL` reports `# SKIP` (it does not fail).

**Throwaway Postgres:** I created it by initdb in the session scratchpad, ran it TCP-only on 54339, then stopped it (`pg_ctl stop`) and deleted its data directory and log after the last run. No shared, staging or production database was touched.

## Task Commits

All on `feat/v1.7-44-telnyx-sms` in `/Users/rajren/internjobs-cms-wt-44`:

1. **Task 1: regression net**
   - `2266131` test(44-03): characterization e2e for /webhooks/mac-bridge (baseline)
   - `141233e` test(44-03): characterization of the mac-bridge pairing path on real Postgres (baseline)
   - `b2b39d6` test(44-03): failing tests for shared inbound handler
2. **Task 2: extraction**
   - `30e4ffa` refactor(44-03): extract shared inbound sms handler; mac-bridge route is a thin wrapper

## Files Created/Modified

- `apps/app/src/sms/inbound-handler.mjs`: `createInboundSmsHandler`, `LEGACY_HARD_BLOCK_REPLY`
- `apps/app/src/sms/inbound-handler.test.mjs`: 31 unit tests ('mac-bridge profile', 'Lakera parity', 'ackEarly')
- `apps/app/src/sms/mac-bridge-route.e2e.test.mjs`: real server, no DB, port 3931
- `apps/app/src/sms/mac-bridge-route-pg.e2e.test.mjs`: real server plus real Postgres, port 3936, gated on `TEST_DATABASE_URL`
- `apps/app/src/server.mjs`: an import, the `macBridgeInbound` construction, and the route body replaced by the wrapper (the header comment is trimmed to the wiring facts)
- `apps/app/package.json`: the test script gains the three new files

## Decisions Made

- I kept the port faithful rather than tidy. Logs still go through `console.log` / `console.error` (injected as `log`), every log key and message string is unchanged, and errors propagate exactly as before when `ackEarly` is false. For example, a welcome send that throws still reaches the server's outer 500 catch, and a screen that throws still logs `write_inbound_message_failed`.
- In ackEarly mode the unknown-sender outbound `messaging_events` row (`<id>:unknown-reply`) is written after the ack, inside the deferred reply step, because its `deliveryStatus` is the send result. Every inbound write (`pairing_*` events, the audit row, `inbound_messages`, and the store's dedupe in `recordInboundMessage` / `confirmPairingCode`) happens before the ack. A test ("DB writes are never deferred") pins this.
- The handler throws at construction if `providerName`, `provider` or `hardBlockReply` is missing. This is new behaviour, but it only affects wiring, so a mis-wired Telnyx route in 44-04 fails at boot rather than at the first message.

## Observed behaviour vs the plan's derivation

- Every response body the plan derived matched the unchanged server: `{"ok":true,"duplicate":false,"eventType":"unmatched_inbound"}`, `{"ok":true,"duplicate":true}`, and 422 `{"ok":false,"duplicate":false,"error":"pairing_code_invalid"}`. On the pg path, `pairing_started` / `pairing_expired` / `pairing_rejected` match too, and `code_already_claimed` maps to `pairing_expired`.
- A wrong signature must have the **right length** (64 hex characters) to get `invalid_signature`. A shorter one returns `bad_signature_length`. The e2e uses a 64-zero signature.
- **Finding (pre-existing, unchanged, recorded for ops):** when `LAKERA_GUARD_API_KEY` is unset, `screenMessage` returns `action: "passed_lakera_unavailable"`. That is `!== "passed"`, so the route logs `lakera_screen` and writes a `safety_events` row (action `passed_lakera_unavailable`) for **every** screened message. The pg e2e pins this as existing behaviour. In production the key is set, so a clean pass writes nothing. I did not change it, because changing it would alter behaviour. If it matters, it belongs in 44-04 or later as an explicit decision.
- Without a DB, a START code with no match falls through to `store.confirmPairingCode` (422) because `store.pool` is undefined. This matches the plan.

## Deviations from Plan

None that change scope. Every committed code file is in `files_modified`, and `git diff --cached --name-only` matched each commit.

- **pg migrations:** I applied them in the test's own `before()` (real files: 0001 0002 0003 0003b 0008 0009 0015 0016), not with `scripts/migrate.mjs`. That script runs every file and fails at 0004 (`create extension vector`), and neither the local Homebrew cluster nor the CI `postgres:16` image has pgvector. The plan allowed this case. The details are in `44-03-pg-migrations.txt`.
- **Side effect of the pg e2e:** when the spawned server has a `DATABASE_URL`, `initMastra` creates a `mastra` schema in the target database. This is harmless in the throwaway cluster (now deleted) and in the ephemeral CI service, but it is noted here because CI will run this file with `TEST_DATABASE_URL`.
- **Ok-line diff for the pg file** used `^\s*(ok|not ok)`, as explained above. This is stricter than the plan's grep.
- **Hunk-range script:** it is a standalone Node script, kept as evidence (`44-03-hunk-check.mjs`), not a repo file, because it is not in `files_modified`.
- **Commit trailers** use `Co-Authored-By: Claude Opus 5.5`, matching the session attribution and the earlier 44-0x commits, not the plan's `Sonnet 5.5` text.

## Rulings

None. No plan conflicts came up.

## Issues Encountered

- None blocking. As in 44-02, Postgres used `/opt/homebrew/opt/postgresql@16/bin`, TCP-only, because the scratchpad path is too long for a Unix socket.

## User Setup Required

None. There were no secrets, no Telnyx calls, no deploys, no pushes and no merges (D10).

## Next Phase Readiness

- 44-04 can build the Telnyx route as `createInboundSmsHandler({ providerName: "telnyx", provider: telnyxProvider, ackEarly: true, hardBlockReply: <ASCII variant>, ... })`. The Telnyx provider must be built with `isOptedOut: (p) => store.optOuts.isOptedOut(p)` (44-02). This carry-forward was addressed to 44-03, but 44-03 builds no Telnyx provider, so it moves to 44-04.
- 44-04 still owns early dedupe for Telnyx, and the STOP/START/HELP handling before the unknown-sender reply. The handler has no keyword hook yet. 44-04 should add one (a pre-confirmation step) without changing the mac-bridge profile, and re-run both characterization files.
- The `passed_lakera_unavailable` → `safety_events` row behaviour (see above) is a candidate decision for Phase 46 ops, not a 44-03 change.
