---
phase: 44-telnyx-sms-provider
plan: 01
verified: 2026-10-14T00:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
gaps: []
---

# Plan 44-01: Telnyx provider + config Verification Report

**Goal:** Pure, network-free Telnyx SMS provider (Ed25519 verify that fails closed, parseInbound, sendSms), shared helpers, `config.telnyx` + `SMS_PROVIDER=telnyx` validation; mac-bridge behaviour unchanged. Covers SMS-01 (verify half) and SMS-02 (send).
**Code:** /Users/rajren/internjobs-cms-wt-44, branch feat/v1.7-44-telnyx-sms (ee0752b..8394224 on origin/main 951e103). Worktree clean before and after.

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md`, AGENTS.md or `*-locked*` memory files were found.
- CONTEXT D34 (route gate is the public key, not the provider name; Telnyx-route replies go via Telnyx) is a plan 44-04 concern. 44-01 adds a pure module only; nothing here contradicts it.
- User TDD rule (global CLAUDE.md): tests-first, RED evidence before GREEN. Checked below.

## Observable Truths

| # | Truth | Status | Evidence (re-run by verifier) |
|---|-------|--------|-------------------------------|
| 1 | verify rejects forged/tampered/stale(301s past and future)/no-prefix/unkeyed; 299 s accepted; unkeyed = public_key_missing | VERIFIED | `telnyx.mjs` verifyTelnyxSignature: `!publicKeyB64` returns ok:false first, message is `${timestamp}\|${rawBody}`, window `Math.abs(now-ts) > 300`. Test lines 57-95. NC1 (skip when unset) turned 2 tests red. NC4 (window 400) turned 2 red. |
| 2 | malformed key material never throws | VERIFIED | try/catch around `verify`; test "never throws" passes; direct probe with bad key returns ok:false. |
| 3 | parseInbound: providerEventId=data.id, E.164 address, channelType sms, metadata.provider "telnyx", eventType kept | VERIFIED | `telnyx.mjs` parseTelnyxInbound. NC2 (provider "photon") turned 2 tests red. |
| 4 | sendSms POST `${apiBase}/v2/messages`, Bearer key, from = configured number, E.164 `to`, profile id only if set, result {sent, data.id} | VERIFIED | `sendViaTelnyx` reads `telnyx.fromNumber`, `telnyx.apiBase` (no literal number or host in code). NC3 (hard-coded +14063210019) turned 1 test red. Tests use `https://api.telnyx.test` and an injected fetch. |
| 5 | sendSms failure paths (422 -> provider_error + status + first error code; thrown fetch -> message only, no key; no key -> skipped_configuration_missing, no fetch; email dest -> no fetch; 2000 chars -> <=1580) | VERIFIED | `afterSend`, `capBody`, guards in `sendViaTelnyx`; tests lines 265-326 pass. |
| 6 | shared toE164 / extractPairingCode pinned | VERIFIED | shared.test.mjs 7/7. `extractPairingCode` body is byte-identical to 951e103 mac-bridge version (diffed). NC6 (break START- regex) turned 3 red across shared + mac-bridge tests. |
| 7 | mac-bridge behaviour unchanged | VERIFIED | The only mac-bridge.mjs diff is the import swap and deletion of the private function. Characterization test run GREEN 14/14 against UNCHANGED code in a scratch worktree at ee0752b (mac-bridge.mjs identical to 951e103) and again at HEAD 14/14. |
| 8 | config: telnyx block, 3 missing-key names, FROM vs AGENT_NUMBER mismatch (format-insensitive), mac-bridge branch unchanged, no TELNYX entries for mac-bridge | VERIFIED | config.test.mjs 9/9. NC5 (disable telnyx branch) turned 3 red. |
| 9 | Registration check with `:(glob)apps/app/src/**/*.test.mjs` | VERIFIED | Exit 0, "registered: 4" (config, mac-bridge, shared, telnyx). Dropping `src/sms/shared.test.mjs` from package.json: exit 1, `NOT REGISTERED: [ 'src/sms/shared.test.mjs' ]`; restored. The plain pathspec (no `:(glob)`) finds only 3 of the 4, confirming the 44-01 amendment is necessary. |

(Truth 9 is the plan's 8th listed must_have; 9 rows because truth 3 and 4 are split from the SMS-01 / SMS-02 lines in the plan. Score counts the plan's 8 must_haves.)

## Test runs (each file alone, from apps/app)

| File | Result |
|------|--------|
| src/sms/mac-bridge.test.mjs | 14/14 pass |
| src/sms/shared.test.mjs | 7/7 pass |
| src/sms/telnyx.test.mjs | 14/14 pass |
| src/config.test.mjs | 9/9 pass |
| src/auth.test.mjs | 15/15 pass (neighbour; unaffected by config import of shared.mjs) |

## RED before GREEN

- Commit order: ee0752b (mac-bridge baseline) < 92c5a2a (shared tests) < 868623f (shared impl) < 96cd295 (telnyx tests) < 3aadb99 (telnyx impl) < 04647a5 (config tests) < 8394224 (config impl). Test-only commits precede each feature commit, and each test commit touches only the test file.
- Evidence: red-shared and red-telnyx fail with ERR_MODULE_NOT_FOUND (module absent); red-config fails 5 of 9 (4 pass, which are the pre-existing-behaviour controls). Mac-bridge is correctly labelled a GREEN baseline, not RED; independently reproduced.

## Key links

| From | To | Status |
|------|----|--------|
| mac-bridge.mjs | shared.mjs `import { extractPairingCode }` | WIRED |
| telnyx.mjs | shared.mjs `toE164`, `extractPairingCode` | WIRED |
| config.mjs | shared.mjs `toE164` (no import cycle; auth.test and config.test load fine) | WIRED |

## Security pass (Pass 1)

No findings in phase files. No secrets (only `api.telnyx.com` is the config default and a config-test assertion; tests generate Ed25519 keys in-test). No network: fetch injected, test base is `.test`. No shell/SQL/eval. Thrown-fetch result carries only the message, never the key. Pass 2 not run.

## Scope

`git diff --stat 951e103..HEAD` is exactly the 9 files in `files_modified`; no extras.

## Anti-patterns

None blocking. Informational only:
- The non-numeric-timestamp test (line ~84) asserts `ok === false` but not `reason: invalid_timestamp`. Behaviour was probed directly: "abc", "1e3", "-5", "12.5", "NaN" all return invalid_timestamp. The rejection itself is proven; the reason string is not pinned. Optional tightening, not a gap.
- `afterSend` has a comment forward-referencing plan 44-02 (40300 mapping); this is a planned seam, not a stub.
- `apps/startup` Worker still skips verification when its key is unbound (out of scope, flagged by the plan).
- Two pre-existing unregistered tests on main (`storage/r2.test.mjs`, `workflows/reply-to.test.mjs`) are intentionally left alone per plan.

## Human verification

None required (backend_only, unit_tests).

## Gaps Summary

None. 44-02 may be stacked on this plan.

Not verified here: the SUMMARY file itself was not trusted; every claim above was re-run or diffed. Whole-suite/CI run is deferred to plan 44-06 per plan.

---
_Verified: 2026-10-14_
_Verifier: Claude (rrr-verifier)_
