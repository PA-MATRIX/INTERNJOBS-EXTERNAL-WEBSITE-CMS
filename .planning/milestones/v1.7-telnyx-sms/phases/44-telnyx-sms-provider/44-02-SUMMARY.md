---
phase: 44-telnyx-sms-provider
plan: 02
subsystem: sms
tags: [telnyx, opt-out, stop, postgres, migration, sms, node-test, fail-closed]

# Dependency graph
requires:
  - phase: 44-telnyx-sms-provider
    provides: "44-01: createTelnyxSmsProvider, afterSend seam, toE164 (feat/v1.7-44-telnyx-sms HEAD 8394224)"
provides:
  - "apps/app/db/migrations/0016_v1_7_sms_opt_outs.sql: sms_opt_outs keyed by E.164 (idempotent); NOT applied to any shared DB"
  - "apps/app/src/sms/opt-out-store.mjs: createPgOptOutStore(pool), createMemoryOptOutStore() -> recordOptOut / clearOptOut / isOptedOut"
  - "store.optOuts on both MemoryStore and PostgresStore"
  - "Telnyx sendSms opt-out guard: mandatory isOptedOut dependency, fail closed, runs before fetch; Telnyx 40300 -> metadata.opted_out"
affects: [44-03 shared handler (must pass isOptedOut: store.optOuts.isOptedOut), 44-04 STOP/START/HELP writes, 46 migration apply + go-live]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One runCases(makeStore, hooks) case list run against the memory store and a real-Postgres store"
    - "Guard as a mandatory constructor dependency (throws when omitted) so it cannot be forgotten at wiring time"
    - "Provider-level choke point: routeAndSend unchanged; an opted-out send is provider_error -> draft failed"

key-files:
  created:
    - apps/app/db/migrations/0016_v1_7_sms_opt_outs.sql
    - apps/app/src/sms/opt-out-store.mjs
    - apps/app/src/sms/opt-out-store.test.mjs
    - apps/app/src/sms/telnyx-optout.test.mjs
  modified:
    - apps/app/src/store.mjs
    - apps/app/src/sms/telnyx.mjs
    - apps/app/src/sms/telnyx.test.mjs
    - apps/app/package.json

key-decisions:
  - "A number is opted out iff its sms_opt_outs row has restored_at null; START sets restored_at, a later STOP resets it to null; rows are never deleted"
  - "isOptedOut is mandatory for createTelnyxSmsProvider (throws telnyx_opt_out_guard_required); a failing check blocks the send (opt_out_check_failed) and drops the error text"
  - "Telnyx 40300 is matched as a number or a string and reported as opted_out; any other error code is not"

patterns-established:
  - "Throwaway real-Postgres tests: schema t44_<hex>, REAL migration file applied twice, schema dropped in after()"

# Metrics
duration: 4min
completed: 2026-10-15
---

# Phase 44 Plan 02: SMS opt-out storage + outbound guard Summary

**Adds an `sms_opt_outs` table keyed by E.164 (migration 0016, idempotent), with a Postgres store and an in-memory store. Both are exposed as `store.optOuts`. The Telnyx provider's `sendSms` now has a guard that cannot be left out: it checks the normalised destination before any network call, blocks the send when the check itself fails, and reports Telnyx error 40300 as `opted_out`. This means an agent reply sent through the unchanged `routeAndSend` to a number that texted STOP becomes a failed draft, and no SMS goes out.**

## Performance

- **Duration:** about 4 min (2026-10-15T04:29:56Z to 04:33Z, code commits only)
- **Started:** 2026-10-15T04:29:56Z
- **Completed:** 2026-10-15
- **Tasks:** 2/2
- **Files:** 4 created, 4 modified

## Accomplishments

- Opt-out state is stored once per E.164 number. `5555550123`, `(555) 555-0123` and `+15555550123` all resolve to one row, and this was proven against real Postgres 16.
- Going from re-opt-out back to opted out resets `restored_at` to null. A negative control proves the reset is load-bearing.
- Invalid input (e-mail, short code, chat GUID, empty, null) never throws. Writes return `{ok:false, reason:"invalid_phone"}` and reads return `false`.
- The Telnyx provider cannot be built without `isOptedOut`. The guard runs before `fetch` and fails closed.
- Telnyx 40300 is reported as `opted_out` after exactly one `fetch` call (there is no retry).
- The real `routeAndSend` rejects with `sms_provider_error … opted_out` and never calls fetch. `outbound.mjs` is unchanged (`git diff origin/main --stat -- apps/app/src/outbound.mjs` is empty).

## TDD Evidence (RED before GREEN)

All files are under `.planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/`.

### Task 1: opt-out store

**RED**: `44-02-red-optout.txt` (commit a1af471, captured before any implementation; TEST_DATABASE_URL set)
```
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../apps/app/src/sms/opt-out-store.mjs' imported from .../opt-out-store.test.mjs
not ok 1 - src/sms/opt-out-store.test.mjs
# tests 1  # pass 0  # fail 1
```

**GREEN**: `44-02-green-optout.txt` (commit 44a9c9f, TEST_DATABASE_URL = local throwaway Postgres 16.15 on 127.0.0.1:54339)
```
ok 1 - memory store                      (7 cases)
ok 2 - sms_opt_outs (real Postgres)      (7 shared cases + one-row-per-number check; RUN, not skipped)
ok 3 - createStore exposes optOuts       (MemoryStore + PostgresStore)
# tests 17  # pass 17  # fail 0  # skipped 0
```

**GREEN without a DB**: `44-02-green-optout-nodb.txt`
```
ok 2 - sms_opt_outs (real Postgres) # SKIP
# tests 9  # pass 9  # fail 0
```

**Negative controls**: `44-02-negctl-optout.txt` (each mutation was in the working tree only and was restored)

| Mutation | Result |
|----------|--------|
| delete `restored_at = null,` from the Postgres upsert | real-Postgres "clear -> false; opt out again -> true with restored_at back to null" fails (16/1) |
| delete `this.optOuts = createMemoryOptOutStore()` | "createStore exposes optOuts > MemoryStore" fails (16/1) |
| delete `this.optOuts = createPgOptOutStore(this.pool)` | "createStore exposes optOuts > PostgresStore" fails (16/1) |
| restored | 17/17 |

The migration was applied twice in the Postgres `before()` hook without error, which shows it is idempotent. `git diff origin/main --stat -- apps/app/db/migrations` lists only `0016_v1_7_sms_opt_outs.sql`.

### Task 2: outbound guard

**RED**: `44-02-red-guard.txt` (commit 5feb1fc, before `telnyx.mjs` changed)
```
not ok 1 - never sends to an opted-out number          (+ 'sent'  - 'provider_error')
not ok 2 - guard receives the normalised E.164 and runs before fetch
not ok 3 - guard failure fails closed
not ok 4 - guard cannot be omitted                     ('Missing expected exception.')
not ok 5 - Telnyx 40300 is recorded as opted out, not retried   (opted_out: + undefined - true)
not ok 6 - routeAndSend surfaces an opted-out recipient as a failed draft ('Missing expected rejection.')
# tests 6  # pass 0  # fail 6
```
After the factory update, `src/sms/telnyx.test.mjs` was still 14/14 at RED time, so the test-side change broke nothing.

**GREEN**: `44-02-green-guard.txt` (commit 917ab1c)
```
ok 1..6
# tests 6  # pass 6  # fail 0
```
Re-runs after implementation: `src/sms/telnyx.test.mjs` passed 14/14, and `src/sms/opt-out-store.test.mjs` with no DB passed 9/9.

**Negative controls**: `44-02-negctl-guard.txt`

| Mutation | Result |
|----------|--------|
| guard call `if (await isOptedOut(destination))` changed to `if (false)` | tests 1, 2, 3, 6 fail (2/4). Test 1 sees status `sent` because the send went out through fetch |
| guard made optional (construction throw removed, default `async () => false`) | "guard cannot be omitted" fails (5/1) |
| restored | 6/6 |

**Registration check** (`:(glob)` form per the Amendment): `44-02-registration-check.txt`
```
registered: 6 src/config.test.mjs src/sms/mac-bridge.test.mjs src/sms/opt-out-store.test.mjs src/sms/shared.test.mjs src/sms/telnyx-optout.test.mjs src/sms/telnyx.test.mjs
exit 0
negative control: drop src/sms/telnyx-optout.test.mjs -> NOT REGISTERED, exit 1
negative control: drop src/sms/opt-out-store.test.mjs -> NOT REGISTERED, exit 1
```

**Sanity** (run with three files each): config, shared and mac-bridge passed 30/30; auth, screen and events-api passed 32/32.

**Real-Postgres scope:** only `describe("sms_opt_outs (real Postgres)")` ran against Postgres, on a local throwaway cluster (initdb in the session scratchpad, schema `t44_<hex>` dropped in `after()`). That cluster was stopped and its data directory deleted after Task 1. **Migration 0016 is NOT applied to any shared, staging or production database.** Applying it is the approved executor task in Phase 46.

## Task Commits

All on `feat/v1.7-44-telnyx-sms` in `/Users/rajren/internjobs-cms-wt-44`:

1. **Task 1: migration 0016 + opt-out store**
   - `a1af471` test(44-02): failing tests for sms opt-out store
   - `44a9c9f` feat(44-02): sms_opt_outs migration and opt-out store
2. **Task 2: fail-closed guard + 40300**
   - `5feb1fc` test(44-02): failing tests for outbound opt-out guard
   - `917ab1c` feat(44-02): fail-closed opt-out guard in Telnyx sendSms

## Files Created/Modified

- `apps/app/db/migrations/0016_v1_7_sms_opt_outs.sql`: creates the table (if it does not exist), with the semantics written in the header comment
- `apps/app/src/sms/opt-out-store.mjs`: the Postgres and memory stores (parameterised SQL only)
- `apps/app/src/sms/opt-out-store.test.mjs`: memory, real-Postgres and createStore blocks
- `apps/app/src/sms/telnyx-optout.test.mjs`: the guard, fail-closed, mandatory, 40300 and routeAndSend cases
- `apps/app/src/store.mjs`: an import plus `this.optOuts` in both constructors (no other change)
- `apps/app/src/sms/telnyx.mjs`: the mandatory `isOptedOut`, the guard in `sendViaTelnyx` and the 40300 mapping in `afterSend`
- `apps/app/src/sms/telnyx.test.mjs`: the factory helper and `bare` now pass `isOptedOut: async () => false` (no assertion changed)
- `apps/app/package.json`: the test script gains `opt-out-store.test.mjs` and `telnyx-optout.test.mjs`

## Decisions Made

- Opted out means a row exists with `restored_at` null. Rows are kept for audit, and there are no foreign keys, so unknown senders can opt out too.
- The guard is a required constructor dependency rather than an optional hook. Plan 44-03 has to pass `isOptedOut: store.optOuts.isOptedOut` (or an equivalent) when it builds the provider, and it will throw at startup if that is forgotten.
- A failed guard check drops the caught error and does not log it, because the error text may contain the phone number.

## Rule dispositions (copied from the plan; grep re-run on the branch at 917ab1c)

Rule introduced: "never send an SMS to a number that has opted out". I re-ran `grep -rn "sendSms" apps/app/src apps/app/scripts`. It found **no new send sites**: the only additions are the comment in `opt-out-store.mjs` and the guarded `telnyx.mjs`. `createTelnyxSmsProvider` is not yet constructed outside tests.

| Send site | What it sends | Disposition |
|-----------|---------------|-------------|
| `workflows/student-inbound.mjs` -> `outbound.routeAndSend` (`outbound.mjs:74`) | agent replies, holding replies, first-contact | GUARDED by the Telnyx provider (the choke point). `routeAndSend` is unchanged: an opted-out result is `provider_error` and the draft goes `failed`. Proven by test 6 |
| `server.mjs` mac-bridge route: unknown-sender reply, welcome text, hard-block reply (`server.mjs:942,1020,1046,1119`) | fixed replies | Plan 44-03 moves these into the shared handler, which sends through the injected provider, so they are guarded when that provider is Telnyx |
| `server.mjs` photon route (spectrum provider, `server.mjs:679,763`) | legacy | OUT OF SCOPE: Spectrum and mac-bridge stay unguarded because production runs mac-bridge until Phase 46. The opt-out table belongs to the Telnyx era. Recorded here for Phase 46/47 |
| `scripts/smoke-ops.mjs:195-346` | fake providers | unchanged |
| apps/startup (separate Worker, with its own `startup_channel_links.status='opted_out'`) | startup SMS | unrelated, unchanged |

The legacy "stop" branch in `createUnknownSenderText` stays for mac-bridge. On the Telnyx path, plan 44-04 consumes STOP before that branch.

## Deviations from Plan

None in scope. Every committed file is in `files_modified`, and `git diff --cached --name-only` matched each commit's task list. These small additions stay inside the plan's files:

- `createMemoryOptOutStore()` has a `_row(phone)` inspection helper. The memory half of the shared cases uses it to check `keyword`, `source` and the `opted_out_at` refresh, the same way the Postgres half uses a `select`.
- I added a few test assertions beyond the must-haves: `clearOptOut` on invalid input returns `invalid_phone`; `isOptedOut: true` (not a function) is also rejected at construction; a non-40300 error code is not reported as opted out; and `routeAndSend` still sends to a number that is not opted out (negative control).
- Commit trailers use `Co-Authored-By: Claude Opus 5.5`, matching the session attribution and the 44-01 commits, not the plan's `Sonnet 5.5` text.

## Rulings

None. No plan conflicts came up.

## Issues Encountered

- `initdb` on PATH (`/opt/homebrew/bin`) comes from the `libpq` keg, which has no `postgres` binary. I used `/opt/homebrew/opt/postgresql@16/bin` instead.
- Postgres refused to start because the scratchpad path is too long for a Unix socket (macOS limit of 103 bytes). I started it TCP-only (`-c unix_socket_directories='' -c listen_addresses=127.0.0.1`) on port 54339. The test URL was unchanged.
- The negative-control mutation that removes the guard first fails on `status` (`sent`) rather than the `fetch` call-count assertion. Both show the same thing: the request went out.

## User Setup Required

None. There were no secrets, no Telnyx calls and no deploys.

## Next Phase Readiness

- 44-03 must build the Telnyx provider with `isOptedOut: (phone) => store.optOuts.isOptedOut(phone)`; the factory throws otherwise.
- 44-04 writes through `store.optOuts.recordOptOut({phone, keyword, source})` / `clearOptOut({phone})`. It can also record `source: "telnyx_40300"` when a send returns `metadata.opted_out` with an `errorCode`.
- Phase 46: apply migration 0016 to production as an approved executor task before switching `SMS_PROVIDER=telnyx`. Otherwise `isOptedOut` errors and every Telnyx send fails closed.
