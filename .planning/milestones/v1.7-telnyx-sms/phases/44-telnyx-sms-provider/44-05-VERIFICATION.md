---
phase: 44-telnyx-sms-provider
plan: 05
verified: 2026-10-15T00:40:00Z
status: human_needed
score: 4/4 must-haves verified
human_verification:
  - test: "Look at /onboard/qr and /onboard/mobile"
    expected: "SMS wording renders correctly, QR shown, Open Messages link works"
    why_human: "Visual check deferred to Phase 46 UAT by D34; apps/app has no Playwright harness. Not a gap."
---

# Plan 44-05 Verification (PAIR-01)

## Architectural Context Loaded
- No `.planning/NORTH-STAR.md` in this repo. Locked sources used: 44-CONTEXT.md D34 (visual check deferred to Phase 46 UAT; route follows TELNYX_WEBHOOK_PUBLIC_KEY) and the plan's rule_dispositions table.

## Truths (re-run literally in /Users/rajren/internjobs-cms-wt-44/apps/app, HEAD f842749)
| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | views SMS wording | VERIFIED | views.test 2/2. `grep -i imessage\|iphone views.mjs` empty. Test asserts no /imessage/i, code + number rendered, href = escaped smsUri, no "iPhone camera", `<b>x</b>` escaped, /onboard/status poll kept. |
| 2 | claimPairingCode default sms | VERIFIED | pairing.test 4/4. Source `opts.channelType \|\| "sms"`; logic diff is that one line plus comments. |
| 3 | Telnyx chain claim | VERIFIED | pairing-chain 4/4. Imports `buildTelnyxInboundOptions` from registry.mjs (no copied options). Real Ed25519, real provider/handler/claim. Wrong-key 401 asserts zero pool calls. |
| 4 | env.example coverage | VERIFIED | config-env-example 2/2. config.mjs reads 5 TELNYX_* vars (API_KEY, FROM_NUMBER, MESSAGING_PROFILE_ID, WEBHOOK_PUBLIC_KEY, API_BASE); all 5 in .env.example, empty values; SMS_PROVIDER option line; BRIDGE_* kept. No secrets (only added `=value` matches were comment lines). |

Other runs: config.test 9/9; telnyx-route.e2e 6/6 against throwaway PG16 (5 + 1 DB-gated skip without DB).
mac-bridge-route.e2e (5/5) and mac-bridge-route-pg.e2e (4/4, TCP 127.0.0.1, sslmode=disable): ok/not-ok lines IDENTICAL to evidence/44-03-baseline-e2e-after.txt and 44-03-baseline-pg-after.txt. PG stopped and deleted.

## TDD order
Commits: b0b0d76 (tests) -> f23c23f (impl) -> 5bc495a (env test) -> f842749 (impl). RED evidence exists and shows genuine failures (views 1/2 fail, pairing 2/4 fail, env 0/2 fail). pairing-chain RED was 4/4 green by design (parser passes channelType sms explicitly); SUMMARY states this.
Sabotage re-applied by me and restored (git status clean): (a) claim `update students` neutered -> chain test 2 fail ("valid signed START code binds..."); (b) provider.verifyWebhook bypassed -> chain test 2 fail ("wrong key is 401 and touches no database"). Controls are meaningful. Control 3 (earlyDedupe) recorded in evidence/44-05-negctl-chain.txt, not re-run.

## Specific checks
- Call-site table complete: only caller of claimPairingCode is inbound-handler.mjs:242 (passes inbound.channelType; server.mjs only wires it as a dependency). mac-bridge.mjs still yields `imessage` unless platform is sms.
- student-inbound.mjs / workflows untouched (empty diff efe4729..HEAD). No 10DLC text added.
- Registration check (`:(glob)` form): all 4 branch-added test files are in package.json test script. The glob lists 2 unregistered files, `storage/r2.test.mjs` and `workflows/reply-to.test.mjs`, which predate this branch (not added by 44-05), so not a gap here.
- `npm run build` and `npm run verify`: pass. Scope: 9 changed files, all within files_modified. Worktree clean.

## Gaps
None. Carry-forwards (per SUMMARY, confirmed in plan): system-prompt iMessage wording -> Phase 46; 10DLC disclosure -> Phase 45; human look at the two pages -> Phase 46 UAT.

Status is `human_needed` solely for the D34-deferred visual check; all automated must-haves pass and 44-06 may stack.

_Verifier: Claude (rrr-verifier)_
