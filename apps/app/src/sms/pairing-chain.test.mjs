// v1.7 Phase 44-05 (PAIR-01): a START code texted to the Telnyx number claims
// the student through the Telnyx path.
//
// Run: node --test src/sms/pairing-chain.test.mjs (from apps/app)
//
// Real pieces: createTelnyxSmsProvider (Ed25519 verify against an in-test
// keypair, real parseInbound), createInboundSmsHandler with the option set from
// buildTelnyxInboundOptions (the SAME function server.mjs uses, so this test
// cannot drift from the server wiring), parsePairingCode, claimPairingCode and
// readBody. Faked: the pool (scripted by SQL text, every call recorded), the
// store methods around it, screenMessage (passed), the student workflow and
// the LinkedIn first-contact hook. No network: the provider's fetch fails the
// test if it is called.
//
// Negative controls (evidence/44-05-negctl-chain.txt): breaking the claim (no
// students update) or skipping provider.verifyWebhook turns this file red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { Readable } from "node:stream";
import { createTelnyxSmsProvider } from "./telnyx.mjs";
import { createInboundSmsHandler } from "./inbound-handler.mjs";
import { buildTelnyxInboundOptions } from "./registry.mjs";
import { claimPairingCode, parsePairingCode } from "../onboarding/pairing.mjs";
import { readBody } from "../http.mjs";

const STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const CODE = "START-AB12CD";
const FROM = "+15555550123";

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  return { rawPub, privateKey };
}
const MAIN = keypair();
const OTHER = keypair();

function envelope({ id, from = FROM, text }) {
  return JSON.stringify({
    data: {
      event_type: "message.received",
      id,
      occurred_at: "2026-10-15T00:00:00.000Z",
      record_type: "event",
      payload: {
        id: `msg-${id}`,
        from: { phone_number: from },
        to: [{ phone_number: "+14063210019" }],
        text,
        type: "SMS",
        direction: "inbound",
      },
    },
    meta: { attempt: 1 },
  });
}

function signedRequest(raw, privateKey = MAIN.privateKey) {
  const ts = Math.floor(Date.now() / 1000);
  const req = Readable.from([Buffer.from(raw, "utf8")]);
  req.headers = {
    "content-type": "application/json",
    "telnyx-timestamp": String(ts),
    "telnyx-signature-ed25519": sign(null, Buffer.from(`${ts}|${raw}`, "utf8"), privateKey).toString("base64"),
  };
  return req;
}

function scriptedPool({ expired = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, params) {
      const text = String(sql).trim().toLowerCase();
      calls.push({ sql: text, params });
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };
      if (text.startsWith("select") && text.includes("from pairing_sessions")) {
        return {
          rows: [{
            code: CODE,
            student_id: STUDENT_ID,
            expires_at: new Date(Date.now() + (expired ? -60_000 : 60 * 60 * 1000)).toISOString(),
            claimed_at: null,
          }],
        };
      }
      if (text.startsWith("select") && text.includes("from students")) {
        return {
          rows: [{
            id: STUDENT_ID,
            linkedin_profile_url: "https://www.linkedin.com/in/test-student",
            channel_address: null,
            channel_confirmed_at: null,
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return {
    calls,
    async connect() {
      calls.push({ sql: "connect" });
      return client;
    },
    async query(sql, params) {
      calls.push({ sql: String(sql).trim().toLowerCase(), params });
      return { rows: [], rowCount: 0 };
    },
  };
}

function harness({ expired = false } = {}) {
  const pool = scriptedPool({ expired });
  const events = [];
  const seen = new Set();
  const storeCalls = [];
  const workflowRuns = [];
  const store = {
    pool,
    async hasMessagingEvent(provider, eventId) {
      storeCalls.push("hasMessagingEvent");
      return seen.has(`${provider}:${eventId}`);
    },
    async writeMessagingEvent(evt) {
      storeCalls.push("writeMessagingEvent");
      events.push(evt);
      seen.add(`${evt.provider}:${evt.providerEventId}`);
    },
    async writeAuditEvent(...args) {
      storeCalls.push("writeAuditEvent");
      return args;
    },
    async writeInboundMessage() {
      storeCalls.push("writeInboundMessage");
      return "inbound-message-1";
    },
    async confirmPairingCode() {
      throw new Error("legacy confirmPairingCode must not run for a START code");
    },
    async recordInboundMessage() {
      throw new Error("recordInboundMessage must not run for a START code");
    },
    optOuts: {
      async isOptedOut() { return false; },
      async recordOptOut() { throw new Error("no keyword expected"); },
      async clearOptOut() { throw new Error("no keyword expected"); },
    },
  };
  const config = {
    appUrl: "https://app.internjobs.ai",
    agentNumber: "+14063210019",
    telnyx: {
      apiKey: "test-telnyx-key",
      fromNumber: "+14063210019",
      publicKey: MAIN.rawPub,
      apiBase: "http://127.0.0.1:1",
    },
  };
  const provider = createTelnyxSmsProvider(config, {
    isOptedOut: async () => false,
    fetchImpl: async () => {
      throw new Error("no outbound Telnyx call is expected on the pairing path");
    },
  });
  const responses = [];
  const handler = createInboundSmsHandler({
    ...buildTelnyxInboundOptions(),
    provider,
    store,
    config,
    screenMessage: async () => ({ action: "passed", score: 0, flagged: false }),
    runStudentInboundWorkflow: async (args) => {
      workflowRuns.push(args);
    },
    claimPairingCode,
    parsePairingCode,
    ensureLinkedInProfileForFirstContact: async () => {},
    createUnknownSenderText: () => "unknown",
    createWelcomeText: () => "welcome",
    readBody,
    sendJson(_res, status, body) {
      responses.push({ status, body });
    },
    log: { log() {}, error() {} },
  });
  async function deliver(raw, privateKey) {
    const before = responses.length;
    await handler(signedRequest(raw, privateKey), {});
    assert.equal(responses.length, before + 1, "exactly one response per request");
    return responses[responses.length - 1];
  }
  return { pool, events, storeCalls, workflowRuns, deliver };
}

const studentUpdates = (pool) => pool.calls.filter((c) => c.sql.startsWith("update students"));

test("a texted START code claims the student through the Telnyx path", async (t) => {
  await t.test("valid signed START code binds the E.164 sender with channel type sms", async () => {
    const h = harness();
    const raw = envelope({ id: "evt-pair-1", text: CODE });
    const res = await h.deliver(raw);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, eventType: "pairing_started", studentId: STUDENT_ID });

    const updates = studentUpdates(h.pool);
    assert.equal(updates.length, 1, "one students update");
    assert.deepEqual(updates[0].params, [STUDENT_ID, "sms", FROM]);
    assert.match(updates[0].sql, /channel_address/);
    const sessionUpdate = h.pool.calls.find((c) => c.sql.startsWith("update pairing_sessions"));
    assert.deepEqual(sessionUpdate.params, [CODE, FROM]);

    const evt = h.events.find((e) => e.eventType === "pairing_started");
    assert.ok(evt, "messaging_events pairing_started written");
    assert.equal(evt.provider, "telnyx");
    assert.equal(evt.providerEventId, "evt-pair-1");
    assert.equal(evt.channelType, "sms");
    assert.equal(evt.channelAddress, FROM);
    assert.equal(evt.studentId, STUDENT_ID);
    assert.equal(h.workflowRuns.length, 1, "first-contact workflow dispatched once");

    // The SAME webhook re-delivered is a duplicate and binds nothing again.
    const again = await h.deliver(raw);
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, { ok: true, duplicate: true });
    assert.equal(studentUpdates(h.pool).length, 1, "no second students update");
    assert.equal(h.workflowRuns.length, 1, "no second workflow run");
  });

  await t.test("a webhook signed with the wrong key is 401 and touches no database", async () => {
    const h = harness();
    const res = await h.deliver(envelope({ id: "evt-forged-1", text: CODE }), OTHER.privateKey);
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "unauthorized");
    assert.equal(h.pool.calls.length, 0, "zero pool calls");
    assert.deepEqual(h.storeCalls, [], "zero store calls");
    assert.equal(h.workflowRuns.length, 0);
  });

  await t.test("an expired session row is pairing_expired and binds nothing", async () => {
    const h = harness({ expired: true });
    const res = await h.deliver(envelope({ id: "evt-expired-1", text: CODE }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: false, eventType: "pairing_expired", reason: "code_expired" });
    assert.equal(h.pool.calls.filter((c) => c.sql.startsWith("update")).length, 0, "no update issued");
    const evt = h.events.find((e) => e.eventType === "pairing_expired");
    assert.ok(evt);
    assert.equal(evt.provider, "telnyx");
    assert.equal(evt.studentId, null);
    assert.equal(h.workflowRuns.length, 0);
  });
});
