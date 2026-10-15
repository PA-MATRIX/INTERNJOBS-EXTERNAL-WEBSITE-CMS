// v1.7 Phase 44-01: provider-neutral SMS helpers.
// Run: node --test src/sms/shared.test.mjs (from apps/app)

import { test } from "node:test";
import assert from "node:assert/strict";
import { toE164, extractPairingCode, classifyKeyword, buildHelpReply } from "./shared.mjs";

test("toE164", () => {
  // US forms all normalise to the same E.164 number.
  assert.equal(toE164("4063210019"), "+14063210019");
  assert.equal(toE164("14063210019"), "+14063210019");
  assert.equal(toE164("(406) 321-0019"), "+14063210019");
  assert.equal(toE164("+14063210019"), "+14063210019");
  assert.equal(toE164("+1 (406) 321-0019"), "+14063210019");
  assert.equal(toE164("406.321.0019"), "+14063210019");
  assert.equal(toE164("+15555550123"), "+15555550123");
  // International passes through.
  assert.equal(toE164("+442071838750"), "+442071838750");
  // Rejections.
  assert.equal(toE164("student@example.com"), null);
  assert.equal(toE164("12345"), null);
  assert.equal(toE164(""), null);
  assert.equal(toE164(null), null);
  assert.equal(toE164(undefined), null);
  assert.equal(toE164("iMessage;-;+15555550123"), null);
  assert.equal(toE164("+1555555012"), null); // +1 must be exactly 11 digits
  assert.equal(toE164("+155555501234"), null);
  assert.equal(toE164("24063210019"), null); // 11 digits not starting with 1
});

test("extractPairingCode", () => {
  assert.equal(extractPairingCode("START-AB12CD"), "START-AB12CD");
  assert.equal(extractPairingCode("start-ab12cd"), "START-AB12CD");
  assert.equal(extractPairingCode("my code is ab12cd34"), "AB12CD34");
  assert.equal(extractPairingCode("IJ-ABC123 please"), "IJ-ABC123");
  assert.equal(extractPairingCode("ab12cd34 START-ZZ99YY"), "START-ZZ99YY");
  assert.equal(extractPairingCode("hello"), "");
  assert.equal(extractPairingCode(""), "");
  assert.equal(extractPairingCode(null), "");
  assert.equal(extractPairingCode(undefined), "");
});

test("classifyKeyword: carrier opt-out set", () => {
  for (const t of ["stop", "STOP", " Stop ", "stop all", "STOPALL", "unsubscribe", "CANCEL", "end", "Quit"]) {
    assert.equal(classifyKeyword(t), "stop", `expected stop for ${JSON.stringify(t)}`);
  }
});

test("classifyKeyword: opt-in and help", () => {
  assert.equal(classifyKeyword("start"), "start");
  assert.equal(classifyKeyword("START"), "start");
  assert.equal(classifyKeyword("UNSTOP"), "start");
  assert.equal(classifyKeyword("HELP"), "help");
  assert.equal(classifyKeyword(" help "), "help");
});

test("classifyKeyword: full match only (negative controls)", () => {
  assert.equal(classifyKeyword("stop texting me"), null);
  // A pairing code must never classify as an opt-in keyword.
  assert.equal(classifyKeyword("START-AB12CD"), null);
  assert.equal(classifyKeyword("help me find a job"), null);
  assert.equal(classifyKeyword("starting now"), null);
  assert.equal(classifyKeyword(""), null);
  assert.equal(classifyKeyword(null), null);
  assert.equal(classifyKeyword(undefined), null);
});

test("buildHelpReply: STOP/START, app URL, ASCII, one GSM-7 segment", () => {
  const appUrl = "https://app.internjobs.ai";
  const reply = buildHelpReply({ appUrl });
  assert.match(reply, /STOP/);
  assert.match(reply, /START/);
  assert.ok(reply.includes(appUrl), "reply includes the app URL");
  assert.match(reply, /^[\x20-\x7e]+$/);
  assert.ok(reply.length <= 160, `length ${reply.length} > 160`);
});

test("buildHelpReply: an over-long app URL still yields at most 160 ASCII chars", () => {
  const reply = buildHelpReply({ appUrl: `https://example.com/${"x".repeat(200)}` });
  assert.ok(reply.length <= 160);
  assert.match(reply, /^[\x20-\x7e]+$/);
  assert.match(reply, /STOP/);
});
