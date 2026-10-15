// v1.7 Phase 44-03: characterization of the mac-bridge START-code pairing path
// on a REAL Postgres store.
//
// The DB-less e2e (mac-bridge-route.e2e.test.mjs) cannot reach the START-code
// branch because store.pool is undefined without DATABASE_URL. This file
// spawns the REAL server (src/server.mjs, port 3936) with DATABASE_URL pointing
// at a throwaway schema (search_path via the connection-string `options`) in
// the Postgres given by TEST_DATABASE_URL, applies the REAL migration files
// the route needs, seeds students + pairing_sessions with plain SQL, and posts
// HMAC-signed messages.
//
// Migrations applied (the pgvector-dependent 0004/0005 are skipped because the
// CI postgres:16 image and the local Homebrew cluster have no `vector`
// extension; inbound_messages comes from 0003b, which 0004 only mirrors):
//   0001 0002 0003 0003b 0008 0009 0015 0016
//
// Expected bodies are the ACTUAL outputs of the route before the 44-03
// extraction (evidence/44-03-baseline-pg-before.txt). Keep this file unchanged
// across the extraction so the before/after runs are comparable.
//
// No outbound network: no BRIDGE_URL (sendSms skipped), no LAKERA key (screen
// fails open without fetch), no Workers AI / LLM config.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const DB_URL = process.env.TEST_DATABASE_URL;
const PORT = 3936;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "test-bridge-secret";
const MIGRATIONS = [
  "0001_waitlist_foundation.sql",
  "0002_waitlist_threads_and_enrichment.sql",
  "0003_v1_2_startup_identity.sql",
  "0003b_email_inbound.sql",
  "0008_v1_2_pairing_sessions.sql",
  "0009_v1_3_safety_events.sql",
  "0015_v1_7_safety_events_source_id.sql",
  "0016_v1_7_sms_opt_outs.sql",
];

// Same ssl rule as scripts/migrate.mjs.
const sslFor = (url) => (url.includes("sslmode=disable") ? false : { rejectUnauthorized: false });

async function waitForHealth(url, { timeoutMs = 30000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      lastErr = new Error(`health check returned ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await delay(intervalMs);
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms: ${lastErr?.message ?? "unknown"}`);
}

async function postSigned(body) {
  const raw = JSON.stringify(body);
  const signature = `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
  const res = await fetch(`${BASE}/webhooks/mac-bridge`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-bridge-signature": signature },
    body: raw,
  });
  return { status: res.status, body: await res.json() };
}

function message(providerEventId, text, from) {
  return { providerEventId, platform: "imessage", from, text, ts: "2026-10-15T00:00:00Z" };
}

async function eventually(fn, { timeoutMs = 5000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await delay(intervalMs);
  }
  return last;
}

describe("mac-bridge pairing path (real Postgres)", { skip: !DB_URL }, () => {
  const schema = `t44m_${randomBytes(4).toString("hex")}`;
  let pg;
  let admin;
  let pool;
  let child;
  const ids = {};

  before(async () => {
    pg = (await import("pg")).default;
    admin = new pg.Pool({ connectionString: DB_URL, ssl: sslFor(DB_URL), max: 1 });
    await admin.query(`create schema ${schema}`);
    pool = new pg.Pool({ connectionString: DB_URL, ssl: sslFor(DB_URL), options: `-c search_path=${schema}` });

    const dir = new URL("../../db/migrations/", import.meta.url);
    for (const file of MIGRATIONS) {
      await pool.query(await readFile(new URL(file, dir), "utf8"));
    }

    // Seed: A (LinkedIn, no phone, valid code), B (confirmed other phone),
    // C (LinkedIn, expired code).
    const seed = async (key, clerk, extra = {}) => {
      const { rows } = await pool.query(
        `insert into students (clerk_user_id, name, linkedin_profile_url, status, channel_type, channel_address, channel_confirmed_at)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [
          clerk,
          `Student ${key}`,
          `https://www.linkedin.com/in/test-student-${key.toLowerCase()}`,
          extra.status || "linkedin_connected",
          extra.channelType || null,
          extra.channelAddress || null,
          extra.channelConfirmedAt || null,
        ],
      );
      ids[key] = rows[0].id;
    };
    await seed("A", "e2e_clerk_a");
    await seed("B", "e2e_clerk_b", {
      status: "channel_confirmed",
      channelType: "imessage",
      channelAddress: "+15555550199",
      channelConfirmedAt: new Date().toISOString(),
    });
    await seed("C", "e2e_clerk_c");
    await pool.query(
      `insert into pairing_sessions (code, student_id, expires_at) values
         ('START-GOOD01', $1, now() + interval '1 hour'),
         ('START-BOUND1', $2, now() + interval '1 hour'),
         ('START-OLD001', $3, now() - interval '1 hour')`,
      [ids.A, ids.B, ids.C],
    );

    const dbUrl = new URL(DB_URL);
    dbUrl.searchParams.set("options", `-c search_path=${schema}`);
    if (!dbUrl.searchParams.has("sslmode")) dbUrl.searchParams.set("sslmode", "disable");

    child = spawn(process.execPath, ["src/server.mjs"], {
      cwd: new URL("../..", import.meta.url),
      stdio: "ignore",
      env: {
        PATH: process.env.PATH,
        PORT: String(PORT),
        NODE_ENV: "test",
        ENABLE_DEV_AUTH: "true",
        APP_SESSION_SECRET: "e2e-secret",
        SMS_PROVIDER: "mac-bridge",
        BRIDGE_HMAC_SECRET: SECRET,
        DATABASE_URL: dbUrl.toString(),
      },
    });
    await waitForHealth(`${BASE}/healthz`);
  });

  after(async () => {
    child?.kill();
    await delay(200);
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });

  test("valid START code binds the sender (pairing_started)", async () => {
    const r = await postSigned(message("pg-good-1", "START-GOOD01", "+15555550111"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, eventType: "pairing_started", studentId: ids.A });

    const student = (await pool.query(
      "select channel_address, channel_type, channel_confirmed_at, status from students where id = $1",
      [ids.A],
    )).rows[0];
    assert.equal(student.channel_address, "+15555550111");
    assert.equal(student.channel_type, "imessage");
    assert.ok(student.channel_confirmed_at, "channel_confirmed_at set");
    assert.equal(student.status, "channel_confirmed");

    const session = (await pool.query(
      "select claimed_at, claimed_phone from pairing_sessions where code = 'START-GOOD01'",
    )).rows[0];
    assert.ok(session.claimed_at, "claimed_at set");
    assert.equal(session.claimed_phone, "+15555550111");

    const ev = (await pool.query(
      "select provider, event_type, student_id, direction, metadata from messaging_events where provider_event_id = 'pg-good-1'",
    )).rows;
    assert.equal(ev.length, 1);
    assert.equal(ev[0].provider, "mac-bridge");
    assert.equal(ev[0].event_type, "pairing_started");
    assert.equal(ev[0].student_id, ids.A);
    assert.equal(ev[0].direction, "inbound");
    assert.equal(ev[0].metadata.source, "phase-09");
    assert.equal(ev[0].metadata.pairingCode, "START-GOOD01");

    const audit = (await pool.query(
      "select metadata from audit_events where student_id = $1 and event_type = 'pairing_started'",
      [ids.A],
    )).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].metadata.code, "START-GOOD01");

    const inbound = (await pool.query(
      "select provider, student_id, body, metadata from inbound_messages where provider_event_id = 'pg-good-1'",
    )).rows;
    assert.equal(inbound.length, 1);
    assert.equal(inbound[0].provider, "mac-bridge");
    assert.equal(inbound[0].student_id, ids.A);
    assert.equal(inbound[0].body, "START-GOOD01");
    assert.equal(inbound[0].metadata.firstContact, true);

    // No LAKERA key: screenMessage fails open with action
    // 'passed_lakera_unavailable', which is !== 'passed', so the original
    // route writes a safety_events row (fire-and-forget).
    const safety = await eventually(async () => {
      const { rows } = await pool.query(
        "select channel, action, sender_last4, preview from safety_events where preview = 'START-GOOD01'",
      );
      return rows.length ? rows : null;
    });
    assert.deepEqual(safety, [
      { channel: "sms", action: "passed_lakera_unavailable", sender_last4: "0111", preview: "START-GOOD01" },
    ]);
  });

  test("same code again from another event is pairing_expired code_already_claimed", async () => {
    const r = await postSigned(message("pg-good-2", "START-GOOD01", "+15555550112"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: false, eventType: "pairing_expired", reason: "code_already_claimed" });

    const ev = (await pool.query(
      "select provider, event_type, student_id, metadata from messaging_events where provider_event_id = 'pg-good-2'",
    )).rows;
    assert.equal(ev.length, 1);
    assert.equal(ev[0].provider, "mac-bridge");
    assert.equal(ev[0].event_type, "pairing_expired");
    assert.equal(ev[0].student_id, null);
    assert.equal(ev[0].metadata.reason, "code_already_claimed");

    const session = (await pool.query(
      "select claimed_phone from pairing_sessions where code = 'START-GOOD01'",
    )).rows[0];
    assert.equal(session.claimed_phone, "+15555550111");
    const inbound = (await pool.query("select 1 from inbound_messages where provider_event_id = 'pg-good-2'")).rows;
    assert.equal(inbound.length, 0);
  });

  test("expired code is pairing_expired code_expired and binds nothing", async () => {
    const r = await postSigned(message("pg-old-1", "START-OLD001", "+15555550114"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: false, eventType: "pairing_expired", reason: "code_expired" });

    const student = (await pool.query(
      "select channel_address, channel_confirmed_at, status from students where id = $1",
      [ids.C],
    )).rows[0];
    assert.equal(student.channel_address, null);
    assert.equal(student.channel_confirmed_at, null);
    assert.equal(student.status, "linkedin_connected");
    const session = (await pool.query("select claimed_at from pairing_sessions where code = 'START-OLD001'")).rows[0];
    assert.equal(session.claimed_at, null);

    const ev = (await pool.query(
      "select provider, event_type from messaging_events where provider_event_id = 'pg-old-1'",
    )).rows;
    assert.deepEqual(ev, [{ provider: "mac-bridge", event_type: "pairing_expired" }]);
    const inbound = (await pool.query("select 1 from inbound_messages where provider_event_id = 'pg-old-1'")).rows;
    assert.equal(inbound.length, 0);
  });

  test("code for a student with another confirmed phone is pairing_rejected phone_already_bound", async () => {
    const r = await postSigned(message("pg-bound-1", "START-BOUND1", "+15555550113"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: false, eventType: "pairing_rejected", reason: "phone_already_bound" });

    const student = (await pool.query("select channel_address from students where id = $1", [ids.B])).rows[0];
    assert.equal(student.channel_address, "+15555550199");
    const session = (await pool.query("select claimed_at from pairing_sessions where code = 'START-BOUND1'")).rows[0];
    assert.equal(session.claimed_at, null);

    const ev = (await pool.query(
      "select provider, event_type, student_id from messaging_events where provider_event_id = 'pg-bound-1'",
    )).rows;
    assert.deepEqual(ev, [{ provider: "mac-bridge", event_type: "pairing_rejected", student_id: null }]);
    const audit = (await pool.query(
      "select 1 from audit_events where student_id = $1 and event_type = 'pairing_phone_rejected'",
      [ids.B],
    )).rows;
    assert.equal(audit.length, 1);
  });
});
