// v1.7 Phase 44-01 (SMS-01 verify half, SMS-02 send): Telnyx SMS provider.
// Run: node --test src/sms/telnyx.test.mjs (from apps/app)
//
// No network and no secrets: an Ed25519 keypair is generated per run and
// fetch is injected. The API base is a .test host that never resolves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createTelnyxSmsProvider, verifyTelnyxSignature } from "./telnyx.mjs";

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  return { rawPub, privateKey };
}

const MAIN = keypair();
const OTHER = keypair();
const NOW_SEC = 1_800_000_000;
const NOW_MS = NOW_SEC * 1000;
const API_KEY = "test-key";

function makeConfig(overrides = {}) {
  return {
    telnyx: {
      apiKey: API_KEY,
      fromNumber: "+15555550100",
      publicKey: MAIN.rawPub,
      apiBase: "https://api.telnyx.test",
      messagingProfileId: "",
      ...overrides,
    },
  };
}

function sigOver(message, privateKey = MAIN.privateKey) {
  return sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64");
}

function signed(rawBody, ts, privateKey = MAIN.privateKey) {
  return {
    "telnyx-timestamp": String(ts),
    "telnyx-signature-ed25519": sigOver(`${ts}|${rawBody}`, privateKey),
  };
}

function provider(overrides = {}, deps = {}) {
  return createTelnyxSmsProvider(makeConfig(overrides), { now: () => NOW_MS, isOptedOut: async () => false, ...deps });
}

const BODY = JSON.stringify({ data: { event_type: "message.received", id: "evt-1" } });

test("verify: correctly signed requests inside the 300 s window are accepted", () => {
  const p = provider();
  assert.deepEqual(p.verifyWebhook({ headers: signed(BODY, NOW_SEC) }, BODY), { ok: true, mode: "ed25519" });
  const ts = NOW_SEC - 299;
  assert.deepEqual(p.verifyWebhook({ headers: signed(BODY, ts) }, BODY), { ok: true, mode: "ed25519" });
  const future = NOW_SEC + 299;
  assert.deepEqual(p.verifyWebhook({ headers: signed(BODY, future) }, BODY), { ok: true, mode: "ed25519" });
});

test("verify: forged, tampered, stale and unkeyed requests are all rejected", () => {
  const p = provider();
  const reject = (headers, body = BODY, prov = p) => {
    const r = prov.verifyWebhook({ headers }, body);
    assert.equal(r.ok, false, `expected rejection, got ${JSON.stringify(r)}`);
    return r;
  };

  // Signed with a different Ed25519 key.
  assert.equal(reject(signed(BODY, NOW_SEC, OTHER.privateKey)).reason, "invalid_signature");
  // Body altered after signing.
  reject(signed(BODY, NOW_SEC), BODY.replace("evt-1", "evt-2"));
  // 301 s old and 301 s in the future.
  assert.equal(reject(signed(BODY, NOW_SEC - 301)).reason, "timestamp_outside_tolerance");
  assert.equal(reject(signed(BODY, NOW_SEC + 301)).reason, "timestamp_outside_tolerance");
  // Signature over the body WITHOUT the `${timestamp}|` prefix.
  reject({ "telnyx-timestamp": String(NOW_SEC), "telnyx-signature-ed25519": sigOver(BODY) });
  // Missing signature header / missing timestamp header.
  reject({ "telnyx-timestamp": String(NOW_SEC) });
  reject({ "telnyx-signature-ed25519": signed(BODY, NOW_SEC)["telnyx-signature-ed25519"] });
  // Non-numeric timestamp, even when the signature covers it.
  reject({ "telnyx-timestamp": "abc", "telnyx-signature-ed25519": sigOver(`abc|${BODY}`) });
  // Public key unset: fail closed, even for a perfectly signed request.
  for (const publicKey of ["", undefined, null]) {
    const unkeyed = provider({ publicKey });
    assert.deepEqual(reject(signed(BODY, NOW_SEC), BODY, unkeyed), { ok: false, reason: "public_key_missing" });
  }
  // No telnyx block at all.
  const bare = createTelnyxSmsProvider({}, { now: () => NOW_MS, isOptedOut: async () => false });
  assert.deepEqual(bare.verifyWebhook({ headers: signed(BODY, NOW_SEC) }, BODY), {
    ok: false,
    reason: "public_key_missing",
  });
});

test("verify: malformed key material never throws", () => {
  const headers = signed(BODY, NOW_SEC);
  for (const publicKey of [
    "!!!not base64!!!",
    Buffer.alloc(31, 7).toString("base64"),
    Buffer.alloc(33, 7).toString("base64"),
    "AAAA",
  ]) {
    const p = provider({ publicKey });
    let r;
    assert.doesNotThrow(() => {
      r = p.verifyWebhook({ headers }, BODY);
    }, `threw for key ${publicKey}`);
    assert.equal(r.ok, false);
  }
  // Malformed signature (not 64 bytes) on a good key.
  const p = provider();
  const r = p.verifyWebhook({ headers: { "telnyx-timestamp": String(NOW_SEC), "telnyx-signature-ed25519": "AAAA" } }, BODY);
  assert.equal(r.ok, false);
});

test("verifyTelnyxSignature: export-level function returns the same results", () => {
  const h = signed(BODY, NOW_SEC);
  const args = {
    publicKeyB64: MAIN.rawPub,
    sigB64: h["telnyx-signature-ed25519"],
    timestamp: h["telnyx-timestamp"],
    rawBody: BODY,
    nowSec: NOW_SEC,
    toleranceSec: 300,
  };
  assert.deepEqual(verifyTelnyxSignature(args), { ok: true, mode: "ed25519" });
  assert.deepEqual(verifyTelnyxSignature({ ...args, publicKeyB64: "" }), { ok: false, reason: "public_key_missing" });
  assert.equal(verifyTelnyxSignature({ ...args, rawBody: `${BODY} ` }).ok, false);
  assert.equal(verifyTelnyxSignature({ ...args, nowSec: NOW_SEC + 301 }).ok, false);
  assert.equal(verifyTelnyxSignature({ ...args, publicKeyB64: "AAAA" }).ok, false);
  // Default tolerance is 300 s.
  const { toleranceSec, ...noTol } = args;
  assert.equal(verifyTelnyxSignature({ ...noTol, nowSec: NOW_SEC + 300 }).ok, true);
  assert.equal(verifyTelnyxSignature({ ...noTol, nowSec: NOW_SEC + 301 }).ok, false);
});

function receivedEnvelope(text = "hello there", overrides = {}) {
  return {
    data: {
      event_type: "message.received",
      id: "evt-0f1e2d3c",
      occurred_at: "2026-10-14T12:00:00.000+00:00",
      record_type: "event",
      payload: {
        id: "msg-40017a2b",
        direction: "inbound",
        type: "SMS",
        from: { phone_number: "+14155550123", carrier: "T-Mobile USA", line_type: "Wireless" },
        to: [{ phone_number: "+14063210019", status: "webhook_delivered" }],
        text,
        messaging_profile_id: "mp-123",
        ...overrides,
      },
    },
    meta: { attempt: 1, delivered_to: "https://app.internjobs.ai/webhooks/telnyx/sms" },
  };
}

test("parseInbound: message.received maps to the shared InboundMessage shape", () => {
  const msg = provider().parseInbound(receivedEnvelope());
  assert.equal(msg.providerEventId, "evt-0f1e2d3c"); // data.id, not payload.id
  assert.notEqual(msg.providerEventId, "msg-40017a2b");
  assert.equal(msg.text, "hello there");
  assert.equal(msg.code, "");
  assert.equal(msg.channelType, "sms");
  assert.equal(msg.channelAddress, "+14155550123");
  assert.equal(msg.eventType, "message.received");
  assert.equal(msg.metadata.provider, "telnyx");
  assert.equal(msg.metadata.channel, "sms");
  assert.equal(msg.metadata.hasText, true);
  assert.equal(msg.metadata.eventType, "message.received");
  assert.equal(msg.metadata.messageId, "msg-40017a2b");
  assert.equal(msg.metadata.messagingProfileId, "mp-123");
  assert.equal(msg.metadata.occurredAt, "2026-10-14T12:00:00.000+00:00");
  assert.equal(msg.metadata.receivedAt, new Date(NOW_MS).toISOString());
  // The message body is never copied into metadata.
  assert.ok(!JSON.stringify(msg.metadata).includes("hello there"));
});

test("parseInbound: from number is normalised to E.164", () => {
  const msg = provider().parseInbound(receivedEnvelope("hi", { from: { phone_number: "4155550123" } }));
  assert.equal(msg.channelAddress, "+14155550123");
});

test("parseInbound: START- pairing code is extracted", () => {
  assert.equal(provider().parseInbound(receivedEnvelope("START-AB12CD")).code, "START-AB12CD");
});

test("parseInbound: message.finalized keeps its eventType so the route can ignore it", () => {
  const env = receivedEnvelope("outbound text", { direction: "outbound" });
  env.data.event_type = "message.finalized";
  const msg = provider().parseInbound(env);
  assert.equal(msg.eventType, "message.finalized");
  assert.equal(msg.metadata.eventType, "message.finalized");
});

test("parseInbound: an envelope without data does not throw", () => {
  for (const payload of [{}, { meta: {} }, { data: null }, { data: { payload: null } }]) {
    let msg;
    assert.doesNotThrow(() => {
      msg = provider().parseInbound(payload);
    });
    assert.equal(msg.eventType, "");
    assert.equal(msg.text, "");
    assert.equal(msg.code, "");
    assert.equal(msg.channelAddress, "");
    assert.equal(msg.metadata.provider, "telnyx");
    assert.equal(typeof msg.providerEventId, "string");
    assert.ok(msg.providerEventId.length > 0);
  }
});

function recordingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    if (typeof response === "function") return response(url, init);
    return response;
  };
  return { calls, fetchImpl };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("sendSms: POST /v2/messages from the configured number", async () => {
  const { calls, fetchImpl } = recordingFetch(() =>
    jsonResponse(200, { data: { id: "out-123", type: "SMS", direction: "outbound" } }),
  );
  const p = provider({}, { fetchImpl });
  const result = await p.sendSms("4155550123", "hello");
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(String(url), "https://api.telnyx.test/v2/messages");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.ok(init.signal instanceof AbortSignal, "a timeout AbortSignal is passed");
  const body = JSON.parse(init.body);
  assert.equal(body.from, "+15555550100"); // the configured number, NOT +14063210019
  assert.notEqual(body.from, "+14063210019");
  assert.equal(body.to, "+14155550123");
  assert.equal(body.text, "hello");
  assert.ok(!("messaging_profile_id" in body), "profile id omitted when not configured");
  assert.deepEqual(result, {
    providerMessageId: "out-123",
    status: "sent",
    metadata: { providerMessageId: "out-123", provider: "telnyx" },
  });
});

test("sendSms: messaging_profile_id is sent only when configured", async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, { data: { id: "out-1" } }));
  await provider({ messagingProfileId: "mp-9" }, { fetchImpl }).sendSms("+14155550123", "x");
  assert.equal(JSON.parse(calls[0][1].body).messaging_profile_id, "mp-9");
});

test("sendSms: failure paths", async () => {
  // HTTP 422 with a Telnyx error code.
  {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse(422, { errors: [{ code: "40008", title: "x" }, { code: "99999" }] }),
    );
    const r = await provider({}, { fetchImpl }).sendSms("+14155550123", "x");
    assert.equal(r.status, "provider_error");
    assert.equal(r.providerMessageId, null);
    assert.equal(r.metadata.status, 422);
    assert.equal(r.metadata.errorCode, "40008");
  }
  // HTTP 500 with a non-JSON body.
  {
    const { fetchImpl } = recordingFetch(() => new Response("upstream down", { status: 500 }));
    const r = await provider({}, { fetchImpl }).sendSms("+14155550123", "x");
    assert.equal(r.status, "provider_error");
    assert.equal(r.metadata.status, 500);
    assert.equal(r.metadata.errorCode, null);
  }
  // Thrown fetch: only the error message, never the key.
  {
    const { fetchImpl } = recordingFetch(() => {
      throw new Error("connect ECONNREFUSED");
    });
    const r = await provider({}, { fetchImpl }).sendSms("+14155550123", "x");
    assert.equal(r.status, "provider_error");
    assert.deepEqual(r.metadata, { error: "connect ECONNREFUSED" });
    assert.ok(!JSON.stringify(r).includes(API_KEY));
  }
  // Missing API key: skipped, fetch never called.
  {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, { data: { id: "nope" } }));
    const r = await provider({ apiKey: "" }, { fetchImpl }).sendSms("+14155550123", "x");
    assert.equal(r.status, "skipped_configuration_missing");
    assert.equal(r.metadata.reason, "telnyx_not_configured");
    assert.equal(calls.length, 0);
  }
  // Missing from-number: skipped, fetch never called.
  {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, { data: { id: "nope" } }));
    const r = await provider({ fromNumber: "" }, { fetchImpl }).sendSms("+14155550123", "x");
    assert.equal(r.status, "skipped_configuration_missing");
    assert.equal(calls.length, 0);
  }
  // E-mail destination: provider_error, fetch never called.
  {
    const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, { data: { id: "nope" } }));
    const r = await provider({}, { fetchImpl }).sendSms("student@example.com", "x");
    assert.equal(r.status, "provider_error");
    assert.equal(r.metadata.reason, "invalid_destination");
    assert.equal(calls.length, 0);
  }
  // Nothing in any failure result carries the key.
});

test("sendSms: a 2000-character body is sent as at most 1580 ASCII-terminated characters", async () => {
  const { calls, fetchImpl } = recordingFetch(() => jsonResponse(200, { data: { id: "out-long" } }));
  await provider({}, { fetchImpl }).sendSms("+14155550123", "a".repeat(2000));
  const text = JSON.parse(calls[0][1].body).text;
  assert.ok(text.length <= 1580, `length ${text.length}`);
  assert.ok(text.endsWith("..."));
  // A body at the cap is sent unchanged.
  await provider({}, { fetchImpl }).sendSms("+14155550123", "b".repeat(1580));
  assert.equal(JSON.parse(calls[1][1].body).text, "b".repeat(1580));
});

test("listen is a no-op (webhook-driven provider)", async () => {
  assert.equal(await provider().listen(), undefined);
});
