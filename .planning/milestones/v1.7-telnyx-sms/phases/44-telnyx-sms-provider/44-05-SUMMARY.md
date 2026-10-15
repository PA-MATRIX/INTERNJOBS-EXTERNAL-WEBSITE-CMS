---
phase: 44-telnyx-sms-provider
plan: 05
subsystem: sms
tags: [sms, telnyx, pairing, onboarding, copy, PAIR-01, ed25519, env-example, node-test]

# Dependency graph
requires:
  - phase: 44-telnyx-sms-provider
    provides: "44-01 Telnyx provider; 44-03 createInboundSmsHandler; 44-04 buildTelnyxInboundOptions + POST /webhooks/telnyx/sms (feat/v1.7-44-telnyx-sms HEAD efe4729)"
provides:
  - "SMS-worded /onboard/qr and /onboard/mobile (no iMessage or iPhone-only wording)"
  - "claimPairingCode defaults channelType to 'sms' (explicit callers unchanged)"
  - "Full-chain PAIR-01 test: signed Telnyx START webhook -> real provider + handler (buildTelnyxInboundOptions) + claimPairingCode binds the E.164 sender"
  - ".env.example documents TELNYX_* and the SMS_PROVIDER telnyx option, kept documented by config-env-example.test"
affects: [45 10DLC opt-in text + PAIR-02, 46 cutover (system prompt wording, pairing-page UAT), 47 mac-bridge deletion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recording Proxy as env to capture exactly which variables getConfig reads"
    - "Scripted fake pg pool keyed by SQL text, every call recorded, for claim-path assertions without a database"

key-files:
  created:
    - apps/app/src/views.test.mjs
    - apps/app/src/onboarding/pairing.test.mjs
    - apps/app/src/sms/pairing-chain.test.mjs
    - apps/app/src/config-env-example.test.mjs
  modified:
    - apps/app/src/views.mjs
    - apps/app/src/onboarding/pairing.mjs
    - apps/app/src/config.mjs
    - apps/app/.env.example
    - apps/app/package.json

key-decisions:
  - "claimPairingCode default channelType is 'sms'; no live caller relies on the default (both routes pass inbound.channelType)"
  - ".env.example: Telnyx variables are active KEY= lines with empty values; the test also accepts '# KEY=' for future optional variables"
  - "Pairing page keeps the button text 'Open Messages to confirm' (Messages is also the Android app name)"

patterns-established:
  - "Env documentation coverage test: getConfig(Proxy) read-set must be a subset of .env.example keys"

# Metrics
duration: about 5 min by the recorded start/end timestamps (05:20:53Z to 05:25:10Z), single executor
completed: 2026-10-15
---

# Phase 44 Plan 05: SMS pairing copy and Telnyx-path claim Summary

**The onboarding pairing pages now tell a student to text the code, with no iMessage or iPhone-only wording. `claimPairingCode` defaults to channel type `sms`. A full-chain test proves that a signed Telnyx `message.received` webhook carrying `START-AB12CD` binds the student to the E.164 sender with channel type `sms`, through the real Telnyx provider, the real shared handler built from `buildTelnyxInboundOptions`, and the real claim code. The Telnyx variables are documented in `.env.example`, and a test keeps them documented. The mac-bridge characterization output is identical to the 44-03 baseline.**

## Performance

- Start 2026-10-15T05:20:53Z, end 2026-10-15T05:25:10Z (recorded timestamps)
- 2 tasks, 4 code commits on `feat/v1.7-44-telnyx-sms` (efe4729..f842749)
- 9 files changed, all listed in the plan's `files_modified`

## Accomplishments

- PAIR-01, wording. On `/onboard/qr` the lede now reads "Scan with your phone camera. It opens your text messages with the number and code already filled in. Tap send." On `/onboard/mobile` it reads "We'll send the code by text message so your number is bound to your profile. ..." The button text, the code, the agent number, the QR image and the `/onboard/status` polling are unchanged. The comment block now describes SMS and `/webhooks/telnyx/sms`.
- PAIR-01, claim. `opts.channelType || "sms"`, plus JSDoc and header comments. This is the only logic line that changed (checked with `git diff origin/main -- apps/app/src/onboarding/pairing.mjs`).
- Full-chain claim proof through the Telnyx path, covering the happy path, a redelivered duplicate, a wrong-key signature, and an expired session.
- `.env.example` lists `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_WEBHOOK_PUBLIC_KEY` and `TELNYX_API_BASE`, as names only with empty values. It also carries the option comment `mac-bridge (production until Phase 46) | telnyx`. `BRIDGE_*` is kept until Phase 47.

## TDD Evidence (RED before GREEN)

Evidence directory: `.planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/`

### Task 1

| Step | File | Result |
|------|------|--------|
| RED | `44-05-red-views.txt` | 1 pass / 1 fail: `not ok 1 - pairing views use SMS wording`, error `'mobile page must not mention iMessage'`. The escape case was already green, because `escapeHtml` was already in place. |
| RED | `44-05-red-pairing.txt` | 2 pass / 2 fail. `default channel type is sms` failed with actual `'imessage'` and expected `'sms'`. `a different confirmed phone is still phone_already_bound` also failed, because it asserts the rejection audit row records `channelType: "sms"`, which comes from the default. The explicit-imessage case and the expired case were already green. They pin existing behaviour. |
| RED | `44-05-red-chain.txt` | **4/4 already green (exit 0).** As the plan anticipated, the Telnyx parser (`parseTelnyxInbound`) sets `channelType: "sms"` and the handler passes `{channelType: inbound.channelType}` explicitly, so the chain did not depend on the default. The file is kept as the end-to-end PAIR-01 proof. Its negative controls are below. |
| commit | `b0b0d76` | test(44-05): failing tests for SMS pairing copy and default channel type |
| GREEN | `44-05-green-views.txt` | 2/2 |
| GREEN | `44-05-green-pairing.txt` | 4/4 |
| GREEN | `44-05-green-chain.txt` | 4/4 (1 test with 3 subtests) |
| commit | `f23c23f` | feat(44-05): SMS pairing copy, sms default channel type |

Chain-test negative controls (`44-05-negctl-chain.txt`). These were run on the working tree before the GREEN commit, and each was reverted with `git checkout`:

| Control | Failing case |
|---------|--------------|
| 1: `claimPairingCode` skips the `update students` (claim broken) | valid START code case (`not ok 1`) |
| 2: handler skips `provider.verifyWebhook` | wrong-key case (`not ok 2`, expected 401) |
| 3: `buildTelnyxInboundOptions` with `earlyDedupe: false` | valid case's redelivery assertion (duplicate expected) |

Copy and default negative controls on the GREEN tree (`44-05-negctl-task1.txt`, each reverted, then re-run green):

- Restoring the sentence "through iMessage" makes `pairing views use SMS wording` fail with `'mobile page must not mention iMessage'`.
- Restoring "iPhone camera" on the QR page makes it fail with `"QR page must not say 'iPhone camera'"`.
- Setting the default back to `"imessage"` makes `default channel type is sms` fail, and the phone_already_bound audit case fails with it.

### Task 2

| Step | File | Result |
|------|------|--------|
| RED | `44-05-red-env.txt` | 0/2. The failure lists the undocumented variables: `TELNYX_API_BASE, TELNYX_API_KEY, TELNYX_FROM_NUMBER, TELNYX_MESSAGING_PROFILE_ID, TELNYX_WEBHOOK_PUBLIC_KEY`. It also reports that no SMS_PROVIDER telnyx option is documented. |
| commit | `5bc495a` | test(44-05): failing test for documented Telnyx env vars |
| GREEN | `44-05-green-env.txt` | 2/2 |
| GREEN | `44-05-green-config.txt` | config.test 9/9 |
| commit | `f842749` | docs(44-05): document Telnyx env vars; agent-number comment |

Negative controls (`44-05-negctl-env.txt`, each reverted):

1. A new `TELNYX_WEBHOOK_TOLERANCE_SEC` read added to config.mjs fails with `undocumented TELNYX_* variables: TELNYX_WEBHOOK_TOLERANCE_SEC`.
2. Dropping the `mac-bridge ... | telnyx` comment fails test 2.
3. Putting a value on `TELNYX_API_KEY` fails the empty-value assertion.

### Mac-bridge characterization (the rule change must not move it)

- `44-05-characterization-e2e.txt`: mac-bridge-route.e2e 5/5.
- `44-05-characterization-pg.txt`: mac-bridge-route-pg.e2e 4/4, run on a throwaway Postgres 16 (initdb in the scratchpad, TCP 127.0.0.1:54339 only, stopped and deleted afterwards). This file asserts `students.channel_type === "imessage"` on the mac-bridge claim, so the explicit channel type is still recorded.
- `44-05-characterization-diff.txt`: the ok-line diffs against `44-03-baseline-e2e-after.txt` and `44-03-baseline-pg-after.txt` are **both empty**. Both characterization test files are unchanged since 30e4ffa.
- `44-05-regression-handler.txt`: inbound-handler.test 31/31.

### Final verification (`44-05-final-verify.txt`, committed HEAD f842749, each file run alone)

| File | Result |
|------|--------|
| views.test | 2/2 |
| onboarding/pairing.test | 4/4 |
| sms/pairing-chain.test | 4/4 |
| config-env-example.test | 2/2 |
| config.test | 9/9 |
| sms/inbound-handler.test | 31/31 |
| sms/mac-bridge-route.e2e | 5/5 |
| sms/mac-bridge-route-pg.e2e | 4/4 (TEST_DATABASE_URL set, 0 skipped) |
| sms/inbound-handler-telnyx.test | 22/22 |
| sms/telnyx-route.e2e | 6/6 |
| sms/registry.test | 5/5 |
| `npm run build --workspace apps/app` (verify-app.mjs) | exit 0 (`44-05-verify-app.txt`) |
| `grep -ni imessage apps/app/src/views.mjs` | 0 matches |
| listeners on 3931-3937 afterwards | 0 |

Registration check (`44-05-registration-check.txt`, `:(glob)` pathspec per the Amendment): all 17 branch-added test files are registered, exit 0. Dropping `pairing-chain.test.mjs` or `config-env-example.test.mjs` from the script exits 1. Restored afterwards. `src/storage/r2.test.mjs` and `src/workflows/reply-to.test.mjs` are unregistered upstream on origin/main, are out of scope for this phase, and are left as they are.

## Frontend-impact disclosure

`required_steps` is `unit_tests` only. **No Playwright or Chrome visual check was run.** The rendered HTML of `/onboard/qr` and `/onboard/mobile` is asserted in node:test. A person still needs to look at both pages, and that check is deferred to the Phase 46 cutover UAT (D34 in 44-CONTEXT.md). The SMS pairing flow cannot be exercised end to end until the number is ported.

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | `b0b0d76` | test(44-05): failing tests for SMS pairing copy and default channel type |
| 1 GREEN | `f23c23f` | feat(44-05): SMS pairing copy, sms default channel type |
| 2 RED | `5bc495a` | test(44-05): failing test for documented Telnyx env vars |
| 2 GREEN | `f842749` | docs(44-05): document Telnyx env vars; agent-number comment |

## Files Created/Modified

- `apps/app/src/views.test.mjs` (new): SMS wording, link href, polling hook and escaping on both pairing views
- `apps/app/src/onboarding/pairing.test.mjs` (new): default `sms`, explicit `imessage`, expired, phone_already_bound
- `apps/app/src/sms/pairing-chain.test.mjs` (new): signed Telnyx webhook through the real provider, handler and claim
- `apps/app/src/config-env-example.test.mjs` (new): TELNYX_* documentation coverage
- `apps/app/src/views.mjs`: two lede sentences and the comment block
- `apps/app/src/onboarding/pairing.mjs`: default `"sms"` and comments
- `apps/app/src/config.mjs`: agentNumber comment only
- `apps/app/.env.example`: SMS provider section, Telnyx section
- `apps/app/package.json`: 4 test files appended to `test`

## Call sites of claimPairingCode (rule change: default channelType imessage -> sms)

`grep -rn claimPairingCode` across the worktree (excluding node_modules and .git), plus the docs checkout `/Users/rajren/internjobs-cms`:

| Site | Passes channelType? | Disposition |
|------|---------------------|-------------|
| `apps/app/src/sms/inbound-handler.mjs:242`, mac-bridge profile (`server.mjs:72-89`) | yes, `inbound.channelType` from `mac-bridge.mjs:57` (`imessage`, or `sms` when the bridge reports SMS) | UNCHANGED behaviour. The pg characterization still asserts `channel_type = imessage`, and its diff against the 44-03 baseline is empty. |
| `apps/app/src/sms/inbound-handler.mjs:242`, Telnyx profile (`server.mjs:96-110`) | yes, `inbound.channelType` = `"sms"` (telnyx.mjs parser) | UNCHANGED behaviour. Proven by pairing-chain.test. |
| `apps/app/src/server.mjs:42,81,102` | import plus injection into the two handlers | no direct call |
| `apps/app/src/server.mjs:509`, `views.mjs` comment | comments | no call |
| `apps/app/src/sms/inbound-handler.test.mjs:130`, `inbound-handler-telnyx.test.mjs:143` | fake `claimPairingCode` stubs | not affected (they record the opts they receive) |
| `apps/app/src/onboarding/pairing.test.mjs`, `sms/pairing-chain.test.mjs` | new tests | the default is exercised only by pairing.test |
| spectrum/photon route | does not call claimPairingCode | n/a |
| `.planning/milestones/v1.2-.../phase-09.../PLAN.md` | historical plan text | n/a |

No live caller depends on the default, so the default change has no production effect today. It only matters for a future caller that omits the option.

## Rule dispositions (from the plan; grep re-run on f842749)

`grep -rn "imessage\|iMessage\|Mac bridge" apps/app/src apps/app/.env.example apps/app/fly.toml apps/app/scripts` (non-test files):

| Site | Disposition |
|------|-------------|
| `views.mjs` comment and the two ledes | CHANGED. 0 matches remain. |
| `onboarding/pairing.mjs` comments and default | CHANGED. 0 matches remain. |
| `store.mjs` `confirmPairingCode` (legacy hex path) | unchanged |
| `config.mjs` agentNumber comment | CHANGED (comment only). `config.mjs:88` (the mac-bridge config block comment) is LEFT, because it describes the mac-bridge settings, which are deleted in Phase 47. |
| `.env.example` SMS_PROVIDER / BRIDGE_* | CHANGED. TELNYX_* documented. BRIDGE_* kept, under the header "Mac bridge + BlueBubbles ... Removed in Phase 47" (line 33). |
| `fly.toml` `SMS_PROVIDER = "mac-bridge"` | UNCHANGED. The flip happens in Phase 46 and needs approval. |
| `server.mjs:507,873,878` comments | LEFT. They describe the live mac-bridge route and go with it in Phase 47. |
| `sms/spectrum.mjs`, `sms/mac-bridge.mjs` platform parsing | LEFT (D26; mac-bridge deleted in Phase 47) |
| `workflows/student-inbound.mjs:368,1356,1378` (prompt wording about iMessage reactions and emoji) | DEFERRED to Phase 46 (see carry-forward) |
| 10DLC opt-in disclosure on the pairing page | NOT added. Phase 45 owns the campaign text. |

## Decisions Made

- The `claimPairingCode` default is `sms`. Both live callers pass the channel type explicitly, so this records intent for future callers and changes nothing in production today.
- `.env.example` uses active `KEY=` lines with empty values for the Telnyx variables. The coverage test also accepts `# KEY=`, to allow future optional variables. This choice is recorded in the test header.
- The `config.mjs` and `.env.example` comments say the number is "to be ported" or "being ported" to Telnyx (D27). They do not say "ported", because the port has not happened yet.

## Deviations from Plan

None. The plan was executed as written. Every file in the diff is in `files_modified`.

## Rulings

None. No plan conflicts arose.

## Carry-forward flags

1. **System prompt iMessage wording** (`workflows/student-inbound.mjs` about lines 368, 1356, 1378): Phase 46 cutover prep, so that replies suit plain SMS. It needs its own prompt checks.
2. **10DLC opt-in disclosure on the pairing page** ("Msg & data rates may apply, reply STOP to opt out"): Phase 45, which owns the 10DLC campaign text.
3. **A human look at /onboard/qr and /onboard/mobile**: Phase 46 UAT (D34).

## Issues Encountered

- `pg_ctl -o "-k <scratchpad>"` failed because the Unix socket path is longer than 103 bytes. Postgres was started TCP-only instead (`-c unix_socket_directories='' -c listen_addresses=127.0.0.1`), as the context's "TCP 127.0.0.1" asks. This is environmental, not a code deviation.

## User Setup Required

None. Nothing was deployed, pushed or merged. No Telnyx calls were made and no secrets were used.

## Next Phase Readiness

44-06 can proceed. PAIR-01 is implemented and proven at the unit and chain level. PAIR-02 (non-E.164 iMessage-era addresses) remains Phase 45.
