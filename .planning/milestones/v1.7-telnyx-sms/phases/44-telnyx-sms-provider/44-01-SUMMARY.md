---
phase: 44-telnyx-sms-provider
plan: 01
subsystem: sms
tags: [telnyx, ed25519, webhook-verification, sms, node-test, config]

# Dependency graph
requires:
  - phase: 43-lakera-safety-move-to-inbox
    provides: origin/main 951e103 (base of the worktree)
provides:
  - "apps/app/src/sms/telnyx.mjs: createTelnyxSmsProvider + verifyTelnyxSignature (Ed25519, fail closed)"
  - "apps/app/src/sms/shared.mjs: extractPairingCode (moved), toE164, classifyKeyword, buildHelpReply"
  - "config.telnyx block + SMS_PROVIDER=telnyx validation (incl. TELNYX_FROM_NUMBER == AGENT_NUMBER, D27)"
  - "four new test files registered in the apps/app npm test script"
affects: [44-02 opt-out guard, 44-03 shared handler, 44-04 route + healthz, 44-06 CI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Providers take injected { fetchImpl, now } so tests need no network or clock"
    - "Single afterSend() result builder as the seam for 44-02 (40300 STOP-blocked mapping)"
    - "Characterization test captured GREEN before a refactor moves code"

key-files:
  created:
    - apps/app/src/sms/shared.mjs
    - apps/app/src/sms/shared.test.mjs
    - apps/app/src/sms/mac-bridge.test.mjs
    - apps/app/src/sms/telnyx.mjs
    - apps/app/src/sms/telnyx.test.mjs
    - apps/app/src/config.test.mjs
  modified:
    - apps/app/src/sms/mac-bridge.mjs
    - apps/app/src/config.mjs
    - apps/app/package.json

key-decisions:
  - "Telnyx webhook verification fails closed when TELNYX_WEBHOOK_PUBLIC_KEY is unset (reason public_key_missing); apps/startup's skip-when-unkeyed is not copied"
  - "Non-numeric telnyx-timestamp is rejected explicitly (invalid_timestamp); Math.abs(NaN) > 300 is false and would otherwise pass the window check"
  - "buildHelpReply drops the URL (keeps STOP/START text) rather than truncating mid-word when the app URL would push it past 160 chars"

patterns-established:
  - "Ed25519 raw 32-byte base64 key -> SPKI DER via fixed prefix 302a300506032b6570032100"

# Metrics
duration: 4min
completed: 2026-10-14
---

# Phase 44 Plan 01: Telnyx SMS provider + config Summary

**A network-free Telnyx SMS provider for the student app. It verifies Ed25519 webhooks over `${timestamp}|${rawBody}` with a 300 s window and rejects every request when no key is configured. It parses `message.received` envelopes using `data.id` as the dedupe id and `metadata.provider: "telnyx"`, and sends through `POST /v2/messages` from the configured number. Alongside it: shared SMS helpers, and a `SMS_PROVIDER=telnyx` config branch that reports a missing `TELNYX_*` key or a from-number that differs from `AGENT_NUMBER`.**

## Performance

- **Duration:** 4 min (measured from worktree creation to last code commit)
- **Started:** 2026-10-14
- **Completed:** 2026-10-14
- **Tasks:** 3/3
- **Files modified:** 9 (exactly the plan's `files_modified`)

## Accomplishments

- SMS-01 (verify half): `verifyTelnyxSignature` / `verifyWebhook` accept correctly signed requests up to 299 s old or ahead. They reject a forged key, a tampered body, ±301 s, a signature without the `ts|` prefix, a missing header, a non-numeric timestamp and an unset key (`public_key_missing`). Malformed key material never throws.
- SMS-02 (send): `sendSms` posts to `${apiBase}/v2/messages` with a Bearer key and a 10 s `AbortSignal`. It normalises `to` to E.164, sends `messaging_profile_id` only when it is configured, and caps the body at 1580 characters ending in `...`. Error paths: 422/500 return `{status, errorCode}`; a thrown fetch returns only the error message; a missing key or from-number returns `skipped_configuration_missing` without calling fetch; an e-mail destination returns `invalid_destination` without calling fetch.
- `parseInbound` uses `data.id` (not `payload.id`) as `providerEventId`. It normalises the from-number to E.164, sets `metadata.provider: "telnyx"` explicitly (otherwise store dedupe would fall into the `photon` namespace), keeps `eventType` (so `message.finalized` can be ignored by the 44-04 route), never copies the body into metadata, and does not throw on an envelope with no `data`.
- The mac-bridge behaviour is pinned by a characterization test that was GREEN before `extractPairingCode` moved to `shared.mjs`, and is still GREEN after the move. The only change to `mac-bridge.mjs` is the import swap.
- `config.telnyx` and the `SMS_PROVIDER=telnyx` validation. The mac-bridge and spectrum branches are untouched.

## TDD Evidence (RED before GREEN)

All evidence is in `.planning/milestones/v1.7-telnyx-sms/phases/44-telnyx-sms-provider/evidence/`. In every case the test commit precedes the implementation commit in git history.

**mac-bridge (characterization baseline, NOT a RED):** `44-01-baseline-macbridge.txt` was captured GREEN (14/14) against the UNCHANGED `mac-bridge.mjs` and committed as `ee0752b`, before the move in `868623f`. After the move, `44-01-green-macbridge.txt` is 14/14.

**shared:** RED in `44-01-red-shared.txt`:
```
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../apps/app/src/sms/shared.mjs' imported from .../shared.test.mjs
```
GREEN in `44-01-green-shared.txt`: `# tests 7 / # pass 7 / # fail 0`.

**telnyx:** RED in `44-01-red-telnyx.txt`:
```
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../apps/app/src/sms/telnyx.mjs' imported from .../telnyx.test.mjs
```
GREEN in `44-01-green-telnyx.txt`: `# tests 14 / # pass 14 / # fail 0`. The appended tail is the re-run after the config change, also 14/14.

**config:** RED in `44-01-red-config.txt`: `# tests 9 / # pass 4 / # fail 5`. The failing tests were 2 (missing keys), 3 (case-insensitive), 4 (AGENT_NUMBER mismatch), 8 (config block) and 9 (secrets isolation). The 4 that passed in RED are the absence and unchanged-behaviour controls (complete config, formatting not a mismatch, mac-bridge no TELNYX entries, bridge requirements). GREEN in `44-01-green-config.txt`: `# tests 9 / # pass 9 / # fail 0`.

**Negative controls (each mutation was applied, run, then restored with a byte comparison):**

| Mutation | Result | Evidence |
|---|---|---|
| delete the 10-digit branch in `toE164` | `not ok 1 - toE164` | negctl-shared |
| break the moved START- regex | 3 mac-bridge parseInbound tests fail | negctl-shared |
| un-anchor STOP_RE | 2 classifyKeyword tests fail | negctl-shared |
| skip verify when key unset (apps/startup behaviour) | unkeyed case accepted, tests 2 and 4 fail | negctl-telnyx |
| remove try/catch in verify | "malformed key material never throws" fails | negctl-telnyx |
| `metadata.provider` falls back to `photon` | parseInbound tests 5 and 9 fail | negctl-telnyx |
| hard-code from `+14063210019` | "sendSms: POST /v2/messages from the configured number" fails | negctl-telnyx |
| remove the telnyx validation branch | config tests 2, 3 and 4 fail | negctl-config |
| drop a new test file from package.json | the registration check exits 1 and names it | registration-check |

**Final per-file runs (`44-01-final-verify.txt`, each file run alone):** mac-bridge 14/14, shared 7/7, telnyx 14/14, config 9/9. The pre-existing `auth.test.mjs` is still 15/15 now that `config.mjs` imports `sms/shared.mjs`. The whole suite was not run locally, by design; CI runs it in 44-06.

## Task Commits

All commits are in the worktree `/Users/rajren/internjobs-cms-wt-44`, branch `feat/v1.7-44-telnyx-sms`, cut from origin/main 951e103 and not pushed.

1. **Task 1: shared helpers + mac-bridge characterization**
   - `ee0752b` test: pin mac-bridge provider behaviour (baseline)
   - `92c5a2a` test: failing tests for sms shared helpers
   - `868623f` feat: shared sms helpers; mac-bridge imports extractPairingCode
2. **Task 2: Telnyx provider**
   - `96cd295` test: failing tests for Telnyx provider
   - `3aadb99` feat: Telnyx SMS provider (Ed25519 verify fail-closed, send, parse)
3. **Task 3: config + test registration**
   - `04647a5` test: failing tests for telnyx config
   - `8394224` feat: telnyx config and SMS_PROVIDER=telnyx validation

## Files Created/Modified

- `apps/app/src/sms/shared.mjs`: provider-neutral helpers (new)
- `apps/app/src/sms/telnyx.mjs`: Telnyx provider (new)
- `apps/app/src/sms/mac-bridge.mjs`: import swap only (+1/-8)
- `apps/app/src/config.mjs`: `telnyx` block, `telnyx` validation branch, comment on `smsProviderName`
- `apps/app/package.json`: `test` script now also lists the four new test files
- `apps/app/src/{config,sms/shared,sms/mac-bridge,sms/telnyx}.test.mjs`: new tests

## Decisions Made

- Fail closed on an unset public key (as the plan required); apps/startup's skip-when-unkeyed is flagged only. That is another app and is unchanged here.
- `invalid_timestamp` is an explicit rejection reason (see key-decisions).
- If the URL would push the HELP reply past 160 characters, `buildHelpReply` drops the URL rather than slicing the text mid-word.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's registration-check command undercounted the new test files**
- **Found during:** Task 3 verify
- **Issue:** The plan's `git diff --name-only --diff-filter=A origin/main -- 'apps/app/src/**/*.test.mjs'` uses a plain pathspec. Without `:(glob)` magic, `**/` requires at least one extra directory, so `src/config.test.mjs` was invisible to it. It printed `registered: 3` and would have passed even if `config.test.mjs` were unregistered.
- **Fix:** Re-ran the check with `':(glob)apps/app/src/**/*.test.mjs'`, which printed `registered: 4` with all four files listed. Its negative control (dropping `src/config.test.mjs` from package.json) exits 1 and names the file. Both runs are in `44-01-registration-check.txt`. This was a verify command, not committed code, so no file changed. Plans 44-02..44-06 should use the `:(glob)` form if they reuse this check.
- **Commit:** none (verification only)

**Commit trailer:** the plan text asked for `Co-Authored-By: Claude Sonnet 5.5`. The commits use `Claude Opus 5.5`, which is the model that actually ran this plan, per the session's attribution instruction.

## Rulings

None. No plan conflicts arose.

## Issues Encountered

- The local-suite-guard hook blocked a `for` loop over test files (it treats the loop variable as a glob). Each file was then run individually and named literally, as the rules require.

## Out of Scope (recorded as the plan requires)

`src/storage/r2.test.mjs` and `src/workflows/reply-to.test.mjs` are unregistered upstream and are LEFT AS-IS, out of scope for this phase. The registration check only looks at files added on this branch.

## User Setup Required

None. No secrets, no Telnyx calls, no deploy, no push (the push happens in 44-06).

## Next Phase Readiness

- 44-02 can add the 40300 (STOP-blocked) mapping and the opt-out guard in `afterSend()` in `telnyx.mjs`; `classifyKeyword` and `buildHelpReply` are ready in `shared.mjs`.
- 44-04 owns the `/webhooks/telnyx/sms` route (gated on the public key, per D34) and `/healthz`; `parseInbound(...).eventType` is there so the route can ignore `message.finalized`.
- `fly.toml` is unchanged (cutover is Phase 46).
