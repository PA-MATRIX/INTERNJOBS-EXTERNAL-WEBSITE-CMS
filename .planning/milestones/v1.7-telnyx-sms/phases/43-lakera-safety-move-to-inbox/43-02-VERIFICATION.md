---
phase: 43-lakera-safety-move-to-inbox
plan: 02
verified: 2026-10-13T00:00:00Z
status: passed
score: 8/8 must-haves verified
gaps: []
---

# Plan 43-02 Verification Report (Operator Move to Inbox, server)

**Goal:** Operator-only route moving a Lakera-quarantined email from the owning employee's Spam to Inbox, audited, no auto-trust (D31), unique-match heuristic (D32), `lakera_flagged` label (LAK-01 server, LAK-03, LAK-04 label).
**Status:** passed. **Re-verification:** No.

## Architectural Context Loaded

- Locked source: 43-CONTEXT.md D31 (operator-only, audit line with actor+target, never trustSender) and D32 (heuristic moves only on exactly one match). Both honoured (below).
- No NORTH-STAR.md rule contradicted. Global CLAUDE.md TDD rule applied (RED before GREEN).

## Observable Truths (checked against code, not SUMMARY)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Non-operator 403, nothing touched | VERIFIED | `requireOperator` on `POST /:eventId/move-to-inbox` (ops-safety.ts). Negative control re-run: removing it fails "non-operator gets 403" and "unauthenticated gets 401" (2 failed, 14 passed). |
| 2 | Exact move; moveEmail(id,'inbox'); no trustSender; mark-reviewed with reviewed_by=operator | VERIFIED | safety-move.ts moves via `stub.moveEmail(loc.id, Folders.INBOX)`; route posts `{ids:[eventId], reviewed_by: actorEmail}`; test passes. |
| 3 | One audit line per outcome, no preview/sender | VERIFIED | `audit()` logs event, actor_email, actor_id, target_employee_id, safety_event_id, outcome, match; no preview or sender fields. Called on every path. Test passes. |
| 4 | SMS -> 400 not_email; flagged -> 400 not_quarantined | VERIFIED | Route checks channel then action before any mailbox access. |
| 5 | already_in_inbox no-op marks reviewed; Trash -> elsewhere, no move, no mark | VERIFIED | safety-move.ts and route switch (elsewhere returns without mark-reviewed). |
| 6 | D32: one candidate moves, 0 -> 404, 2 -> 409, source_id present + miss never hits heuristic | VERIFIED | safety-move.ts branches on `row.source_id`; exact miss returns not_found directly. |
| 7 | List adds can_move_to_inbox + label, hides source_id | VERIFIED | List handler destructures `source_id` out; `lakera_flagged` in REASON_LABELS; `canMoveToInbox` = email+blocked+employee_id. |
| 8 | Lookup SQL runs against the real emails/folders schema | VERIFIED | mailbox-lookup.test.ts builds from `employeeMailboxMigrations[0].sql` in node:sqlite. Negative control re-run: dropping `folder_id = 'spam'` fails "Inbox copy is not a candidate" (1 failed, 12 passed). Preview matched in JS startsWith (literal %, surrogate-safe). |

## Checks requested

- **Full parrot suite (coverage gap closed):** all 27 test files run in 9 batches of 3 (local-suite-guard respected). All 27 PASS (files: csp-header, healthz, lib/{chat-realtime, embed-jwt, inbound-email, mailbox-lookup, mattermost-channels, mattermost-dms, mattermost-mention, mattermost-pat, mattermost-search-reactions, operator-contact, parrot-embed, safety-move, safety, spam-purge}, routes/{admin-employees, agent, chat-channels, chat-token, chat-ws, embed-token, inbox-actions, oidc, ops-safety-move, ops-safety, reply-forward}). Includes the route smoke tests that import workers/index.ts. No failures, no regressions.
- **Typecheck:** `npm run typecheck` rc=0, 0 `error TS`. **Build:** `npm run build` succeeded ("built in 2.22s").
- **RED before GREEN:** commit order 0d108d2 (tests, 22:45:18) -> 3d27e00 (feat) -> ca9282a (tests, 22:47:32) -> 8c6b66e (feat). Test commits touch no implementation files. Evidence: red-lookup = module-missing, "no tests"; red-route = 16/16 route tests failed, 2 files failed (timestamps 22:45:14 and 22:47:28 precede the feat commits).
- **Negative controls:** two re-applied by me (above); each restored via `git checkout`; `git status` clean (0 entries) afterwards, and the two files pass again (29/29).
- **grep trustSender** in safety-move.ts and ops-safety.ts: no match (rc=1). The only mention in safety-move.ts is a comment that avoids the identifier.
- **requireOperator** applied on the move route. **source_id** removed from list response; the move route reads it server-side only and responses carry no email id, subject or body.
- **vitest.config.ts change:** scoped to `test.poolOptions.{forks,threads}.execArgv` only (vitest runtime); no wrangler/build/vite config touched. Justified by the node:sqlite real-schema tests, anticipated by plan Task 1 and listed in files_modified.
- **Scope:** `git diff --stat eab1d07 HEAD` shows exactly the 9 files_modified; no extras.

## Security pass (Pass 1)

No SQL interpolation of user data (the only template value is a constant `SCAN_LIMIT`; all inputs are bound params). No shell/eval, no LLM output to DB, no SSRF. Cross-mailbox write is gated by requireOperator and audited. No findings.

## Human verification / advisories (non-blocking)

- Playwright/visual: none in this plan (no UI); owned by 43-05 UAT.
- Real Durable Object SQL (`ctx.storage.sql.exec` wrapper) is not exercised locally; 43-05 live UAT is the proof.
- CI Node version: workflows use node 22; `--experimental-sqlite` is a no-op on 22.13+, and node:sqlite needs 22.5+. Confirm when 43-04 pushes (CI parrot job exists at ci.yml:96).
- Route re-fetches the 7-day/100-row list to find the row; older events return event_not_found (documented decision, matches UI).

---
_Verified: 2026-10-13_
_Verifier: Claude (rrr-verifier)_
