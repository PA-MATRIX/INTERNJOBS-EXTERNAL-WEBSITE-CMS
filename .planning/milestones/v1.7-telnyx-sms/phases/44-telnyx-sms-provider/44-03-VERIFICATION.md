---
phase: 44-telnyx-sms-provider
plan: 03
verified: 2026-10-14T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
gaps: []
---

# Plan 44-03 Verification Report (shared inbound SMS handler; mac-bridge unchanged)

**Goal:** extract the live `/webhooks/mac-bridge` route into a provider-parameterised handler with identical mac-bridge behaviour.
**Status:** passed. **Code:** `/Users/rajren/internjobs-cms-wt-44`, `feat/v1.7-44-telnyx-sms` at 30e4ffa.

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` in this repo. Global CLAUDE.md (RRR hierarchy, TDD-first) applies; no `*-locked*` memory touches this area.
- 44-03-PLAN Amendment: registration check must use `':(glob)apps/app/src/**/*.test.mjs'`. Applied below.
- D10 (do not merge or deploy): nothing pushed, merged or deployed by this plan; confirmed by branch state.

## Independent proof of "unchanged behaviour"

Scratch detached worktree at 141233e (`git diff 917ab1c 141233e -- apps/app/src/server.mjs` is empty, so server.mjs is the pre-refactor route), throwaway Postgres 16.15 on 127.0.0.1:54351, `TEST_DATABASE_URL=...?sslmode=disable`.
(Environment note: without `sslmode=disable` the pg e2e fails with "The server does not support SSL connections" on this cluster. That is a harness detail of my throwaway DB, not a code defect.)

| Run | DB-less e2e (5 cases) | Real-PG e2e (4 cases) |
|-----|----------------------|----------------------|
| pre-refactor 141233e | 5 pass / 0 fail | 4 pass / 0 fail / 0 skip |
| HEAD 30e4ffa | 5 pass / 0 fail | 4 pass / 0 fail / 0 skip |
| diff of ok/not-ok lines (indented subtests included) | empty | empty |

The test files are the same at both commits (they were added in 2266131 / 141233e, before any server.mjs change).

## Observable truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DB-less e2e pins 401/401/200 unmatched/200 duplicate/422 pairing_code_invalid, green before and after; wrong provider fails | VERIFIED | Above. Sabotage: `provider: macBridgeProvider` -> `spectrumProvider` in the wrapper: 0/5 pass, restored with `git checkout`, worktree clean |
| 2 | Real-PG e2e: START bind, replay, expired, phone_already_bound | VERIFIED | 4/4 on both commits, identical |
| 3 | handler 'mac-bridge profile' order and provider-is-a-parameter | VERIFIED | `node --test src/sms/inbound-handler.test.mjs`: 31 tests, 31 pass; code read below confirms ensureLinkedIn before writes, respond last |
| 4 | claim failure mapping | VERIFIED | handler lines 233-249 match original; covered by unit tests and PG case 4 |
| 5 | Lakera parity on both paths | VERIFIED | one `screenAndDispatch`, same rule (`flagged === true \|\| score >= 0.8`), same SQL and params, em-dash string byte-identical to original (`LEGACY_HARD_BLOCK_REPLY`), sources `mac-bridge` / `mac-bridge-pairing` preserved |
| 6 | reply, welcome, 422, workflow-reject paths | VERIFIED | handler lines 252-332 match original statement for statement |
| 7 | ackEarly behaviour; mac-bridge uses ackEarly false | VERIFIED | server.mjs wires `ackEarly: false`; `run = fn => ackEarly ? push : fn()` awaits inline, so errors propagate as before |
| 8 | server.mjs hunks outside the spectrum route | VERIFIED | hunks: `@@ -9,0`, `-66,0`, `-832,4`, `-837,332` vs photon old 660-823; photon block md5 identical old 660-823 vs new 682-845 (b1f1f74a...) |

## Semantic drift review (917ab1c route body vs inbound-handler.mjs)

Order preserved: verify (401) -> JSON.parse -> parseInbound -> START claim (requires `store?.pool`) -> claim ok: ensureLinkedIn, writeMessagingEvent, writeAuditEvent, writeInboundMessage, screen, workflow, 200 -> claim fail: event + 200 -> legacy confirm/record -> unknown reply (+ outbound `:unknown-reply` row) -> welcome -> student_reply write + screen + workflow -> 422/200.
Literal substitutions only (`providerName`, `${providerName}-pairing`, injected log, `lakeraKey()` read at call time). `store`, `config`, `macBridgeProvider` are module-level consts, so capture at construction is safe; the wrapper sits in the same try/catch position so a thrown error still reaches the outer 500 handler.
Declared deviation (outbound unknown-reply row after the ack) applies only with `ackEarly: true`; mac-bridge runs `ackEarly: false`, the original synchronous mode. Not a mac-bridge behaviour change.
Added behaviour: constructor throws if `providerName`, `provider` or `hardBlockReply` is missing. Wiring-time only; the mac-bridge wiring supplies all three.

## Other checks

- `npm run build --workspace apps/app`: "internjobs-app: waitlist smoke checks passed".
- Registration (`:(glob)` form, A-filter vs origin/main): all 9 added test files present in the `test` script, including config.test.mjs; the summary's negative controls are evidenced in 44-03-registration-check.txt.
- Scope: `git diff --stat 917ab1c HEAD` lists exactly the 6 `files_modified`. No secrets (only the dummy `test-bridge-secret`), no external network (fetches target the local test server).
- TDD ordering: baseline commits 2266131/141233e (GREEN on unchanged server, stated as baseline), RED b2b39d6 (missing-module), GREEN 30e4ffa. RED evidence precedes GREEN.
- Cleanup: scratch worktree removed, throwaway Postgres stopped and deleted, ports free, code worktree clean.

## Anti-patterns / Security Pass

No TODO/stub patterns in the handler. Security Pass: no Pass 1 issues in phase-modified files (no query interpolation; safety_events insert is parameterised; no eval/shell).

## Advisories (non-blocking)

1. Commit trailers say `Claude Opus 5.5` where the plan text said `Sonnet 5.5` (SUMMARY discloses it).
2. Pre-existing: with `LAKERA_GUARD_API_KEY` unset, every screened message writes a `safety_events` row (`passed_lakera_unavailable`). Unchanged and recorded for 44-04/46.
3. The pg e2e needs a non-SSL URL (`sslmode=disable`) on a local no-SSL cluster; CI's postgres:16 service may need the same.
4. Carry-forward to 44-04: keyword (STOP/START/HELP) hook and early dedupe; re-run both characterization files after.

_Verified: 2026-10-14. Verifier: Claude (rrr-verifier)_
