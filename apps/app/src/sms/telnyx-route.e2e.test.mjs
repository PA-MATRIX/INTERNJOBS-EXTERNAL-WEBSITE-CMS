// v1.7 Phase 44-04: real-server e2e for POST /webhooks/telnyx/sms.
// Run: node --test src/sms/telnyx-route.e2e.test.mjs (from apps/app)
//
// Spawns the REAL server (src/server.mjs) four times in clean environments,
// signs Telnyx envelopes with an in-test Ed25519 keypair, and points
// TELNYX_API_BASE at a local stub (127.0.0.1:3933) that records every request.
// No Telnyx account, no secrets, no outbound network.
//
//   A :3932  SMS_PROVIDER=telnyx,     key set, stub, in-memory store
//   B :3934  SMS_PROVIDER=mac-bridge, key set, stub  (D34: still processes)
//   C :3935  SMS_PROVIDER=telnyx,     NO key         (D34: rejects, 401)
//   D :3937  SMS_PROVIDER=telnyx,     key set, DATABASE_URL = a FRESH database
//            (created here, dropped afterwards) on the Postgres given by
//            TEST_DATABASE_URL, in which messaging_events and sms_opt_outs do
//            NOT exist, so every store query fails at request time (5xx).
//
// Server D (44-04 Amendment 2): an UNREACHABLE DATABASE_URL crashes the server
// at boot (uncaught Mastra PG init, evidence/44-04-serverD-boot-crash.txt), so
// the store-failure case needs a reachable Postgres. It uses a brand-new
// DATABASE (not a schema) so tables other test files left in the default DB
// (CI: postgres:16 service, db `postgres`) cannot leak in. The case is SKIPPED
// when TEST_DATABASE_URL is unset, the same pattern as the 44-03 pg e2e.
//
// Replies are sent AFTER the ack (SMS-04), so positive stub assertions poll
// with waitFor() and "nothing was sent" assertions wait a settle delay first.

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const PORT_A = 3932;
const PORT_B = 3934;
const PORT_C = 3935;
const PORT_D = 3937;
const STUB_PORT = 3933;
const FROM_NUMBER = "+14063210019";
const API_KEY = "test-telnyx-key";
const SETTLE_MS = 300;
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const FRESH_DB = `t44d_${randomBytes(4).toString("hex")}`;
// Same ssl rule as scripts/migrate.mjs and store.mjs.
const sslFor = (url) => (url.includes("sslmode=disable") ? false : { rejectUnauthorized: false });
let admin; // pg.Pool on TEST_DATABASE_URL, used only to create/drop FRESH_DB
let serverD;
let freshTablesPresent = null;

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  return { rawPub, privateKey };
}
const MAIN = keypair();
const OTHER = keypair();

const children = [];
let stub;
let eventCounter = 0;
const nextId = (tag) => `e2e-${tag}-${process.pid}-${++eventCounter}`;

function startStub(port) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
      requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: { id: `tx-${requests.length}` } }));
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, requests })));
}

async function waitForHealth(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      lastErr = new Error(`health ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await delay(250);
  }
  throw new Error(`server at ${url} not ready within ${timeoutMs}ms: ${lastErr?.message ?? "unknown"}`);
}

async function startServer(env, port) {
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: new URL("../..", import.meta.url),
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      ENABLE_DEV_AUTH: "true",
      APP_SESSION_SECRET: "e2e-secret",
      ...env,
    },
  });
  children.push(child);
  await waitForHealth(`http://127.0.0.1:${port}/healthz`);
  return child;
}

function envelope({ eventType = "message.received", id, from, text }) {
  return JSON.stringify({
    data: {
      event_type: eventType,
      id,
      occurred_at: "2026-10-15T00:00:00.000Z",
      record_type: "event",
      payload: {
        id: `msg-${id}`,
        from: { phone_number: from },
        to: [{ phone_number: "+15555550100" }],
        text,
        type: "SMS",
        direction: "inbound",
      },
    },
    meta: { attempt: 1 },
  });
}

function signed(raw, ts = Math.floor(Date.now() / 1000), privateKey = MAIN.privateKey) {
  return {
    "telnyx-timestamp": String(ts),
    "telnyx-signature-ed25519": sign(null, Buffer.from(`${ts}|${raw}`, "utf8"), privateKey).toString("base64"),
  };
}

async function post(port, raw, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/webhooks/telnyx/sms`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const postSigned = (port, msg) => {
  const raw = envelope(msg);
  return post(port, raw, signed(raw));
};

const sentTo = (to) => stub.requests.filter((r) => r.url === "/v2/messages" && r.body?.to === to);

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(25);
  }
  return predicate();
}

const telnyxEnv = (extra = {}) => ({
  SMS_PROVIDER: "telnyx",
  TELNYX_API_KEY: API_KEY,
  TELNYX_FROM_NUMBER: FROM_NUMBER,
  TELNYX_WEBHOOK_PUBLIC_KEY: MAIN.rawPub,
  TELNYX_API_BASE: `http://127.0.0.1:${STUB_PORT}`,
  ...extra,
});

before(async () => {
  stub = await startStub(STUB_PORT);
  await startServer(telnyxEnv(), PORT_A);
  await startServer(telnyxEnv({ SMS_PROVIDER: "mac-bridge" }), PORT_B);
  const noKey = telnyxEnv();
  delete noKey.TELNYX_WEBHOOK_PUBLIC_KEY;
  await startServer(noKey, PORT_C);
  if (TEST_DB_URL) {
    const pg = (await import("pg")).default;
    admin = new pg.Pool({ connectionString: TEST_DB_URL, ssl: sslFor(TEST_DB_URL), max: 1 });
    await admin.query(`create database ${FRESH_DB}`);
    const freshUrl = new URL(TEST_DB_URL);
    freshUrl.pathname = `/${FRESH_DB}`;
    if (!freshUrl.searchParams.has("sslmode")) freshUrl.searchParams.set("sslmode", "disable");
    serverD = await startServer(telnyxEnv({ DATABASE_URL: freshUrl.toString() }), PORT_D);
    // Precondition, read AFTER boot: nothing at startup created the store tables.
    const probe = new pg.Pool({ connectionString: freshUrl.toString(), ssl: sslFor(TEST_DB_URL), max: 1 });
    const { rows } = await probe.query(
      "select to_regclass('messaging_events') as me, to_regclass('sms_opt_outs') as oo",
    );
    freshTablesPresent = rows[0];
    await probe.end();
  }
});

after(async () => {
  for (const child of children) child.kill();
  await new Promise((resolve) => (stub ? stub.server.close(resolve) : resolve()));
  if (admin) {
    if (serverD) await new Promise((resolve) => (serverD.exitCode !== null || serverD.signalCode !== null ? resolve() : serverD.once("exit", resolve)));
    await admin.query(`drop database if exists ${FRESH_DB} with (force)`);
    await admin.end();
  }
});

describe("POST /webhooks/telnyx/sms (real server)", () => {
  test("signature: forged requests are 401 and nothing is sent; a valid unknown sender gets one reply via Telnyx", async () => {
    const from = "+15555550150";
    const raw = envelope({ id: nextId("sig"), from, text: "hello" });
    const now = Math.floor(Date.now() / 1000);

    const unsigned = await post(PORT_A, raw);
    assert.equal(unsigned.status, 401);
    const otherKey = await post(PORT_A, raw, signed(raw, now, OTHER.privateKey));
    assert.equal(otherKey.status, 401);
    const stale = await post(PORT_A, raw, signed(raw, now - 400));
    assert.equal(stale.status, 401);
    const tampered = await post(PORT_A, raw.replace("hello", "hellO"), signed(raw, now));
    assert.equal(tampered.status, 401);
    await delay(SETTLE_MS);
    assert.equal(stub.requests.length, 0, "no forged request may reach the Telnyx API");

    const ok = await post(PORT_A, raw, signed(raw));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.eventType, "unmatched_inbound");
    assert.ok(await waitFor(() => sentTo(from).length === 1), "the unknown-sender reply reaches the stub");
    const [req] = sentTo(from);
    assert.equal(req.method, "POST");
    assert.equal(req.authorization, `Bearer ${API_KEY}`);
    assert.equal(req.body.from, FROM_NUMBER);
    assert.equal(req.body.to, from);
    assert.match(req.body.text, /waitlist/);
  });

  test("retry of the same event id is a no-op", async () => {
    const from = "+15555550160";
    const msg = { id: nextId("retry"), from, text: "hello" };
    const first = await postSigned(PORT_A, msg);
    assert.equal(first.status, 200);
    assert.equal(first.body.eventType, "unmatched_inbound");
    assert.ok(await waitFor(() => sentTo(from).length === 1));
    const second = await postSigned(PORT_A, msg);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);
    await delay(SETTLE_MS);
    assert.equal(sentTo(from).length, 1, "a retry must not send a second reply");

    // Keyword events have no store-level dedupe behind them: a HELP retry is
    // stopped only by the early dedupe lookup.
    const helpFrom = "+15555550161";
    const help = { id: nextId("retry-help"), from: helpFrom, text: "HELP" };
    assert.equal((await postSigned(PORT_A, help)).body.eventType, "help_request");
    assert.ok(await waitFor(() => sentTo(helpFrom).length === 1));
    const helpRetry = await postSigned(PORT_A, help);
    assert.deepEqual(helpRetry.body, { ok: true, duplicate: true });
    await delay(SETTLE_MS);
    assert.equal(sentTo(helpFrom).length, 1, "a HELP retry must not send a second help text");
  });

  test("STOP, guard, START round trip; HELP answers with opt-out instructions", async () => {
    const from = "+15555550151";
    const stop = await postSigned(PORT_A, { id: nextId("stop"), from, text: "STOP" });
    assert.equal(stop.status, 200);
    assert.equal(stop.body.eventType, "opt_out");
    await delay(SETTLE_MS);
    assert.equal(sentTo(from).length, 0, "STOP sends nothing");

    const blocked = await postSigned(PORT_A, { id: nextId("stop-hello"), from, text: "hello" });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.eventType, "unmatched_inbound");
    await delay(SETTLE_MS);
    assert.equal(sentTo(from).length, 0, "the opt-out guard blocks the unknown-sender reply");

    const start = await postSigned(PORT_A, { id: nextId("start"), from, text: "START" });
    assert.equal(start.status, 200);
    assert.equal(start.body.eventType, "opt_in");

    const after = await postSigned(PORT_A, { id: nextId("start-hello"), from, text: "hello" });
    assert.equal(after.body.eventType, "unmatched_inbound");
    assert.ok(await waitFor(() => sentTo(from).length === 1), "after START the reply is sent again");
    await delay(SETTLE_MS);
    assert.equal(sentTo(from).length, 1);

    const helpFrom = "+15555550152";
    const help = await postSigned(PORT_A, { id: nextId("help"), from: helpFrom, text: "help" });
    assert.equal(help.status, 200);
    assert.equal(help.body.eventType, "help_request");
    assert.ok(await waitFor(() => sentTo(helpFrom).length === 1));
    assert.match(sentTo(helpFrom)[0].body.text, /Reply STOP to opt out/);
    assert.equal(sentTo(helpFrom)[0].body.from, FROM_NUMBER);
  });

  test("delivery events and short codes are not answered", async () => {
    const before = stub.requests.length;
    const finalized = await postSigned(PORT_A, {
      eventType: "message.finalized",
      id: nextId("final"),
      from: "+15555550150",
      text: "hello",
    });
    assert.equal(finalized.status, 200);
    assert.equal(finalized.body.ignored, true);
    assert.equal(finalized.body.eventType, "message.finalized");

    const shortCode = await postSigned(PORT_A, { id: nextId("short"), from: "32665", text: "Your code is 123456" });
    assert.equal(shortCode.status, 200);
    assert.equal(shortCode.body.eventType, "unmatched_inbound");
    await delay(SETTLE_MS);
    assert.equal(stub.requests.length, before, "no outbound for a delivery event or a short-code sender");
  });

  test("D34 gate: the route follows TELNYX_WEBHOOK_PUBLIC_KEY, not SMS_PROVIDER", async () => {
    // B: SMS_PROVIDER=mac-bridge, key set -> signed request processed.
    const fromB = "+15555550170";
    const raw = envelope({ id: nextId("d34-b"), from: fromB, text: "hello" });
    const forged = await post(PORT_B, raw, signed(raw, Math.floor(Date.now() / 1000), OTHER.privateKey));
    assert.equal(forged.status, 401);
    const okB = await post(PORT_B, raw, signed(raw));
    assert.equal(okB.status, 200);
    assert.equal(okB.body.eventType, "unmatched_inbound");
    assert.ok(await waitFor(() => sentTo(fromB).length === 1), "the reply goes out via Telnyx on server B");
    assert.equal(sentTo(fromB)[0].body.from, FROM_NUMBER);

    // C: SMS_PROVIDER=telnyx, no key -> rejected.
    const fromC = "+15555550171";
    const c = await postSigned(PORT_C, { id: nextId("d34-c"), from: fromC, text: "hello" });
    assert.equal(c.status, 401);
    assert.equal(c.body.reason, "public_key_missing");
    await delay(SETTLE_MS);
    assert.equal(sentTo(fromC).length, 0);

    const hA = await waitForHealth(`http://127.0.0.1:${PORT_A}/healthz`);
    assert.equal(hA.smsProvider, "telnyx");
    assert.equal(hA.configured.telnyx, true);
    assert.equal(hA.configured.telnyxWebhookKey, true);
    const hB = await waitForHealth(`http://127.0.0.1:${PORT_B}/healthz`);
    assert.equal(hB.smsProvider, "mac-bridge");
    assert.equal(hB.configured.telnyxWebhookKey, true);
    const hC = await waitForHealth(`http://127.0.0.1:${PORT_C}/healthz`);
    assert.equal(hC.smsProvider, "telnyx");
    assert.equal(hC.configured.telnyxWebhookKey, false);
    assert.equal(hC.configured.telnyx, false);
    assert.ok(!JSON.stringify(hA).includes(MAIN.rawPub), "healthz must not echo the key");
  });

  test("a failing store returns 5xx so Telnyx retries", { skip: !TEST_DB_URL && "TEST_DATABASE_URL unset" }, async () => {
    assert.deepEqual(
      freshTablesPresent,
      { me: null, oo: null },
      `fresh database ${FRESH_DB} must not contain messaging_events or sms_opt_outs`,
    );
    const from = "+15555550180";
    const stop = await postSigned(PORT_D, { id: nextId("d-stop"), from, text: "STOP" });
    assert.ok(stop.status >= 500 && stop.status < 600, `STOP got ${stop.status}`);
    const hello = await postSigned(PORT_D, { id: nextId("d-hello"), from, text: "hello" });
    assert.ok(hello.status >= 500 && hello.status < 600, `message got ${hello.status}`);
    await delay(SETTLE_MS);
    assert.equal(sentTo(from).length, 0);
  });
});
