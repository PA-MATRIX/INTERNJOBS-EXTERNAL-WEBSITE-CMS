---
phase: 44-telnyx-sms-provider
verified: 2026-10-15T06:00:00Z
status: human_needed
score: 6/6 requirements verified (code + tests, no network); 1 deferred human item
re_verification: false
human_verification:
  - test: "Visual check of the SMS pairing pages (views.mjs copy, no iMessage wording)"
    expected: "Pairing page tells the student to text the code by SMS and renders correctly"
    why_human: "Deferred by D34 to Phase 46 UAT; 44-05 flagged it human_needed"
---

# Phase 44: Telnyx SMS provider - Verification Report

**Goal:** The student app can run on Telnyx SMS behind SMS_PROVIDER=telnyx, with signed inbound, outbound, dedupe, Lakera parity, STOP/HELP and SMS pairing, all proven by tests without network.
**Code verified:** worktree /Users/rajren/internjobs-cms-wt-44, branch feat/v1.7-44-telnyx-sms, head f842749 (clean tree). Draft PR #30.
**Status:** human_needed (all automated checks pass; only the D34-deferred visual check remains)

## Architectural Context Loaded

- No NORTH-STAR.md, AGENTS.md or repo CLAUDE.md found. Global CLAUDE.md read (RRR hierarchy, TDD order). No `*-locked*` memory files.
- Milestone locks D10 (merge needs Raj's recorded exception) and D34 (route inert until TELNYX_WEBHOOK_PUBLIC_KEY set) are honoured by PR #30; they are intentional, not gaps.

## Requirement to code path to proving test

| Req | Code path (apps/app/src) | Proving test | Status |
| --- | --- | --- | --- |
| SMS-01 signed inbound, 300 s window, fail-closed | `sms/telnyx.mjs` verifyTelnyxSignature (Ed25519 over `ts|rawBody`, DEFAULT_TOLERANCE_SEC=300); `server.mjs:900` route returns 401 public_key_missing before body read | `telnyx-route.e2e` "signature: forged requests are 401..." and "D34 gate"; `telnyx.test` | VERIFIED |
| SMS-02 outbound via Messages API, id recorded | `sms/telnyx.mjs` sendViaTelnyx POST `${apiBase}/v2/messages`, Bearer key; fetch injected | `telnyx.test`; route e2e "valid unknown sender gets one reply via Telnyx" | VERIFIED |
| SMS-03 duplicate delivery = one message, one run | `inbound-handler.mjs` earlyDedupe (hasMessagingEvent) plus store dedupe | route e2e "retry of the same event id is a no-op"; handler-telnyx "early dedupe" | VERIFIED |
| SMS-04 Lakera parity, ack within budget | `inbound-handler.mjs` screenAndDispatch (flagged or score>=0.8 hard block, safety_events row), run after ack when ackEarly | handler-telnyx "ack-first: 200 precedes screen and workflow", "Lakera hard-block..." | VERIFIED |
| OPT-01 STOP/START/HELP, never send while opted out | `inbound-handler.mjs` classifyKeyword -> `store.optOuts.recordOptOut/clearOptOut`; `telnyx.mjs` mandatory fail-closed isOptedOut (throws telnyx_opt_out_guard_required); `opt-out-store.mjs` + migration 0016; Telnyx 40300 recorded | `telnyx-optout.test` (6/6 with real PG), route e2e "STOP, guard, START round trip; HELP...", handler-telnyx keyword tests | VERIFIED |
| PAIR-01 SMS pairing copy, texted code claims | `onboarding/pairing.mjs` default channel sms; `views.mjs`; handler START-code branch claimPairingCode with channelType sms | `pairing-chain.test` "a texted START code claims the student through the Telnyx path" (PG), handler-telnyx "pairing (PAIR-01)", `pairing.test`, `views.test` | VERIFIED (visual deferred) |

## Spot-runs (literal, at f842749)

- No DB: `telnyx-route.e2e` + `pairing-chain` + `telnyx-optout` -> 16 tests, 15 pass, 0 fail, 1 skipped (the failing-store test, needs TEST_DATABASE_URL).
- No DB: `telnyx.test` + `inbound-handler-telnyx.test` + `opt-out-store.test` -> 45 pass, 0 fail; real-PG describe skipped as designed.
- Throwaway postgres:16 (docker, port 54341): `telnyx-optout` 6/6, `telnyx-route.e2e` + `pairing-chain` 10/10, 0 skipped. Container removed; worktree still clean.

## 44-06 checks

- PR #30: draft, OPEN, unmerged, head f842749; body carries the DO NOT MERGE / D10 / D34 statement and the Generated-with footer.
- `gh pr checks 30`: all 7 jobs pass. App-tests log: 190 tests, 190 pass, 0 fail, 0 skipped; real-PG groups (safety-events handler, mac-bridge pairing path, sms_opt_outs) printed `ok` with no `# SKIP` on them. Only "SKIPPED" text is the pre-existing Lakera live-API test name (needs a live key), not a Phase 44 skip.
- gitleaks evidence: negative control detected (exit 1); origin/main..HEAD (23 commits) and apps/app tree clean. SUMMARY has RED (guard removed -> telnyx-optout fails) before GREEN (20/20, 190 tests). TDD ordering satisfied.
- Diff scope: 31 files, all under apps/app/; no fly.toml, lockfile or .github change.
- Note: submission gate (rrr) pass is a no-op (no submission file); it proves nothing about Phase 44.

## Production untouched

- `fly.toml` on the branch: `SMS_PROVIDER = "mac-bridge"` (line 11).
- `fly releases -a internjobs-ai-student-app`: latest v58 (Oct 14 2026, pre-dates this work); no new release.
- Migration 0016 applied: NOT checked (needs prod DB access; skipped by instruction). 44-06 SUMMARY states it is applied nowhere; PR body says the same. Unverified independently.

## Anti-patterns / security pass

No TODO/console.log in telnyx.mjs, shared.mjs, opt-out-store.mjs (per 44-06 evidence). Pass 1: no SQL interpolation, no shell, no unvalidated LLM output to DB found in the reviewed paths; fail-closed on key missing and on opt-out read failure. No blockers.

## Carry-forwards (Phase 45/46, not gaps in Phase 44)

1. Apply migration 0016 before flipping SMS_PROVIDER=telnyx (else every Telnyx send fails closed).
2. Raj must record the D10 exception for Phase 44 before merge (D33 covered Phase 43 only); merge and deploy in Phase 46.
3. System-prompt iMessage wording still to be updated for SMS.
4. 10DLC opt-in language and HELP wording (Phase 45).
5. HELP-AFTER-STOP: outbound guard also blocks the HELP reply to an opted-out number; check CTIA/Telnyx auto-response rules.
6. 422 handling on pairing error.
7. APP-BOOT-DB: app crashes ~2 s after boot if Postgres is unreachable (needs its own plan).
8. Visual check of the pairing pages (D34, Phase 46 UAT).

## Gaps

None.

_Verifier: Claude (rrr-verifier)_
