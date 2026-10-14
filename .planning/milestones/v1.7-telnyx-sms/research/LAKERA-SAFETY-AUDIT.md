# Lakera / Safety log code audit (2026-10-13, read-only, pre-plan for Phase 43)

Trigger: Ridhi cannot move Lakera-flagged mail to her Inbox from the Workspace Safety Screening Log (`/ops/safety`). Raj: "fix the lakera first" (D30). `apps/parrot` and `apps/app/src/safety` are identical to main d1658aa = live Worker 77f32645, so the line numbers below match production.

## 1. Safety log rows: data, source, access
- Row fields: id, channel, action, reason, score, sender_last4, preview, employee_id, reviewed, reviewed_at, created_at (`apps/parrot/workers/routes/ops-safety.ts:28-40`, UI `app/routes/ops.safety.tsx:16-28`). There is no email id, Message-ID or mailbox id. `sender_last4` is usually ".com"; `preview` is the first 80 chars of the HTML body.
- **Broken contract:** the Worker sends `source_id: originalMessageId ?? messageId` (`workers/lib/inbound-email.ts:291`), but the table has no `source_id` column (`apps/app/db/migrations/0009_v1_3_safety_events.sql:10-40`). The insert drops it (`apps/app/src/server.mjs:1216-1229`), and the read (`:1242-1247`, last 100 rows / 7 days) does not return it. The Phase 23-02 "canonical link" comment is false in production.
- `employee_id` is the internal workspace employee id (`inbound-email.ts:70-76,285`). Mailboxes are keyed by Clerk id (`inbound-email.ts:183-185`, `lib/mailbox.ts:61-67`). They are bridged by `getEmployeeById` (`durableObject/workspace.ts:175`).
- The Worker proxies the student app's `/internal/safety-events` with a Bearer secret and falls back to empty on failure (`ops-safety.ts:44-62`).
- Access: the list and "Mark all reviewed" are operator-only (`ops-safety.ts:68,111`; gate `lib/operator.ts:126-155`; `ridhi@internjobs.ai` is a built-in operator at `:20`). The badge count is available to any employee (`ops-safety.ts:97`). The nav link shows only for operators (`WorkspaceShell.tsx:58-62,359`). The log is workspace-wide (all employees plus student SMS rows).

## 2. Quarantine path
- Hard block (`flagged===true || score>=0.8`, `inbound-email.ts:246`) → `Folders.SPAM` (`:327`). The email is stored with `id` = a fresh UUID (`:132,365`) and `message_id` = the RFC Message-ID (`:377`).
- Folders are in `shared/folders.ts:5-12` (`"inbox"`, `"spam"`, …); UI and Worker agree.
- `moveEmail(id, folder)` (`durableObject/index.ts:503-528`) works by internal UUID only. Nothing looks emails up by `message_id`, and there is no index on it (`migrations.ts:92`).
- The existing `POST /api/inbox/messages/:id/move` (`workers/index.ts:524-538`) and `/:id/trust-sender` (`:575-590`) only act on the caller's own mailbox (`requireEmployeeMailbox`).
- Moving Spam → Inbox does not re-run to-do extraction (that happens only in `createEmail` for Inbox, `index.ts:740`); trust-sender behaves the same way.
- Spam purge runs at 30 days from receipt (`spam-purge.ts:32`, `index.ts:571-582`). The log shows only 7 days.

## 3. Edge cases
- Rows from before 2026-10-09 (Worker 69c90a82 from 07-20 lacked Phase 36): the email was dropped, so no mailbox copy exists. With the 7-day window, rows from roughly 10-06 to 10-09 are still visible. The UI must show "not found", not an error.
- SMS rows (student app, `server.mjs:736-747,919,1096`): no employee_id or source_id, so no button.
- Soft flags (not `blocked`): the email is already in the Inbox, so show no button or "already in Inbox".
- Already moved, trusted or purged: treat as a successful no-op.
- Another employee's mail: an operator writing into a different employee's mailbox is a new privilege. It needs Raj's sign-off plus an audit log of actor and target.

## 4. Test harness
- Workspace: Vitest (Node) via `apps/parrot/vitest.config.ts`, `cloudflare:workers` mocked in `workers/tests/__mocks__/cloudflare-workers.ts`. Run `cd apps/parrot && npm test`; CI runs it (`.github/workflows/ci.yml:66-82`). `inbound-email.test.ts` mocks the mailbox store (`:47-72`), which is a good pattern. `routes/ops-safety.test.ts` and `routes/inbox-actions.test.ts` are smoke-only.
- Student app: `node --test`. Only `test:auth` is wired (`apps/app/package.json:13`). No tests for `/internal/safety-events`. `screen.test.mjs` is not in CI (v1.5 gap 6). CI runs only `build:app` for apps/app (`ci.yml:61-62`).

## 5. Loose ends found
- The `source_id` contract is broken (above).
- `REASON_LABELS` lacks `lakera_flagged`, the only reason production emits (`ops-safety.ts:20-26` vs `lib/safety.ts:132`), so the raw code is shown.
- "Mark all reviewed" marks all rows in the UI (`ops.safety.tsx:62-70`), but the server only updates the last 24 h (`server.mjs:1296-1302`). Older rows reappear as unreviewed after a reload.
- `ops-safety.test.ts:14` comment cites a nonexistent `getUnreviewedCount`.
- `SYSTEM_FOLDER_IDS` omits spam and is unused (36-VERIFICATION:124). There is no way to revoke a trusted sender (36-VERIFICATION:141).
- The v1.5.1 Trust-sender end-to-end check is still `human_needed`.

## 6. Deploy constraints
- The Workspace Worker deploy is a full replace and must come from main-based code (live 77f32645 = d1658aa).
- `scripts/verify-workspace-quarantine-live.mjs` (+10 tests) exists only on unmerged `origin/docs/patch-v1.5.1-workspace-deploy`.
- The apps/app (Fly) change must deploy first, and the Worker must tolerate a missing `source_id`. Per v1.6, apps/app is slated to move to the private platform repo.

## Recommended minimal design
1. apps/app: migration `0010`, a nullable `source_id text` + index; store it in the insert and return it in the read; add `node --test` coverage.
2. Mailbox store: `findEmailByMessageId(sourceId)` (`message_id = ? OR id = ?`) → {id, folder}. Optional heuristic finder (Spam, preview prefix, date window) for rows logged before the fix.
3. Worker: `POST /api/ops/safety/:eventId/move-to-inbox`, operator-only. It resolves row → employee → Clerk id → mailbox → email, moves only from Spam, returns `moved | already_in_inbox | not_found`, marks the row reviewed, and logs actor and target. It does NOT trust the sender.
4. UI: a per-row "Move to Inbox" button for blocked email rows only; distinct toasts; add the `lakera_flagged` label.
5. Tests first: lookup unit test; `workers/tests/routes/ops-safety-move.test.ts` (operator 403, SMS 400, not_found, already_in_inbox, moved); apps/app handler test.

Risks: the cross-mailbox operator write (sign-off); deploy ordering; heuristic mis-match (require a unique match or skip); the mailbox store is mocked everywhere (live readback needed); a deploy not based on main regresses prod.
