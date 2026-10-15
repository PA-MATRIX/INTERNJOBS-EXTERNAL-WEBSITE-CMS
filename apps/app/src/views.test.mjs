// v1.7 Phase 44-05 (PAIR-01): the onboarding pairing pages tell a new student
// to text the code by SMS. No iMessage or iPhone-only wording.
//
// Run: node --test src/views.test.mjs (from apps/app)
//
// Negative control: restoring "We'll send the code through iMessage" in
// renderOnboardingMobile (or "Scan with your iPhone camera" in
// renderOnboardingQR) makes 'pairing views use SMS wording' fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOnboardingMobile, renderOnboardingQR } from "./views.mjs";

const CODE = "START-AB12CD";
const AGENT = "+14063210019";
const SMS_URI = `sms:${AGENT}&body=${CODE}`;
const SMS_URI_ESCAPED = `sms:${AGENT}&amp;body=${CODE}`;

async function renderBoth(opts) {
  return {
    qr: await renderOnboardingQR(opts),
    mobile: renderOnboardingMobile(opts),
  };
}

test("pairing views use SMS wording", async () => {
  const { qr, mobile } = await renderBoth({ pairingCode: CODE, smsUri: SMS_URI, agentNumber: AGENT });

  for (const [name, html] of [["qr", qr], ["mobile", mobile]]) {
    assert.doesNotMatch(html, /imessage/i, `${name} page must not mention iMessage`);
    assert.ok(html.includes(CODE), `${name} page still renders the pairing code`);
    assert.ok(html.includes(AGENT), `${name} page still renders the agent number`);
    // Behaviour the copy edit must not drop: the pairing-status poll.
    assert.ok(html.includes("/onboard/status"), `${name} page still polls /onboard/status`);
    assert.ok(html.includes('id="pair-status"'), `${name} page still has the status line`);
  }

  // The mobile page's Open Messages link opens the prefilled sms: URI.
  const link = mobile.match(/<a class="button primary" href="([^"]*)">([^<]*)<\/a>/);
  assert.ok(link, "mobile page has the Open Messages link");
  assert.equal(link[1], SMS_URI_ESCAPED);
  assert.equal(link[2], "Open Messages to confirm");
  assert.match(mobile, /text message/i, "mobile page says the code goes by text message");

  // The QR page is not iPhone-only.
  assert.ok(!qr.includes("iPhone camera"), "QR page must not say 'iPhone camera'");
  assert.match(qr, /phone camera/i);
  assert.match(qr, /<img src="data:image\/png;base64,/, "QR image still rendered");
});

test("pairing views escape the pairing code", async () => {
  const { qr, mobile } = await renderBoth({ pairingCode: "<b>x</b>", smsUri: SMS_URI, agentNumber: AGENT });
  for (const [name, html] of [["qr", qr], ["mobile", mobile]]) {
    assert.ok(!html.includes("<b>x</b>"), `${name} page must not render raw markup from the code`);
    assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"), `${name} page renders the escaped code`);
  }
});
