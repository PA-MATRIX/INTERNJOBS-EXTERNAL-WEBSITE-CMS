# 43-05 UAT record

timestamp: 2026-10-14T05:23:13Z
reply (verbatim): approved

## Observed at the time of the reply
- The filtered audit tail (evidence/43-05-tail.txt, started 2026-10-14T04:50:13Z, wrangler tail still connected, stderr empty) captured ZERO ops_safety* events. No Move to Inbox attempt (which logs on every attempt, D31) reached the Worker while the tail ran.
- No per-step pass/fail, no Lakera tier/quota, and no Ridhi result were provided.

## Status
- Raj's approval is recorded. LAK-01 live proof is pending: there is no audit line for a production move yet. Asked Raj to confirm whether he pressed Move to Inbox, and for the Lakera tier/quota (LAK-05).

## Follow-up (2026-10-15 ~04:00 UTC): Raj "Tested, it worked"; Lakera tier "I'll check and tell you"

- **Why the tail shows nothing:** the `wrangler tail` session started 2026-10-14T04:50Z had ended (process gone) before the test, so the absence of audit lines is not evidence of no press.
- **Production read-only evidence** (student DB via `fly ssh console`, no secrets printed): `safety_events` reviewed in the last day grouped by reviewer:
  - `ridhi@internjobs.ai`: 5 rows, reviewed 2026-10-15 03:58:14 → 03:58:18 UTC. All are `email/blocked/lakera_flagged`, created 2026-10-09..10-13, `source_id` null (pre-fix rows → D32 best-effort match path).
  - `v1.7-43-readback`: 1 row (the A5 synthetic row, 04:48:06 on 10-14).
- **Why this proves Move to Inbox:** in the deployed route (`apps/parrot/workers/routes/ops-safety.ts`, main 951e103, lines ~207-216), the row is marked reviewed with the operator's email ONLY for outcomes `moved` / `already_in_inbox`. "Mark all reviewed" is a single UPDATE (one timestamp for all rows), so 5 distinct timestamps across 4 s are 5 separate successful move calls by an operator (Ridhi), on her real quarantined mail — which also covers checklist item 6.
- **Not evidenced:** which of the 5 were `moved` vs `already_in_inbox`; the Trust-sender bonus; a new post-fix flag (no `source_id` row created since the deploy, so the exact-match path is proven by tests + the A5 readback only).
- **Lakera tier/quota (LAK-05, LAKERA-V2-03):** pending from Raj.
