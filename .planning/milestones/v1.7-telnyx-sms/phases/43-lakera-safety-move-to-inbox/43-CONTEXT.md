# Phase 43 Context: Lakera Safety log — Move to Inbox

## Locked decisions
- D30: this phase goes first in v1.7 (Raj: "fix the lakera first").
- D31: operators (built-in operator list includes ridhi@internjobs.ai) may move ANY employee's quarantined email from that employee's Spam to that employee's Inbox. Audit-log every move (actor, target employee id, safety event id, outcome). Never auto-trust the sender.
- D32: rows without `source_id` (logged before the fix) use a best-effort match: Spam folder, body/preview prefix equal to the row `preview`, received within a time window around `created_at`. Move ONLY on exactly one match; else return `not_found` / `ambiguous` with the UI message "not found — check Spam".

## Spec and research
- Spec: `.planning/milestones/v1.7-telnyx-sms/REQUIREMENTS.md` LAK-01..LAK-05.
- Research (pre-plan code audit with file:line): `.planning/milestones/v1.7-telnyx-sms/research/LAKERA-SAFETY-AUDIT.md`. Read it fully; it has the recommended design, edge cases and test harness.

## Constraints
- TDD-first per task: failing tests (with negative controls) → RED recorded → implement → GREEN recorded → refactor. Each must_have names the test that proves it. SUMMARY must show RED before GREEN.
- **Code branch:** cut from `main` (d1658aa = live Workspace 77f32645). Workspace Worker deploys are FULL REPLACE, so deploy only from main-based code. Planning docs stay on `docs/v1.7-telnyx-sms`. Name the code branch `fix/v1.7-43-safety-move-to-inbox`.
- **Two deploy units, in order:** (1) student app on Fly (`apps/app`: migration adding nullable `source_id` + index; store on insert; return on read); (2) Workspace Worker (`apps/parrot`). The Worker must tolerate rows without `source_id`.
- **Live steps** (DB migration on prod, Fly deploy, `wrangler deploy` of internjobs-parrot, production UAT) are separate approval-gated executor tasks. Each has a readback that fails before and passes after, plus a recorded rollback target (Fly release / Worker version 77f32645). D10: merging to main or deploying from it needs Raj's recorded exception; the executor stops and reports.
- Reuse the existing live readback `scripts/verify-workspace-quarantine-live.mjs` from `origin/docs/patch-v1.5.1-workspace-deploy` (bring it onto the code branch, or extend it to check for the Move-to-Inbox control in the live bundle).
- Workspace tests: Vitest (`cd apps/parrot && npm test`, in CI). Student app tests: `node --test`; add a package script and wire `apps/app/src/safety/screen.test.mjs` plus new tests into CI (LAK-04).
- Never print secrets. Never send real email to third parties in tests.
- Raj action in LAK-05: confirm the Lakera tier/quota in the Lakera dashboard (LAKERA-V2-03), recorded as a checkpoint, not blocking code.
