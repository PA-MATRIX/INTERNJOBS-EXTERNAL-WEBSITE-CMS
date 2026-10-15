// v1.7 Phase 44-01: characterization test for the mac-bridge SMS provider.
// Run: node --test src/sms/mac-bridge.test.mjs (from apps/app)
//
// Written and run GREEN against the UNCHANGED mac-bridge.mjs before
// extractPairingCode moved to sms/shared.mjs. It pins the provider's
// observable output so the move is proven behaviour-preserving.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createMacBridgeSmsProvider } from "./mac-bridge.mjs";

const SECRET = "s";
const provider = createMacBridgeSmsProvider({ macBridge: { url: "", hmacSecret: SECRET } });

function base(text, extra = {}) {
  return { text, from: "+15555550123", platform: "imessage", providerEventId: "e1", ...extra };
}

test("parseInbound: START- pairing code, imessage channel, mac-bridge provider", () => {
  const msg = provider.parseInbound(base("START-AB12CD"));
  assert.equal(msg.code, "START-AB12CD");
  assert.equal(msg.text, "START-AB12CD");
  assert.equal(msg.channelType, "imessage");
  assert.equal(msg.channelAddress, "+15555550123");
  assert.equal(msg.providerEventId, "e1");
  assert.equal(msg.metadata.provider, "mac-bridge");
  assert.equal(msg.metadata.channel, "imessage");
  assert.equal(msg.metadata.hasText, true);
});

test("parseInbound: lower-case START- code is upper-cased", () => {
  assert.equal(provider.parseInbound(base("start-ab12cd")).code, "START-AB12CD");
});

test("parseInbound: 8-hex code inside a sentence", () => {
  assert.equal(provider.parseInbound(base("my code is ab12cd34")).code, "AB12CD34");
});

test("parseInbound: IJ- code inside a sentence", () => {
  assert.equal(provider.parseInbound(base("IJ-ABC123 please")).code, "IJ-ABC123");
});

test("parseInbound: plain text has no code", () => {
  const msg = provider.parseInbound(base("hello"));
  assert.equal(msg.code, "");
  assert.equal(msg.text, "hello");
});

test("parseInbound: START- wins over an 8-hex code in the same text", () => {
  assert.equal(provider.parseInbound(base("ab12cd34 START-ZZ99YY")).code, "START-ZZ99YY");
});

test("parseInbound: platform sms gives channelType sms", () => {
  const msg = provider.parseInbound(base("hi", { platform: "SMS" }));
  assert.equal(msg.channelType, "sms");
  assert.equal(msg.metadata.channel, "sms");
});

test("parseInbound: missing providerEventId falls back to a sha256 hex", () => {
  const msg = provider.parseInbound({ text: "hi", from: "+15555550123", platform: "sms" });
  assert.match(msg.providerEventId, /^[0-9a-f]{64}$/);
});

test("parseInbound: empty text is hasText false", () => {
  const msg = provider.parseInbound(base(""));
  assert.equal(msg.metadata.hasText, false);
  assert.equal(msg.code, "");
});

test("verifyWebhook: valid sha256 HMAC over raw body is accepted", () => {
  const raw = JSON.stringify({ text: "hi" });
  const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
  assert.deepEqual(provider.verifyWebhook({ headers: { "x-bridge-signature": `sha256=${sig}` } }, raw), {
    ok: true,
    mode: "hmac-sha256",
  });
});

test("verifyWebhook: wrong digest is invalid_signature", () => {
  const raw = JSON.stringify({ text: "hi" });
  const sig = createHmac("sha256", "other").update(raw).digest("hex");
  assert.deepEqual(provider.verifyWebhook({ headers: { "x-bridge-signature": `sha256=${sig}` } }, raw), {
    ok: false,
    reason: "invalid_signature",
  });
});

test("verifyWebhook: absent header is missing_signature", () => {
  assert.deepEqual(provider.verifyWebhook({ headers: {} }, "{}"), { ok: false, reason: "missing_signature" });
});

test("verifyWebhook: no secret configured is bridge_secret_missing (fails closed)", () => {
  const unkeyed = createMacBridgeSmsProvider({ macBridge: { url: "", hmacSecret: "" } });
  assert.deepEqual(unkeyed.verifyWebhook({ headers: { "x-bridge-signature": "sha256=00" } }, "{}"), {
    ok: false,
    reason: "bridge_secret_missing",
  });
});

test("sendSms: unconfigured bridge is skipped_configuration_missing", async () => {
  const result = await provider.sendSms("+15555550123", "hi");
  assert.equal(result.status, "skipped_configuration_missing");
  assert.equal(result.metadata.reason, "mac_bridge_not_configured");
});
