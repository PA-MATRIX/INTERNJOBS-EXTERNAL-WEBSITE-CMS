// v1.7 Phase 44-04: SMS provider registry (src/sms/registry.mjs).
// Run: node --test src/sms/registry.test.mjs (from apps/app)
//
// No network: fetch is injected through the registry deps; the API base is a
// .test host and the in-memory store supplies the opt-out table.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../store.mjs";
import { createSmsProviders, isTelnyxRouteEnabled, buildTelnyxInboundOptions } from "./registry.mjs";
import { SMS_HARD_BLOCK_REPLY } from "./inbound-handler.mjs";

const CONFIG = {
  smsProviderName: "telnyx",
  photon: { fromNumber: "", webhookSecret: "" },
  macBridge: { url: "", hmacSecret: "" },
  telnyx: {
    apiKey: "test-key",
    fromNumber: "+15555550100",
    publicKey: "",
    apiBase: "https://api.telnyx.test",
    messagingProfileId: "",
  },
};

test("createSmsProviders returns spectrum, mac-bridge and telnyx providers", () => {
  const providers = createSmsProviders(CONFIG, { store: createStore({ databaseUrl: "" }) });
  for (const name of ["spectrum", "mac-bridge", "telnyx"]) {
    assert.ok(providers[name], `${name} provider exists`);
    for (const fn of ["sendSms", "verifyWebhook", "parseInbound"]) {
      assert.equal(typeof providers[name][fn], "function", `${name}.${fn}`);
    }
  }
});

test("telnyx provider is wired to the store opt-out table", async () => {
  const store = createStore({ databaseUrl: "" });
  const fetchCalls = [];
  const fetchImpl = async (url, init) => {
    fetchCalls.push({ url, init });
    return new Response(JSON.stringify({ data: { id: "out-1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const { telnyx } = createSmsProviders(CONFIG, { store, fetchImpl });

  await store.optOuts.recordOptOut({ phone: "+15555550123" });
  const blocked = await telnyx.sendSms("+15555550123", "hi");
  assert.equal(blocked.status, "provider_error");
  assert.equal(blocked.metadata.opted_out, true);
  assert.equal(fetchCalls.length, 0, "fetch must not be called for an opted-out number");

  // Negative control: a different number reaches fetch.
  const ok = await telnyx.sendSms("+15555550124", "hi");
  assert.equal(ok.status, "sent");
  assert.equal(fetchCalls.length, 1);
});

test("a store without optOuts.isOptedOut cannot build the telnyx provider (44-02 guard)", () => {
  assert.throws(() => createSmsProviders(CONFIG, { store: {} }), /telnyx_opt_out_guard_required/);
  assert.throws(() => createSmsProviders(CONFIG, { store: { optOuts: {} } }), /telnyx_opt_out_guard_required/);
});

test("isTelnyxRouteEnabled follows TELNYX_WEBHOOK_PUBLIC_KEY, not SMS_PROVIDER (D34)", () => {
  assert.equal(isTelnyxRouteEnabled({ telnyx: { publicKey: "k" }, smsProviderName: "mac-bridge" }), true);
  assert.equal(isTelnyxRouteEnabled({ telnyx: { publicKey: "" }, smsProviderName: "telnyx" }), false);
  assert.equal(isTelnyxRouteEnabled({ smsProviderName: "telnyx" }), false);
});

test("buildTelnyxInboundOptions is the exact Telnyx handler option set", () => {
  const opts = buildTelnyxInboundOptions();
  assert.deepEqual(opts, {
    providerName: "telnyx",
    hardBlockReply: SMS_HARD_BLOCK_REPLY,
    ackEarly: true,
    earlyDedupe: true,
    acceptEventTypes: ["message.received"],
    keywordHandling: true,
    suppressShortCodeReplies: true,
  });
  assert.match(opts.hardBlockReply, /^[\x20-\x7e]+$/);
});
