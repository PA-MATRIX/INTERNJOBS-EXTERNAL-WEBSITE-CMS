// v1.7 Phase 44-02 (OPT-01 outbound half): the Telnyx provider never sends to
// an opted-out number.
// Run: node --test src/sms/telnyx-optout.test.mjs (from apps/app)
//
// No network and no secrets: fetch is injected and the API base is a .test
// host. The routeAndSend case uses the REAL router from ../outbound.mjs to
// prove the agent workflow's only send path is guarded with no router change.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelnyxSmsProvider } from "./telnyx.mjs";
import { routeAndSend } from "../outbound.mjs";

const OPTED_OUT = "+15555550123";
const NOT_OPTED_OUT = "+15555550124";

const CONFIG = {
  telnyx: {
    apiKey: "test-key",
    fromNumber: "+15555550100",
    publicKey: "",
    apiBase: "https://api.telnyx.test",
    messagingProfileId: "",
  },
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function harness({ isOptedOut, respond } = {}) {
  const order = [];
  const fetchCalls = [];
  const guardCalls = [];
  const fetchImpl = async (url, init) => {
    order.push("fetch");
    fetchCalls.push({ url, init });
    return respond ? respond() : jsonResponse(200, { data: { id: "out-1" } });
  };
  const guard = async (phone) => {
    order.push("guard");
    guardCalls.push(phone);
    return isOptedOut ? isOptedOut(phone) : phone === OPTED_OUT;
  };
  const provider = createTelnyxSmsProvider(CONFIG, { fetchImpl, isOptedOut: guard });
  return { provider, order, fetchCalls, guardCalls };
}

test("never sends to an opted-out number", async () => {
  const h = harness();
  const r = await h.provider.sendSms("5555550123", "hi");
  assert.equal(r.status, "provider_error");
  assert.equal(r.providerMessageId, null);
  assert.equal(r.metadata.opted_out, true);
  assert.equal(r.metadata.reason, "recipient_opted_out");
  assert.equal(h.fetchCalls.length, 0, "fetch must not be called for an opted-out recipient");

  // Negative control: a number that is not opted out reaches fetch and is sent.
  const ok = await h.provider.sendSms("5555550124", "hi");
  assert.equal(ok.status, "sent");
  assert.equal(h.fetchCalls.length, 1);
  assert.equal(JSON.parse(h.fetchCalls[0].init.body).to, NOT_OPTED_OUT);
});

test("guard receives the normalised E.164 and runs before fetch", async () => {
  const h = harness({ isOptedOut: async () => false });
  await h.provider.sendSms("5555550123", "hi");
  assert.deepEqual(h.guardCalls, [OPTED_OUT]);
  assert.deepEqual(h.order, ["guard", "fetch"]);
});

test("guard failure fails closed", async () => {
  const h = harness({
    isOptedOut: async () => {
      throw new Error("db down for +15555550124");
    },
  });
  const r = await h.provider.sendSms(NOT_OPTED_OUT, "hi");
  assert.equal(r.status, "provider_error");
  assert.equal(r.providerMessageId, null);
  assert.equal(r.metadata.reason, "opt_out_check_failed");
  assert.equal(h.fetchCalls.length, 0, "fetch must not be called when the opt-out check fails");
  // No error text (which could carry a phone number) leaks into the result.
  assert.doesNotMatch(JSON.stringify(r), /5555550124/);
});

test("guard cannot be omitted", () => {
  const fetchImpl = async () => jsonResponse(200, { data: { id: "x" } });
  assert.throws(() => createTelnyxSmsProvider(CONFIG, { fetchImpl }), /telnyx_opt_out_guard_required/);
  assert.throws(() => createTelnyxSmsProvider(CONFIG), /telnyx_opt_out_guard_required/);
  assert.throws(() => createTelnyxSmsProvider(CONFIG, { fetchImpl, isOptedOut: true }), /telnyx_opt_out_guard_required/);
});

test("Telnyx 40300 is recorded as opted out, not retried", async () => {
  for (const code of [40300, "40300"]) {
    const h = harness({
      isOptedOut: async () => false,
      respond: () => jsonResponse(403, { errors: [{ code, title: "Blocked due to STOP message" }] }),
    });
    const r = await h.provider.sendSms(NOT_OPTED_OUT, "hi");
    assert.equal(r.status, "provider_error");
    assert.equal(r.metadata.opted_out, true);
    assert.equal(String(r.metadata.errorCode), "40300");
    assert.equal(r.metadata.status, 403);
    assert.equal(h.fetchCalls.length, 1, "40300 must not be retried");
  }

  // Negative control: a different 4xx error code is NOT reported as opted out.
  const other = harness({
    isOptedOut: async () => false,
    respond: () => jsonResponse(422, { errors: [{ code: "40310" }] }),
  });
  const r2 = await other.provider.sendSms(NOT_OPTED_OUT, "hi");
  assert.equal(r2.status, "provider_error");
  assert.notEqual(r2.metadata.opted_out, true);
});

test("routeAndSend surfaces an opted-out recipient as a failed draft", async () => {
  const h = harness();
  const draft = { channel: "sms", channel_address: OPTED_OUT, body: "hi" };
  await assert.rejects(
    () => routeAndSend(draft, { smsProvider: h.provider, config: {} }),
    (err) => {
      assert.match(err.message, /sms_provider_error/);
      assert.match(err.message, /opted_out/);
      return true;
    },
  );
  assert.equal(h.fetchCalls.length, 0);

  // Negative control: the same router sends to a number that is not opted out.
  const id = await routeAndSend(
    { channel: "sms", channel_address: NOT_OPTED_OUT, body: "hi" },
    { smsProvider: h.provider, config: {} },
  );
  assert.equal(id, "out-1");
  assert.equal(h.fetchCalls.length, 1);
});
