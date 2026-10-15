// v1.7 Phase 44-04 (SMS-03): store.hasMessagingEvent, the lookup behind the
// Telnyx early-dedupe option of the shared inbound handler.
// Run: node --test src/store.test.mjs (from apps/app)
//
// No database: the memory store is used directly, and the Postgres store's
// pool is swapped for a fake that records [sql, params] (the real pool is
// ended first and never connects).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.mjs";

const norm = (sql) => String(sql).replace(/\s+/g, " ").trim();

test("hasMessagingEvent", async (t) => {
  await t.test("memory store: true after writeMessagingEvent for the same id, false for another", async () => {
    const store = createStore({ databaseUrl: "" });
    assert.equal(typeof store.hasMessagingEvent, "function");
    assert.equal(await store.hasMessagingEvent("telnyx", "evt-a"), false);
    await store.writeMessagingEvent({
      provider: "telnyx",
      providerEventId: "evt-a",
      studentId: null,
      direction: "inbound",
      channelType: "sms",
      channelAddress: "+15555550123",
      eventType: "opt_out",
      deliveryStatus: "received",
      metadata: {},
    });
    assert.equal(await store.hasMessagingEvent("telnyx", "evt-a"), true);
    // Negative control: a different id is not a duplicate.
    assert.equal(await store.hasMessagingEvent("telnyx", "evt-b"), false);
  });

  await t.test("memory store: true after recordInboundMessage for the same id", async () => {
    const store = createStore({ databaseUrl: "" });
    await store.recordInboundMessage({
      providerEventId: "evt-c",
      channelType: "sms",
      channelAddress: "+15555550123",
      text: "hello",
      metadata: { provider: "telnyx" },
    });
    assert.equal(await store.hasMessagingEvent("telnyx", "evt-c"), true);
    assert.equal(await store.hasMessagingEvent("telnyx", "evt-d"), false);
  });

  await t.test("postgres store: exact query and params; true iff a row exists", async () => {
    const store = createStore({ databaseUrl: "postgres://u:p@127.0.0.1:1/x?sslmode=disable" });
    await store.pool.end();
    const calls = [];
    let rows = [];
    store.pool = {
      async query(sql, params) {
        calls.push([sql, params]);
        return { rows };
      },
    };
    assert.equal(typeof store.hasMessagingEvent, "function");
    assert.equal(await store.hasMessagingEvent("telnyx", "evt-x"), false);
    assert.equal(calls.length, 1);
    assert.match(
      norm(calls[0][0]),
      /^select 1 from messaging_events where provider = \$1 and provider_event_id = \$2( limit 1)?$/,
    );
    assert.deepEqual(calls[0][1], ["telnyx", "evt-x"]);

    rows = [{ "?column?": 1 }];
    assert.equal(await store.hasMessagingEvent("telnyx", "evt-x"), true);
    assert.deepEqual(calls[1][1], ["telnyx", "evt-x"]);
  });
});
