// v1.7 Phase 44-01: config.telnyx block and SMS_PROVIDER=telnyx validation.
// Run: node --test src/config.test.mjs (from apps/app)
//
// Every case passes an explicit env object; process.env is never read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getConfig, getMissingProviderConfig } from "./config.mjs";

const BASE = { CLERK_PUBLISHABLE_KEY: "pk", DATABASE_URL: "postgres://x", AGENT_NUMBER: "+14063210019" };
const TELNYX_COMPLETE = {
  ...BASE,
  SMS_PROVIDER: "telnyx",
  TELNYX_API_KEY: "key-abc",
  TELNYX_FROM_NUMBER: "+14063210019",
  TELNYX_WEBHOOK_PUBLIC_KEY: "pub-abc",
};

const telnyxEntries = (env) => getMissingProviderConfig(getConfig(env)).filter((m) => /TELNYX/.test(m));

test("SMS_PROVIDER=telnyx, fully configured: no TELNYX entries", () => {
  assert.deepEqual(telnyxEntries(TELNYX_COMPLETE), []);
});

test("SMS_PROVIDER=telnyx: each missing key is named", () => {
  for (const key of ["TELNYX_API_KEY", "TELNYX_FROM_NUMBER", "TELNYX_WEBHOOK_PUBLIC_KEY"]) {
    const env = { ...TELNYX_COMPLETE };
    delete env[key];
    const entries = telnyxEntries(env);
    assert.ok(entries.includes(key), `${key} not named: ${JSON.stringify(entries)}`);
  }
});

test("SMS_PROVIDER=telnyx: provider name is case-insensitive", () => {
  const env = { ...TELNYX_COMPLETE, SMS_PROVIDER: "Telnyx" };
  delete env.TELNYX_API_KEY;
  assert.ok(telnyxEntries(env).includes("TELNYX_API_KEY"));
});

test("SMS_PROVIDER=telnyx: from number must equal AGENT_NUMBER (D27)", () => {
  const entries = telnyxEntries({ ...TELNYX_COMPLETE, TELNYX_FROM_NUMBER: "+15555550100" });
  assert.ok(
    entries.some((m) => /TELNYX_FROM_NUMBER.*AGENT_NUMBER/.test(m)),
    `no mismatch entry: ${JSON.stringify(entries)}`,
  );
});

test("SMS_PROVIDER=telnyx: formatting differences are not a mismatch", () => {
  assert.deepEqual(telnyxEntries({ ...TELNYX_COMPLETE, TELNYX_FROM_NUMBER: "+1 (406) 321-0019" }), []);
  assert.deepEqual(telnyxEntries({ ...TELNYX_COMPLETE, AGENT_NUMBER: "4063210019" }), []);
});

test("SMS_PROVIDER=mac-bridge: no TELNYX entries (negative control)", () => {
  assert.deepEqual(telnyxEntries({ ...BASE, SMS_PROVIDER: "mac-bridge", BRIDGE_URL: "https://b", BRIDGE_HMAC_SECRET: "s" }), []);
  assert.deepEqual(telnyxEntries({ ...BASE }), []); // default provider (spectrum)
});

test("SMS_PROVIDER=mac-bridge: bridge requirements unchanged", () => {
  const missing = getMissingProviderConfig(getConfig({ ...BASE, SMS_PROVIDER: "mac-bridge" }));
  assert.ok(missing.includes("BRIDGE_URL or MAC_BRIDGE_URL"));
  assert.ok(missing.includes("BRIDGE_HMAC_SECRET"));
  const ok = getMissingProviderConfig(
    getConfig({ ...BASE, SMS_PROVIDER: "mac-bridge", BRIDGE_URL: "https://b", BRIDGE_HMAC_SECRET: "s" }),
  );
  assert.ok(!ok.some((m) => /BRIDGE/.test(m)));
});

test("telnyx config block: defaults and overrides", () => {
  const empty = getConfig({});
  assert.deepEqual(empty.telnyx, {
    apiKey: "",
    fromNumber: "",
    messagingProfileId: "",
    publicKey: "",
    apiBase: "https://api.telnyx.com",
  });
  const c = getConfig({
    TELNYX_API_KEY: "k",
    TELNYX_FROM_NUMBER: "+14063210019",
    TELNYX_MESSAGING_PROFILE_ID: "mp",
    TELNYX_WEBHOOK_PUBLIC_KEY: "pub",
    TELNYX_API_BASE: "http://127.0.0.1:9999",
  });
  assert.deepEqual(c.telnyx, {
    apiKey: "k",
    fromNumber: "+14063210019",
    messagingProfileId: "mp",
    publicKey: "pub",
    apiBase: "http://127.0.0.1:9999",
  });
});

test("telnyx secrets land only in config.telnyx", () => {
  const c = getConfig({ TELNYX_API_KEY: "sekrit-api-xyz", TELNYX_WEBHOOK_PUBLIC_KEY: "sekrit-pub-xyz" });
  const { telnyx, ...rest } = c;
  const serialized = JSON.stringify(rest);
  assert.ok(!serialized.includes("sekrit-api-xyz"));
  assert.ok(!serialized.includes("sekrit-pub-xyz"));
  assert.equal(telnyx.apiKey, "sekrit-api-xyz");
});
