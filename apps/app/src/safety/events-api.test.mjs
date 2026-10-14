// v1.7 Phase 43-01 (LAK-02, LAK-04 student-app half): /internal/safety-events contract.
// Run: node --test apps/app/src/safety/events-api.test.mjs
//
// Unit tests drive createSafetyEventsHandler with a fake pg pool that records
// every [sql, params] pair. The real sendJson/readBody from src/http.mjs are
// used so the response shapes are the ones production emits.
//
// Integration tests (gated on TEST_DATABASE_URL) apply the REAL migration
// files 0009 and 0015 into a throwaway schema and round-trip through the
// handler against a real Postgres. CI runs them via a postgres service.

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readBody, sendJson } from "../http.mjs";
import { createSafetyEventsHandler } from "./events-api.mjs";

const SECRET = "test-internal-secret";
const BASE = "http://localhost";

// Same shape as server.mjs safeStringEqual (not exported there).
function safeStringEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// ─── fakes ──────────────────────────────────────────────────────────────────

function fakePool({ rows = [], throwOn = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const index = calls.length;
      calls.push([sql, params]);
      const err = throwOn[index];
      if (err) throw err;
      return { rows: typeof rows === "function" ? rows(sql, params, index) : rows };
    },
  };
}

function fakeReq({ method = "GET", body, auth = `Bearer ${SECRET}` } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.headers = auth === null ? {} : { authorization: auth };
  return req;
}

function fakeRes() {
  const res = {
    status: null,
    headers: null,
    raw: "",
    writeHead(status, headers) {
      res.status = status;
      res.headers = headers;
    },
    end(payload) {
      res.raw = payload ? String(payload) : "";
    },
    get body() {
      return res.raw ? JSON.parse(res.raw) : undefined;
    },
  };
  return res;
}

function makeHandler({ pool, store, secret = SECRET } = {}) {
  return createSafetyEventsHandler({
    store: store === undefined ? { pool } : store,
    config: { internalApiSecret: secret },
    readBody,
    sendJson,
    safeStringEqual,
  });
}

async function call(handler, { method = "GET", path = "/internal/safety-events", body, auth } = {}) {
  const req = fakeReq({ method, body, auth });
  const res = fakeRes();
  const handled = await handler(req, res, new URL(path, BASE));
  return { handled, res };
}

// Map an INSERT's column list to its values so assertions are about
// column -> value, not SQL text.
function insertMap(sql, params) {
  const m = /insert\s+into\s+safety_events\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/i.exec(sql);
  assert.ok(m, `not an insert into safety_events: ${sql}`);
  const cols = m[1].split(",").map((c) => c.trim());
  const vals = m[2].split(",").map((v) => v.trim());
  assert.equal(cols.length, vals.length, "column/value count mismatch");
  const out = {};
  cols.forEach((col, i) => {
    const v = vals[i];
    const ph = /^\$(\d+)$/.exec(v);
    out[col] = ph ? params[Number(ph[1]) - 1] : v;
  });
  return out;
}

function selectColumns(sql) {
  const m = /select\s+([\s\S]*?)\s+from\s+safety_events/i.exec(sql);
  assert.ok(m, `not a select from safety_events: ${sql}`);
  return m[1].split(",").map((c) => c.trim());
}

function intervalOf(sql) {
  const m = /interval\s+'([^']+)'/i.exec(sql);
  return m ? m[1] : null;
}

function pgError(code, message = "pg error") {
  const err = new Error(message);
  err.code = code;
  return err;
}

const EVENT = {
  channel: "email",
  action: "flagged",
  reason: "prompt_injection",
  score: 1,
  sender_last4: "mple",
  preview: "ignore previous instructions",
  employee_id: "emp_test_1",
};

// ─── unit tests ─────────────────────────────────────────────────────────────

describe("safety-events handler (unit)", () => {
  test("POST stores source_id", async () => {
    const pool = fakePool();
    const { handled, res } = await call(makeHandler({ pool }), {
      method: "POST",
      body: { ...EVENT, source_id: "abc@mail.example" },
    });
    assert.equal(handled, true);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(pool.calls.length, 1);
    const row = insertMap(...pool.calls[0]);
    assert.equal(row.source_id, "abc@mail.example");
    assert.equal(row.channel, "email");
    assert.equal(row.employee_id, "emp_test_1");
  });

  test("POST normalises bad source_id", async () => {
    const long600 = "x".repeat(600);
    const keep512 = "y".repeat(512);
    for (const bad of [12345, "", long600]) {
      const pool = fakePool();
      const { res } = await call(makeHandler({ pool }), {
        method: "POST",
        body: { ...EVENT, source_id: bad },
      });
      assert.equal(res.status, 200, `row must still be stored for ${typeof bad}`);
      assert.equal(pool.calls.length, 1);
      const row = insertMap(...pool.calls[0]);
      assert.ok("source_id" in row, "insert must carry a source_id column");
      assert.equal(row.source_id, null, `bad source_id (${String(bad).slice(0, 10)}) -> NULL`);
    }
    const pool = fakePool();
    await call(makeHandler({ pool }), { method: "POST", body: { ...EVENT, source_id: keep512 } });
    assert.equal(insertMap(...pool.calls[0]).source_id, keep512);
  });

  test("GET returns source_id", async () => {
    const fakeRow = {
      id: "00000000-0000-0000-0000-000000000001",
      channel: "email",
      action: "flagged",
      source_id: "abc@mail.example",
    };
    const pool = fakePool({ rows: [fakeRow] });
    const { res } = await call(makeHandler({ pool }));
    assert.equal(res.status, 200);
    assert.ok(selectColumns(pool.calls[0][0]).includes("source_id"), "SELECT must list source_id");
    assert.equal(res.body.events[0].source_id, "abc@mail.example");
    assert.equal(res.body.total, 1);
  });

  test("rejects missing or wrong bearer", async () => {
    for (const auth of [null, "Bearer wrong-secret", `Basic ${SECRET}`, SECRET]) {
      const pool = fakePool();
      const { handled, res } = await call(makeHandler({ pool }), {
        method: "POST",
        body: EVENT,
        auth,
      });
      assert.equal(handled, true);
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { error: "unauthorized" });
      assert.equal(pool.calls.length, 0, "no query may run without auth");
    }
    // Empty configured secret also rejects, even with an empty bearer.
    const pool = fakePool();
    const { res } = await call(makeHandler({ pool, secret: "" }), { auth: "Bearer " });
    assert.equal(res.status, 401);
    assert.equal(pool.calls.length, 0);
  });

  test("INSERT falls back when source_id column is missing", async () => {
    const pool = fakePool({ throwOn: [pgError("42703", 'column "source_id" does not exist')] });
    const { res } = await call(makeHandler({ pool }), {
      method: "POST",
      body: { ...EVENT, source_id: "abc@mail.example" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(pool.calls.length, 2, "must retry once with the legacy column set");
    assert.ok("source_id" in insertMap(...pool.calls[0]), "first attempt carries source_id");
    const legacy = insertMap(...pool.calls[1]);
    assert.ok(!("source_id" in legacy), "retry must not name source_id");
    assert.equal(legacy.employee_id, "emp_test_1", "row is still stored");

    // Any other pg error keeps the 500 write_failed and does not retry.
    const pool2 = fakePool({ throwOn: [pgError("23514", "check violation")] });
    const { res: res2 } = await call(makeHandler({ pool: pool2 }), {
      method: "POST",
      body: { ...EVENT, source_id: "abc@mail.example" },
    });
    assert.equal(res2.status, 500);
    assert.deepEqual(res2.body, { ok: false, error: "write_failed" });
    assert.equal(pool2.calls.length, 1);
  });

  test("GET falls back when source_id column is missing", async () => {
    const legacyRow = { id: "00000000-0000-0000-0000-000000000002", channel: "email", action: "flagged" };
    const pool = fakePool({
      throwOn: [pgError("42703", 'column "source_id" does not exist')],
      rows: [legacyRow],
    });
    const { res } = await call(makeHandler({ pool }));
    assert.equal(res.status, 200);
    assert.equal(pool.calls.length, 2, "must retry once with the legacy column list");
    assert.ok(selectColumns(pool.calls[0][0]).includes("source_id"));
    assert.ok(!selectColumns(pool.calls[1][0]).includes("source_id"));
    assert.deepEqual(res.body, { events: [legacyRow], total: 1 });
    assert.ok(!("source_id" in res.body.events[0]));
  });

  test("GET non-42703 error still returns query_failed", async () => {
    const pool = fakePool({ throwOn: [pgError("57P01", "admin shutdown")] });
    const { res } = await call(makeHandler({ pool }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { events: [], total: 0, error: "query_failed" });
    assert.equal(pool.calls.length, 1, "no retry on other errors");
  });

  // ── characterization: behaviour that must NOT change ──

  test("unreviewed-count keeps the 24 h flagged/blocked rule", async () => {
    const pool = fakePool({ rows: [{ n: 3 }] });
    const { res } = await call(makeHandler({ pool }), { path: "/internal/safety-events/unreviewed-count" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { count: 3 });
    const sql = pool.calls[0][0];
    assert.equal(intervalOf(sql), "24 hours");
    assert.match(sql, /reviewed\s*=\s*false/);
    assert.match(sql, /action in \('flagged', 'blocked'\)/);
  });

  test("mark-reviewed with ids touches only those ids", async () => {
    const pool = fakePool();
    const ids = ["00000000-0000-0000-0000-00000000000a", "00000000-0000-0000-0000-00000000000b"];
    const { res } = await call(makeHandler({ pool }), {
      method: "POST",
      path: "/internal/safety-events/mark-reviewed",
      body: { ids, reviewed_by: "ops@example.test" },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(pool.calls.length, 1);
    const [sql, params] = pool.calls[0];
    assert.match(sql, /id = any\(\$1::uuid\[\]\)/);
    assert.equal(intervalOf(sql), null, "ids path has no time window");
    assert.deepEqual(params, [ids, "ops@example.test"]);
  });

  test("mark-reviewed with empty body uses the same 7-day window as the list", async () => {
    const pool = fakePool();
    const handler = makeHandler({ pool });
    await call(handler); // GET list
    const { res } = await call(handler, {
      method: "POST",
      path: "/internal/safety-events/mark-reviewed",
      body: {},
    });
    assert.equal(res.status, 200);
    const listInterval = intervalOf(pool.calls[0][0]);
    const markInterval = intervalOf(pool.calls[1][0]);
    assert.equal(listInterval, "7 days");
    assert.equal(markInterval, listInterval, "mark-all must cover every row the log shows");
    assert.deepEqual(pool.calls[1][1], ["operator"]);
  });

  test("no_database skip responses are unchanged", async () => {
    const handler = makeHandler({ store: {} });
    let r = await call(handler, { method: "POST", body: EVENT });
    assert.deepEqual(r.res.body, { ok: true, skipped: "no_database" });
    r = await call(handler);
    assert.deepEqual(r.res.body, { events: [], total: 0 });
    r = await call(handler, { path: "/internal/safety-events/unreviewed-count" });
    assert.deepEqual(r.res.body, { count: 0 });
  });

  test("bad JSON -> 400, unknown subpath -> 404, other paths not handled", async () => {
    const pool = fakePool();
    const handler = makeHandler({ pool });
    let r = await call(handler, { method: "POST", body: "{not json" });
    assert.equal(r.res.status, 400);
    assert.deepEqual(r.res.body, { error: "bad_json" });
    r = await call(handler, { path: "/internal/safety-events/nope" });
    assert.equal(r.res.status, 404);
    r = await call(handler, { path: "/healthz" });
    assert.equal(r.handled, false);
    assert.equal(r.res.status, null);
    assert.equal(pool.calls.length, 0);
  });
});

// ─── integration tests (real Postgres) ──────────────────────────────────────

const DB_URL = process.env.TEST_DATABASE_URL;

describe("safety-events handler (real Postgres)", { skip: !DB_URL }, () => {
  const schema = `t43_${randomBytes(4).toString("hex")}`;
  let pg;
  let admin;
  let pool;
  let handler;

  // Same ssl rule as scripts/migrate.mjs.
  const sslFor = (url) => (url.includes("sslmode=disable") ? false : { rejectUnauthorized: false });

  before(async () => {
    pg = (await import("pg")).default;
    admin = new pg.Pool({ connectionString: DB_URL, ssl: sslFor(DB_URL), max: 1 });
    await admin.query(`create schema ${schema}`);
    pool = new pg.Pool({ connectionString: DB_URL, ssl: sslFor(DB_URL), options: `-c search_path=${schema}` });

    // Apply the REAL migration files: 0009 (table) then 0015 (source_id), twice.
    const dir = new URL("../../db/migrations/", import.meta.url);
    const files = (await readdir(dir)).filter((f) => /^(0009|0015)_.*\.sql$/.test(f)).sort();
    for (let pass = 0; pass < 2; pass += 1) {
      for (const file of files) {
        await pool.query(await readFile(new URL(file, dir), "utf8"));
      }
    }
    handler = makeHandler({ pool });
  });

  after(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });

  beforeEach(async () => {
    await pool.query("delete from safety_events");
  });

  test("real Postgres round trip", async () => {
    // Fails with 'column "source_id" does not exist' if migration 0015 is missing.
    await pool.query("select source_id from safety_events limit 0");

    const post = await call(handler, {
      method: "POST",
      body: { ...EVENT, source_id: "<round-trip@mail.example>" },
    });
    assert.equal(post.res.status, 200);
    assert.deepEqual(post.res.body, { ok: true });

    const get = await call(handler);
    assert.equal(get.res.status, 200);
    assert.equal(get.res.body.total, 1);
    assert.equal(get.res.body.events[0].source_id, "<round-trip@mail.example>");
    assert.equal(get.res.body.events[0].employee_id, "emp_test_1");
  });

  test("mark-reviewed with empty body covers the whole visible window", async () => {
    const insert = async (age) => {
      const { rows } = await pool.query(
        `insert into safety_events (channel, action, preview, created_at)
         values ('email', 'flagged', $1, now() - $2::interval) returning id`,
        [`aged ${age}`, age],
      );
      return rows[0].id;
    };
    const reviewedOf = async () => {
      const { rows } = await pool.query("select preview, reviewed from safety_events order by created_at desc");
      return Object.fromEntries(rows.map((r) => [r.preview, r.reviewed]));
    };

    await insert("1 hour");
    await insert("3 days");
    await insert("8 days");
    const r = await call(handler, { method: "POST", path: "/internal/safety-events/mark-reviewed", body: {} });
    assert.equal(r.res.status, 200);
    assert.deepEqual(await reviewedOf(), {
      "aged 1 hour": true,
      "aged 3 days": true,
      "aged 8 days": false,
    });

    // With ids: only those ids.
    await pool.query("delete from safety_events");
    const a = await insert("1 hour");
    await insert("3 days");
    const r2 = await call(handler, {
      method: "POST",
      path: "/internal/safety-events/mark-reviewed",
      body: { ids: [a] },
    });
    assert.equal(r2.res.status, 200);
    assert.deepEqual(await reviewedOf(), { "aged 1 hour": true, "aged 3 days": false });
  });
});
