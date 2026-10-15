// v1.7 Phase 44-02 (OPT-01 storage half): per-number SMS opt-out state.
//
// A number is opted out iff it has a row with restored_at null (see
// db/migrations/0016_v1_7_sms_opt_outs.sql). Every entry point normalises to
// E.164 first, so "5555550123", "(555) 555-0123" and "+15555550123" are the
// same number. Unparseable input (e-mail, chat GUID, short code) never
// throws: writes return { ok:false, reason:"invalid_phone" } and reads
// return false.
//
// The Telnyx provider's sendSms guard (./telnyx.mjs) reads isOptedOut;
// inbound STOP/START handling (plan 44-04) writes recordOptOut/clearOptOut.

import { toE164 } from "./shared.mjs";

const INVALID = Object.freeze({ ok: false, reason: "invalid_phone" });
const DEFAULT_SOURCE = "sms_keyword";

export function createPgOptOutStore(pool) {
  return {
    async recordOptOut({ phone, keyword = null, source = DEFAULT_SOURCE } = {}) {
      const e164 = toE164(phone);
      if (!e164) return { ...INVALID };
      await pool.query(
        `insert into sms_opt_outs (phone, opted_out_at, restored_at, keyword, source, updated_at)
         values ($1, now(), null, $2, $3, now())
         on conflict (phone) do update set
           opted_out_at = now(),
           restored_at = null,
           keyword = excluded.keyword,
           source = excluded.source,
           updated_at = now()`,
        [e164, keyword ?? null, source || DEFAULT_SOURCE],
      );
      return { ok: true };
    },
    async clearOptOut({ phone } = {}) {
      const e164 = toE164(phone);
      if (!e164) return { ...INVALID };
      await pool.query(
        "update sms_opt_outs set restored_at = now(), updated_at = now() where phone = $1 and restored_at is null",
        [e164],
      );
      return { ok: true };
    },
    async isOptedOut(phone) {
      const e164 = toE164(phone);
      if (!e164) return false;
      const { rows } = await pool.query(
        "select 1 from sms_opt_outs where phone = $1 and restored_at is null limit 1",
        [e164],
      );
      return rows.length > 0;
    },
  };
}

export function createMemoryOptOutStore() {
  const rows = new Map();
  return {
    async recordOptOut({ phone, keyword = null, source = DEFAULT_SOURCE } = {}) {
      const e164 = toE164(phone);
      if (!e164) return { ...INVALID };
      const now = new Date().toISOString();
      rows.set(e164, {
        phone: e164,
        opted_out_at: now,
        restored_at: null,
        keyword: keyword ?? null,
        source: source || DEFAULT_SOURCE,
        updated_at: now,
      });
      return { ok: true };
    },
    async clearOptOut({ phone } = {}) {
      const e164 = toE164(phone);
      if (!e164) return { ...INVALID };
      const row = rows.get(e164);
      if (row && row.restored_at === null) {
        const now = new Date().toISOString();
        row.restored_at = now;
        row.updated_at = now;
      }
      return { ok: true };
    },
    async isOptedOut(phone) {
      const e164 = toE164(phone);
      if (!e164) return false;
      const row = rows.get(e164);
      return Boolean(row && row.restored_at === null);
    },
    // Test/inspection helper: a copy of the stored row (mirrors the table columns).
    _row(phone) {
      const row = rows.get(toE164(phone));
      return row ? { ...row } : null;
    },
  };
}
