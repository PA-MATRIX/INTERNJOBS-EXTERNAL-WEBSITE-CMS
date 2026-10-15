---
phase: 43-lakera-safety-move-to-inbox
verified: 2026-10-14T00:00:00Z
status: human_needed
score: 3/3 success criteria verified by code and live readback; LAK-01..04 satisfied, LAK-05 partial (two human items)
re_verification: false
gaps: []
human_verification:
  - test: "Raj reports the Lakera plan/tier and monthly quota (LAKERA-V2-03)"
    expected: "Tier and quota recorded in REQUIREMENTS/CONTEXT; LAK-05 can then be ticked for that clause"
    why_human: "Vendor account fact only Raj can read; not in the repo or production"
  - test: "Trust-sender UAT with a throwaway sender in production Workspace (closes v1.5.1 human_needed)"
    expected: "Trust sender moves a Spam message to Inbox and whitelists the sender"
    why_human: "Interactive UI action in production; no automated or durable-state evidence exists"
  - test: "Optional, non-blocking: on the next real Lakera-flagged email, confirm the new row carries source_id and an ops_safety_move_to_inbox audit line appears in a live wrangler tail"
    expected: "Exact-match path used; one audit line with actor, target, outcome=moved, match=exact"
    why_human: "Needs a new real flagged email and a live tail session; none existed after deploy"
---

# Phase 43: Lakera safety move to Inbox Verification Report

**Phase Goal:** An operator can recover a Lakera-quarantined email from the Safety Screening Log into the owning employee's Inbox, with the Message-ID link repaired end to end.
**Status:** human_needed (automated and live checks pass; LAK-05 has two items only a human can close)
**Re-verification:** No (initial phase-level verification; 43-01..04 each passed earlier; 43-05 verified here for the first time)

## Architectural Context Loaded

- No `.planning/NORTH-STAR.md` in this repo.
- Global CLAUDE.md (RRR): live production actions run as executor tasks with approval recorded first; TDD with RED before GREEN; each executed plan gets a verifier pass.
- Phase CONTEXT D31 (sender never auto-trusted on move) and D32 (best-effort match only on exactly one hit) are honoured by the route code. D33 (D10 exception: merge PR #29 to main) is a recorded operator decision, intentional, not a gap.

## Goal Achievement: Success criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Move to Inbox moves a blocked email Spam to Inbox, audit entry, no button on SMS | VERIFIED | Route `POST /:eventId/move-to-inbox` on origin/main (`apps/parrot/workers/routes/ops-safety.ts`): rejects non-email (400 not_email) and non-blocked; emits `ops_safety_move_to_inbox` audit line (actor, target, event id, outcome); marks reviewed with actor email only for `moved`/`already_in_inbox`. Served chunk readback `--require-move-control` GREEN now (re-run by me). 5 real production moves by ridhi@ (below). |
| 2 | New events carry source_id to the API; old rows match uniquely or "not found" | VERIFIED (tests + synthetic round trip) | Migration 0015 applied in prod (column count 0 -> 1); A5 synthetic row round-trips source_id through GET (LIVE-43 step 5); D32 best-effort path used by Ridhi's pre-fix rows (all `source_id` null). Exact-match path on a real post-fix email is unobserved (no new flag since deploy). |
| 3 | Deploy order student app then Worker from main code; readback GREEN; UAT recorded | VERIFIED | See below. UAT recorded (UAT-43.md), with stated limits. |

## Reality checks (done by me, not taken from SUMMARY)

- **Merge:** `git cat-file -p 951e103` shows parents d1658aa5 and 7f3b948c; `git merge-base --is-ancestor 951e103 origin/main` true. Deployed paths (ops-safety.ts, events-api.mjs, migration 0015, SafetyMoveCell, verify script) exist on origin/main.
- **Approval before live commands:** APPROVAL-43.md timestamp 2026-10-14T04:32:56Z (commit c0d58fc, 23:32:56 -0500) precedes the first live-log commit 1c52643 (23:34:49 -0500), the merge log 0c2858d (23:45:38) and the first live entry 04:33:24Z. Approval lines: A1-A5 `yes`, A6-fly/A6-worker `no`. LIVE-43.md shows each step guarded by `grep -qx "A<n>: yes"` (A1 merge, A3 Fly, A2 migration, A5 synthetic, A4 Worker) in the planned order Fly -> migration -> Worker; rollback guards not triggered, consistent with `no`.
- **Deploy sha:** LIVE-43 records `git rev-parse HEAD` == 951e103 for both deploys from a detached clean worktree.
- **Live state now:** `wrangler deployments list` newest = f7f6c851-1ee5-451e-9512-81f6ed90be23 at 100%; `fly releases` v58 latest, complete; `verify-workspace-quarantine-live.mjs --require-move-control` exit 0 GREEN (run from worktree wt-43); same script without flag GREEN.
- **RED before GREEN:** LIVE-43/SUMMARY before/after table shows `--require-move-control` exit 1 (missing label + endpoint) before the Worker deploy, exit 0 after; column count 0 -> 1; API source_id key absent -> present.
- **UAT inference checked against code and prod rows:** The route calls mark-reviewed with the actor's email only in the `moved` and `already_in_inbox` cases (Worker). The bulk mark-all is a single `update ... set reviewed_at = now()` statement, so it yields one identical timestamp for all rows (events-api.mjs). I re-read production (read-only SELECT, no secrets): five `ridhi@internjobs.ai` rows with five DISTINCT reviewed_at values 03:58:14.905, :16.014, :16.753, :17.452, :18.857 on 2026-10-15 UTC, all email/blocked/lakera_flagged, source_id null. Control: earlier mark-all batches in the same table (06-15, 09-23, 10-08) show identical timestamps per batch. Distinct timestamps therefore indicate separate per-row calls, and the UI's only per-row action is Move to Inbox. The inference holds. Residual limits: it cannot tell `moved` from `already_in_inbox`, and it does not show the mail is physically in Inbox (the Worker only marks reviewed on those two outcomes, so success is implied by code). Note that the data's 2026-10-15 date is later than this verifier's clock date of 2026-10-14; this is a clock/timezone oddity in the records, not a contradiction of the evidence.
- **Secrets:** none printed in my checks.

## Requirements coverage

| Req | Status | Note |
|-----|--------|------|
| LAK-01 | SATISFIED | Code verified (43-02/03), live control present, 5 production moves. Audit line itself not captured live, but the code emits it and reviewed_by on the row is durable proof of a successful move. |
| LAK-02 | SATISFIED | Column present in prod; synthetic round trip proves Worker->API->table->API shape end to end for the API leg; real-email leg proven by tests only. |
| LAK-03 | SATISFIED | Best-effort path exercised by Ridhi's 5 pre-fix rows; "Not found - check Spam" path not exercised in prod (covered by 43-02 tests). |
| LAK-04 | SATISFIED | Tests in 43-01/03; app-tests CI job present. |
| LAK-05 | PARTIAL (human_needed) | Readback GREEN (met), Move-to-Inbox UAT recorded (met). NOT met: Trust-sender UAT (unevidenced; text of LAK-05 names it and says it closes the v1.5.1 human_needed item) and Lakera tier/quota confirmation by Raj. Correctly left unticked in REQUIREMENTS.md. |

## Honest gaps and their effect

| Gap | Requirement | Effect on status |
|-----|-------------|------------------|
| Audit log line not captured (tail expired) | LAK-01 | Not blocking. Code path and DB state corroborate; optional follow-up item above. |
| No post-fix real flagged email yet | LAK-02 | Not blocking. Exact-match path covered by tests and synthetic API round trip. |
| Lakera tier/quota pending | LAK-05 | Human item, blocks ticking LAK-05. |
| Trust-sender UAT unevidenced | LAK-05 | Human item. The plan called it a non-blocking bonus, but LAK-05's own text names it, so it holds LAK-05 open; it is not a code gap. |

No code gaps found, so `gaps_found` does not apply. Because LAK-05 cannot be fully satisfied without human input, the status is `human_needed`, not `passed`. LAK-01..04 and success criteria 1-3 are met; phase goal (operator recovery with repaired link) is achieved in production.

## Anti-patterns and security pass

Phase-modified files (21 paths in the merge diff) not re-scanned line by line here; per-plan verifications 43-01..04 passed and the new route checks operator role (`requireOperator`), validates channel/action, and logs no preview/sender text. Observed: the cross-employee mailbox open is intentional per D31. SQL in events-api uses parameters (`$1/$2`); the interpolated `VISIBLE_WINDOW` is a module constant, not user input. Security Pass: no Pass 1 issues found. Pass 2 not run.

Other notes: no CI run exists on main after the merge (ci.yml triggers on PRs and integration/** only); PR CI ran against the same base, so tested tree equals 951e103. One synthetic `v1.7-43-readback` row remains in production by approval A5. Infisical CLI is on the wrong org (403); Raj should switch before the next live plan.

---
_Verified: 2026-10-14_
_Verifier: Claude (rrr-verifier)_
