// v1.7 Phase 44-03: characterization e2e for POST /webhooks/mac-bridge.
//
// Spawns the REAL server (src/server.mjs) in a clean environment with
// SMS_PROVIDER=mac-bridge, BRIDGE_HMAC_SECRET set and NO DATABASE_URL, so the
// in-memory store is used (store.pool is undefined and the START-code branch
// falls through to confirmPairingCode). The expected bodies are the ACTUAL
// outputs of the route before the 44-03 extraction (baseline captured in
// .planning/.../evidence/44-03-baseline-e2e-before.txt); this file must stay
// unchanged across the extraction so the before/after runs are comparable.
//
// No outbound network: BRIDGE_URL is unset, so every sendSms returns
// skipped_configuration_missing without calling fetch.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 3931;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "test-bridge-secret";

let child;

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

function sign(raw) {
  return `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
}

async function post(body, { signature } = {}) {
  const raw = JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if (signature !== undefined) headers["x-bridge-signature"] = signature;
  const res = await fetch(`${BASE}/webhooks/mac-bridge`, { method: "POST", headers, body: raw });
  return { status: res.status, body: await res.json() };
}

function message(providerEventId, text, from = "+15555550123") {
  return { providerEventId, platform: "imessage", from, text, ts: "2026-10-15T00:00:00Z" };
}

before(async () => {
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
    },
  });
  await waitForHealth(`${BASE}/healthz`);
});

after(() => {
  child?.kill();
});

test("unsigned POST is 401 missing_signature", async () => {
  const r = await post(message("e2e-unsigned", "hello there"));
  assert.equal(r.status, 401);
  assert.deepEqual(r.body, { error: "unauthorized", reason: "missing_signature" });
});

test("wrong signature (right length) is 401 invalid_signature", async () => {
  const r = await post(message("e2e-wrongsig", "hello there"), { signature: `sha256=${"0".repeat(64)}` });
  assert.equal(r.status, 401);
  assert.deepEqual(r.body, { error: "unauthorized", reason: "invalid_signature" });
});

test("signed unknown-sender message is 200 unmatched_inbound", async () => {
  const body = message("e2e-unknown-1", "hello there");
  const r = await post(body, { signature: sign(JSON.stringify(body)) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, duplicate: false, eventType: "unmatched_inbound" });
});

test("same providerEventId again is 200 duplicate", async () => {
  const body = message("e2e-unknown-1", "hello there");
  const r = await post(body, { signature: sign(JSON.stringify(body)) });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, duplicate: true });
});

test("START code with no matching code (no DB) is 422 pairing_code_invalid", async () => {
  const body = message("e2e-start-1", "START-AB12CD");
  const r = await post(body, { signature: sign(JSON.stringify(body)) });
  assert.equal(r.status, 422);
  assert.deepEqual(r.body, { ok: false, duplicate: false, error: "pairing_code_invalid" });
});
