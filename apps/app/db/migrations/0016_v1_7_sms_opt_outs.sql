-- migration: 0016_v1_7_sms_opt_outs
-- description: sms_opt_outs table (OPT-01, v1.7 Phase 44)
--
-- The app's own record of numbers that texted STOP (and the Telnyx 40300
-- "recipient opted out" send error). Keyed by the E.164 number, so every
-- format a number arrives in maps to one row.
--
-- Semantics: a number is opted out iff a row exists AND restored_at is null.
-- START sets restored_at; a later STOP resets it to null and refreshes
-- opted_out_at. Rows are never deleted (audit trail).
--
-- No foreign keys: opt-outs apply to numbers that are not students
-- (unknown senders), and must survive a student row being removed.
-- Idempotent (if not exists) so re-running is a no-op.

create table if not exists sms_opt_outs (
  phone text primary key,
  opted_out_at timestamptz not null default now(),
  restored_at timestamptz,
  keyword text,
  source text not null default 'sms_keyword',
  updated_at timestamptz not null default now()
);
