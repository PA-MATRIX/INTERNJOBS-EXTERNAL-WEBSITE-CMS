// v1.7 Phase 44-05 (PAIR-01): claimPairingCode defaults to channel type "sms".
//
// Run: node --test src/onboarding/pairing.test.mjs (from apps/app)
//
// The pool is a scripted fake: pool.connect() returns a client whose query()
// answers by SQL text and records every call. No database.
//
// Negative control: changing the default in claimPairingCode back to
// "imessage" makes 'default channel type is sms' fail. The expired-session and
// phone_already_bound cases pin existing behaviour so the default change
// cannot loosen the claim rules (PAIR-02, non-E.164 addresses, is Phase 45).

import { test } from "node:test";
import assert from "node:assert/strict";
import { claimPairingCode } from "./pairing.mjs";

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const CODE = "START-AB12CD";
const PHONE = "+15555550123";

function scriptedPool({ session = {}, student = {} } = {}) {
  const calls = [];
  const sessionRow = {
    code: CODE,
    student_id: STUDENT_ID,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    claimed_at: null,
    ...session,
  };
  const studentRow = {
    id: STUDENT_ID,
    linkedin_profile_url: "https://www.linkedin.com/in/test-student",
    channel_address: null,
    channel_confirmed_at: null,
    ...student,
  };
  const client = {
    async query(sql, params) {
      const text = String(sql).trim().toLowerCase();
      calls.push({ sql: text, params });
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };
      if (text.startsWith("select") && text.includes("from pairing_sessions")) return { rows: [sessionRow] };
      if (text.startsWith("select") && text.includes("from students")) return { rows: [studentRow] };
      return { rows: [], rowCount: 1 };
    },
    release() {
      calls.push({ sql: "release" });
    },
  };
  return {
    calls,
    async connect() {
      return client;
    },
    async query() {
      throw new Error("claimPairingCode must use a client from pool.connect()");
    },
  };
}

const studentUpdates = (pool) => pool.calls.filter((c) => c.sql.startsWith("update students"));

test("default channel type is sms", async () => {
  const pool = scriptedPool();
  const result = await claimPairingCode(pool, CODE, PHONE);
  assert.deepEqual(result, { ok: true, studentId: STUDENT_ID });
  const updates = studentUpdates(pool);
  assert.equal(updates.length, 1, "exactly one students update");
  assert.deepEqual(updates[0].params, [STUDENT_ID, "sms", PHONE]);
  assert.ok(pool.calls.some((c) => c.sql === "commit"), "claim commits");
});

test("explicit channelType imessage is still recorded (mac-bridge route behaviour)", async () => {
  const pool = scriptedPool();
  const result = await claimPairingCode(pool, CODE, PHONE, { channelType: "imessage" });
  assert.deepEqual(result, { ok: true, studentId: STUDENT_ID });
  const updates = studentUpdates(pool);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].params, [STUDENT_ID, "imessage", PHONE]);
});

test("expired session is code_expired and binds nothing", async () => {
  const pool = scriptedPool({ session: { expires_at: new Date(Date.now() - 60_000).toISOString() } });
  const result = await claimPairingCode(pool, CODE, PHONE);
  assert.deepEqual(result, { ok: false, reason: "code_expired" });
  assert.equal(pool.calls.filter((c) => c.sql.startsWith("update")).length, 0, "no update issued");
  assert.ok(pool.calls.some((c) => c.sql === "rollback"));
});

test("a different confirmed phone is still phone_already_bound", async () => {
  const pool = scriptedPool({
    student: { channel_address: "+15555550999", channel_confirmed_at: new Date().toISOString() },
  });
  const result = await claimPairingCode(pool, CODE, PHONE);
  assert.deepEqual(result, { ok: false, reason: "phone_already_bound" });
  assert.equal(studentUpdates(pool).length, 0, "students not updated");
  assert.equal(pool.calls.filter((c) => c.sql.startsWith("update pairing_sessions")).length, 0);
  const audit = pool.calls.find((c) => c.sql.startsWith("insert into audit_events"));
  assert.ok(audit, "rejection is audited");
  assert.deepEqual(audit.params[1], { channelType: "sms", reason: "phone_already_bound" });
});
