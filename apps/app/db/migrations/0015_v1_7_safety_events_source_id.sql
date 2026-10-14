-- migration: 0015_v1_7_safety_events_source_id
-- description: source_id on safety_events (LAK-02, v1.7 Phase 43)
--
-- The Parrot Worker already sends the screened message's identifier
-- (the email Message-ID, apps/parrot/workers/lib/inbound-email.ts) as
-- source_id, but the student app dropped it. Storing it lets the
-- Workspace /ops/safety "Move to Inbox" action find the exact message.
--
-- Nullable, no default, no backfill: rows written before this migration
-- keep source_id NULL and are matched best-effort (preview + time, D32).
-- Idempotent (if not exists) so re-running is a no-op.

alter table safety_events
  add column if not exists source_id text;

create index if not exists safety_events_source_id_idx
  on safety_events (source_id)
  where source_id is not null;
