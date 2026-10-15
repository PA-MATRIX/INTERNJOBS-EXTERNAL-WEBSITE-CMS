// v1.7 Phase 44-04: SMS provider registry.
//
// One place that builds every SMS provider the server uses, so the Telnyx
// provider always gets the store's opt-out table (OPT-01) and the Telnyx
// inbound handler options exist exactly once (server.mjs and the 44-05 chain
// test both call buildTelnyxInboundOptions, so the test cannot drift from the
// server wiring).
//
// D34 (Raj, 2026-10-15): POST /webhooks/telnyx/sms is enabled by
// TELNYX_WEBHOOK_PUBLIC_KEY, NOT by SMS_PROVIDER. Key unset -> the route fails
// closed (401 public_key_missing). Key set -> signed requests are processed
// whatever SMS_PROVIDER says, which allows a signed canary before the Phase 46
// outbound flip. Replies to messages that arrive on the Telnyx route go out
// through the Telnyx provider.

import { createSpectrumSmsProvider } from "./spectrum.mjs";
import { createMacBridgeSmsProvider } from "./mac-bridge.mjs";
import { createTelnyxSmsProvider } from "./telnyx.mjs";
import { SMS_HARD_BLOCK_REPLY } from "./inbound-handler.mjs";

export function createSmsProviders(config, { store, fetchImpl } = {}) {
  const optOuts = store?.optOuts;
  // Pass undefined (not a wrapper) when the store has no opt-out lookup, so
  // createTelnyxSmsProvider's own telnyx_opt_out_guard_required check fires.
  const isOptedOut =
    typeof optOuts?.isOptedOut === "function" ? (phone) => optOuts.isOptedOut(phone) : undefined;
  const telnyxDeps = { isOptedOut };
  if (fetchImpl) telnyxDeps.fetchImpl = fetchImpl;
  return {
    spectrum: createSpectrumSmsProvider(config),
    "mac-bridge": createMacBridgeSmsProvider(config),
    telnyx: createTelnyxSmsProvider(config, telnyxDeps),
  };
}

export function isTelnyxRouteEnabled(config) {
  return Boolean(config?.telnyx?.publicKey);
}

export function buildTelnyxInboundOptions() {
  return {
    providerName: "telnyx",
    hardBlockReply: SMS_HARD_BLOCK_REPLY,
    ackEarly: true,
    earlyDedupe: true,
    acceptEventTypes: ["message.received"],
    keywordHandling: true,
    suppressShortCodeReplies: true,
  };
}
