import { createPublicKey, verify } from "node:crypto";
import { eventIdFromPayload } from "../store.mjs";
import { extractPairingCode, toE164 } from "./shared.mjs";

/**
 * TelnyxSmsProvider (v1.7 Phase 44, SMS-01 verify half + SMS-02 send).
 *
 * Wire shape:
 *   - Inbound: Telnyx POSTs a JSON envelope { data: { event_type, id, payload } }
 *     to /webhooks/telnyx/sms, signed with Ed25519 over `${timestamp}|${rawBody}`
 *     (headers telnyx-timestamp, telnyx-signature-ed25519).
 *   - Outbound: POST ${apiBase}/v2/messages with Authorization: Bearer <apiKey>.
 *
 * Verification FAILS CLOSED: with no public key configured every request is
 * rejected (apps/startup's Worker skips verification when unkeyed; the
 * student app must not).
 */

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const DEFAULT_TOLERANCE_SEC = 300;
const SEND_TIMEOUT_MS = 10_000;
// Telnyx accepts long messages but splits them; cap well under the 10-segment
// GSM-7 ceiling (research pitfall 6). ASCII marker so the encoding stays GSM-7.
const MAX_BODY_CHARS = 1580;
const TRUNCATION_MARKER = "...";

function publicKeyFromRawB64(b64) {
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(b64, "base64")]),
    format: "der",
    type: "spki",
  });
}

export function verifyTelnyxSignature({
  publicKeyB64,
  sigB64,
  timestamp,
  rawBody,
  nowSec,
  toleranceSec = DEFAULT_TOLERANCE_SEC,
}) {
  if (!publicKeyB64) return { ok: false, reason: "public_key_missing" };
  try {
    if (!sigB64 || !timestamp) return { ok: false, reason: "missing_signature_headers" };
    const ts = Number(timestamp);
    if (!/^\d+$/.test(String(timestamp)) || !Number.isFinite(ts)) {
      return { ok: false, reason: "invalid_timestamp" };
    }
    if (Math.abs(nowSec - ts) > toleranceSec) return { ok: false, reason: "timestamp_outside_tolerance" };
    const ok = verify(
      null,
      Buffer.from(`${timestamp}|${rawBody}`, "utf8"),
      publicKeyFromRawB64(publicKeyB64),
      Buffer.from(String(sigB64), "base64"),
    );
    return ok ? { ok: true, mode: "ed25519" } : { ok: false, reason: "invalid_signature" };
  } catch {
    // Bad base64, wrong key length or a malformed signature: reject, never throw.
    return { ok: false, reason: "invalid_key_or_signature" };
  }
}

export function createTelnyxSmsProvider(config, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const telnyx = config?.telnyx || {};
  return {
    verifyWebhook(req, rawBody) {
      const headers = req?.headers || {};
      return verifyTelnyxSignature({
        publicKeyB64: telnyx.publicKey,
        sigB64: headerValue(headers["telnyx-signature-ed25519"]),
        timestamp: headerValue(headers["telnyx-timestamp"]),
        rawBody,
        nowSec: Math.floor(now() / 1000),
      });
    },
    parseInbound(payload) {
      return parseTelnyxInbound(payload, now);
    },
    async sendSms(to, body) {
      return sendViaTelnyx(to, body, telnyx, fetchImpl);
    },
    // Webhook-driven: Telnyx pushes inbound to /webhooks/telnyx/sms.
    async listen() {},
  };
}

function headerValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

function parseTelnyxInbound(envelope, now) {
  const safeEnvelope = envelope && typeof envelope === "object" ? envelope : {};
  const data = safeEnvelope.data && typeof safeEnvelope.data === "object" ? safeEnvelope.data : {};
  const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
  const text = String(payload.text || "");
  const fromRaw = String(payload.from?.phone_number || "");
  const eventType = String(data.event_type || "");

  return {
    providerEventId: String(data.id || payload.id || eventIdFromPayload(safeEnvelope)),
    text,
    code: extractPairingCode(text),
    channelType: "sms",
    channelAddress: toE164(fromRaw) || fromRaw,
    eventType,
    metadata: {
      // Explicit: store.recordInboundMessage dedupes on metadata.provider and
      // would otherwise fall back to the "photon" namespace.
      provider: "telnyx",
      receivedAt: new Date(now()).toISOString(),
      channel: "sms",
      hasText: Boolean(text),
      eventType,
      messageId: payload.id,
      messagingProfileId: payload.messaging_profile_id,
      occurredAt: data.occurred_at,
    },
  };
}

function capBody(body) {
  const text = String(body ?? "");
  if (text.length <= MAX_BODY_CHARS) return text;
  return text.slice(0, MAX_BODY_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

// Single place where a send result is built. Plan 44-02 maps Telnyx 40300
// (recipient STOP-blocked) here and wraps sends in the opt-out guard.
function afterSend({ ok, status, json, error }) {
  if (error !== undefined) {
    return { providerMessageId: null, status: "provider_error", metadata: { error } };
  }
  if (!ok) {
    const errorCode = json?.errors?.[0]?.code ?? null;
    return { providerMessageId: null, status: "provider_error", metadata: { status, errorCode } };
  }
  const providerMessageId = json?.data?.id || null;
  return { providerMessageId, status: "sent", metadata: { providerMessageId, provider: "telnyx" } };
}

async function sendViaTelnyx(to, body, telnyx, fetchImpl) {
  if (!telnyx.apiKey || !telnyx.fromNumber) {
    return {
      providerMessageId: null,
      status: "skipped_configuration_missing",
      metadata: { reason: "telnyx_not_configured" },
    };
  }
  const destination = toE164(to);
  if (!destination) {
    return { providerMessageId: null, status: "provider_error", metadata: { reason: "invalid_destination" } };
  }

  const request = { from: telnyx.fromNumber, to: destination, text: capBody(body) };
  if (telnyx.messagingProfileId) request.messaging_profile_id = telnyx.messagingProfileId;

  try {
    const response = await fetchImpl(`${telnyx.apiBase}/v2/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${telnyx.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const json = await response.json().catch(() => ({}));
    return afterSend({ ok: response.ok, status: response.status, json });
  } catch (err) {
    return afterSend({ error: err?.message || String(err) });
  }
}
