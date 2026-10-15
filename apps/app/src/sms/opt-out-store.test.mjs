// v1.7 Phase 44-02 (OPT-01 storage half): sms_opt_outs store.
// Run: node --test apps/app/src/sms/opt-out-store.test.mjs
//
// The same case list (runCases) runs against the in-memory store (always) and
// against createPgOptOutStore on a real Postgres (gated on TEST_DATABASE_URL),
// where the REAL migration file 0016 is applied twice into a throwaway schema.
// A third block proves every createStore() instance exposes store.optOuts.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createMemoryOptOutStore, createPgOptOutStore } from "./opt-out-store.mjs";
import { createStore } from "../store.mjs";

const A = "+15555550123";
const B = "+15555550124";

/**
 * @param {() => object} makeStore   returns a fresh-ish store (state may be shared; each case uses its own number)
 * @param {object} [hooks]           { count(phone) -> rows for phone, row(phone) -> row or null } (Postgres only)
 */
function runCases(makeStore, hooks = {}) {
  test("STOP -> isOptedOut true; a different number stays false", async () => {
    const s = makeStore();
    assert.deepEqual(await s.recordOptOut({ phone: A, keyword: "stop", source: "sms_keyword" }), { ok: true });
    assert.equal(await s.isOptedOut(A), true);
    assert.equal(await s.isOptedOut(B), false);
  });

  test("format variants of the same number hit one row", async () => {
    const s = makeStore();
    const phone = "+15555550130";
    await s.recordOptOut({ phone: "5555550130", keyword: "stop" });
    await s.recordOptOut({ phone: "(555) 555-0130", keyword: "stop" });
    assert.equal(await s.isOptedOut(phone), true);
    assert.equal(await s.isOptedOut("1-555-555-0130"), true);
    if (hooks.count) assert.equal(await hooks.count(phone), 1);
  });

  test("clear -> false; opt out again -> true with restored_at back to null", async () => {
    const s = makeStore();
    const phone = "+15555550131";
    await s.recordOptOut({ phone, keyword: "stop" });
    assert.deepEqual(await s.clearOptOut({ phone }), { ok: true });
    assert.equal(await s.isOptedOut(phone), false);
    if (hooks.row) assert.notEqual((await hooks.row(phone)).restored_at, null);
    await s.recordOptOut({ phone, keyword: "quit" });
    assert.equal(await s.isOptedOut(phone), true);
    if (hooks.row) assert.equal((await hooks.row(phone)).restored_at, null);
  });

  test("clearOptOut on a never-seen number is a no-op that returns {ok:true}", async () => {
    const s = makeStore();
    assert.deepEqual(await s.clearOptOut({ phone: "+15555550132" }), { ok: true });
    assert.equal(await s.isOptedOut("+15555550132"), false);
    if (hooks.count) assert.equal(await hooks.count("+15555550132"), 0);
  });

  test("recordOptOut records keyword and source", async () => {
    const s = makeStore();
    const phone = "+15555550133";
    await s.recordOptOut({ phone, keyword: "unsubscribe", source: "telnyx_40300" });
    const row = hooks.row ? await hooks.row(phone) : s._row(phone);
    assert.equal(row.keyword, "unsubscribe");
    assert.equal(row.source, "telnyx_40300");
    // default source
    await s.recordOptOut({ phone: "+15555550134", keyword: "stop" });
    const row2 = hooks.row ? await hooks.row("+15555550134") : s._row("+15555550134");
    assert.equal(row2.source, "sms_keyword");
  });

  test("invalid phone: recordOptOut -> {ok:false, reason:'invalid_phone'}, isOptedOut -> false, no throw", async () => {
    const s = makeStore();
    for (const bad of ["student@example.com", "12345", "", null, undefined, "chat;-;+1555"]) {
      assert.deepEqual(await s.recordOptOut({ phone: bad, keyword: "stop" }), { ok: false, reason: "invalid_phone" });
      assert.equal(await s.isOptedOut(bad), false);
      assert.deepEqual(await s.clearOptOut({ phone: bad }), { ok: false, reason: "invalid_phone" });
    }
  });

  test("recordOptOut twice does not throw and refreshes opted_out_at", async () => {
    const s = makeStore();
    const phone = "+15555550135";
    await s.recordOptOut({ phone, keyword: "stop" });
    const first = hooks.row ? await hooks.row(phone) : s._row(phone);
    await new Promise((r) => setTimeout(r, 15));
    await s.recordOptOut({ phone, keyword: "stop" });
    const second = hooks.row ? await hooks.row(phone) : s._row(phone);
    assert.ok(new Date(second.opted_out_at).getTime() > new Date(first.opted_out_at).getTime());
    assert.equal(await s.isOptedOut(phone), true);
  });
}

describe("memory store", () => {
  runCases(() => createMemoryOptOutStore());
});

const DB_URL = process.env.TEST_DATABASE_URL;

describe("sms_opt_outs (real Postgres)", { skip: !DB_URL }, () => {
  const schema = `t44_${randomBytes(4).toString("hex")}`;
  let admin;
  let pool;
  let store;

  // Same ssl rule as scripts/migrate.mjs.
  const sslFor = (url) => (url.includes("sslmode=disable") ? false : { rejectUnauthorized: false });

  before(async () => {
    const pg = (await import("pg")).default;
    admin = new pg.Pool({ connectionString: DB_URL, ssl: sslFor(DB_URL), max: 1 });
    await admin.query(`create schema ${schema}`);
    pool = new pg.Pool({ connectionString: DB_URL, ssl: sslFor(DB_URL), options: `-c search_path=${schema}` });
    // Apply the REAL migration file twice (idempotency).
    const sql = await readFile(new URL("../../db/migrations/0016_v1_7_sms_opt_outs.sql", import.meta.url), "utf8");
    await pool.query(sql);
    await pool.query(sql);
    store = createPgOptOutStore(pool);
  });

  after(async () => {
    await pool?.end();
    await admin?.query(`drop schema if exists ${schema} cascade`);
    await admin?.end();
  });

  runCases(() => store, {
    count: async (phone) => Number((await pool.query("select count(*)::int as n from sms_opt_outs where phone = $1", [phone])).rows[0].n),
    row: async (phone) => (await pool.query("select * from sms_opt_outs where phone = $1", [phone])).rows[0] || null,
  });

  test("table holds exactly one row per E.164 number overall", async () => {
    const { rows } = await pool.query("select phone, count(*)::int as n from sms_opt_outs group by phone having count(*) > 1");
    assert.deepEqual(rows, []);
  });
});

describe("createStore exposes optOuts", () => {
  const check = (store) => {
    assert.ok(store.optOuts, "store.optOuts missing");
    for (const fn of ["recordOptOut", "clearOptOut", "isOptedOut"]) {
      assert.equal(typeof store.optOuts[fn], "function", `store.optOuts.${fn} is not a function`);
    }
  };

  test("MemoryStore (databaseUrl '')", () => {
    check(createStore({ databaseUrl: "" }));
  });

  test("PostgresStore (postgres:// URL; constructing a Pool does not connect)", async () => {
    const store = createStore({ databaseUrl: "postgres://u:p@127.0.0.1:1/x?sslmode=disable" });
    try {
      check(store);
    } finally {
      await store.pool.end();
    }
  });
});
