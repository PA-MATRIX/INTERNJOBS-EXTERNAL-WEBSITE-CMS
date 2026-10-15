// v1.7 Phase 44-05: every TELNYX_* variable the app reads is documented in
// apps/app/.env.example, and the SMS_PROVIDER=telnyx option is shown.
//
// Run: node --test src/config-env-example.test.mjs (from apps/app)
//
// The variables getConfig reads are captured by passing a recording Proxy as
// env, so a new TELNYX_* read added to config.mjs without a matching
// .env.example line fails this test (negative control in
// evidence/44-05-negctl-env.txt).
//
// Documented = a `KEY=` line, OR a commented `# KEY=` line. The commented form
// is accepted for optional variables a deployment normally leaves unset; the
// Telnyx block in .env.example uses active `KEY=` lines with empty values.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getConfig } from "./config.mjs";

function readKeys() {
  const seen = new Set();
  const env = new Proxy(
    {},
    {
      get: (_t, k) => {
        if (typeof k === "string") seen.add(k);
        return undefined;
      },
    },
  );
  getConfig(env);
  return seen;
}

function parseEnvExample() {
  const text = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const lines = text.split(/\r?\n/);
  const assigned = new Map();
  for (const line of lines) {
    const m = line.match(/^\s*(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) assigned.set(m[2], { value: m[3], commented: Boolean(m[1]) });
  }
  return { text, lines, assigned };
}

test("every TELNYX_* variable getConfig reads is documented in .env.example", () => {
  const read = [...readKeys()].filter((k) => k.startsWith("TELNYX_")).sort();
  assert.ok(read.length >= 5, `getConfig reads the Telnyx variables (saw ${read.join(", ")})`);
  const { assigned } = parseEnvExample();
  const missing = read.filter((k) => !assigned.has(k));
  assert.deepEqual(missing, [], `undocumented TELNYX_* variables: ${missing.join(", ")}`);
  for (const k of read) {
    assert.equal(assigned.get(k).value.trim(), "", `${k} must have an empty value in .env.example (names only)`);
  }
});

test("SMS_PROVIDER=telnyx is a documented option and BRIDGE_* stay until Phase 47", () => {
  const { lines, assigned } = parseEnvExample();
  assert.ok(assigned.has("SMS_PROVIDER"), "SMS_PROVIDER is documented");
  const optionShown = lines.some(
    (l) => /^\s*#?\s*SMS_PROVIDER=telnyx\b/.test(l) || (/^\s*#/.test(l) && /mac-bridge\b.*\|\s*telnyx\b/.test(l)),
  );
  assert.ok(optionShown, "a line documents SMS_PROVIDER=telnyx (or a 'mac-bridge | telnyx' option comment)");
  assert.ok(assigned.has("BRIDGE_URL"), "BRIDGE_URL still documented");
  assert.ok(assigned.has("BRIDGE_HMAC_SECRET"), "BRIDGE_HMAC_SECRET still documented");
});
