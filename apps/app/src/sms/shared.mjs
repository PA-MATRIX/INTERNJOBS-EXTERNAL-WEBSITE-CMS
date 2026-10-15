// v1.7 Phase 44-01: provider-neutral SMS helpers shared by the mac-bridge
// and Telnyx providers (and, from plan 44-02 on, the opt-out guard).

/**
 * Pull a pairing code out of free text. Moved verbatim from mac-bridge.mjs
 * (same three patterns, same precedence: START-, then 8-hex, then IJ-).
 * Returns "" when there is no code.
 */
export function extractPairingCode(text) {
  const start = String(text || "").match(/\bSTART-[A-Z0-9]{6,8}\b/i)?.[0];
  if (start) return start.toUpperCase();
  const modern = String(text || "").match(/\b[A-F0-9]{8}\b/i)?.[0];
  if (modern) return modern.toUpperCase();
  return String(text || "").match(/\bIJ-[A-Z0-9]{6}\b/i)?.[0]?.toUpperCase() || "";
}

/**
 * Normalise a phone number to E.164, or return null if it is not a bare
 * phone number (e-mail addresses, chat GUIDs, short codes, wrong lengths).
 *   10 digits            -> +1XXXXXXXXXX
 *   11 digits, leading 1 -> +1XXXXXXXXXX
 *   +<8-15 digits>       -> as is (a +1 number must be exactly 11 digits)
 */
export function toE164(value) {
  if (value === null || value === undefined) return null;
  const stripped = String(value).trim().replace(/[\s\-.()]/g, "");
  if (!stripped) return null;
  const plus = stripped.startsWith("+");
  const digits = plus ? stripped.slice(1) : stripped;
  if (!/^\d+$/.test(digits)) return null;
  if (plus) {
    if (digits.length < 8 || digits.length > 15) return null;
    if (digits.startsWith("1") && digits.length !== 11) return null;
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// Same STOP set as apps/startup/workers/routes/telnyx.ts STOP_RE, plus the
// START/UNSTOP opt-in and HELP keywords Telnyx handles at the carrier level.
// Full match on the trimmed text only: "stop texting me" is not a keyword.
const STOP_RE = /^(stop\s*all|stop|unsubscribe|cancel|end|quit)$/i;
const START_RE = /^(start|unstop)$/i;
const HELP_RE = /^help$/i;

/** @returns {"stop"|"start"|"help"|null} */
export function classifyKeyword(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).trim();
  if (!t) return null;
  if (STOP_RE.test(t)) return "stop";
  if (START_RE.test(t)) return "start";
  if (HELP_RE.test(t)) return "help";
  return null;
}

const HELP_SEGMENT_LIMIT = 160; // one GSM-7 segment

/** Fixed ASCII HELP reply: how to opt out and back in, plus where to learn more. */
export function buildHelpReply({ appUrl } = {}) {
  const base = "InternJobs.ai: we text about internships. Reply STOP to opt out, START to resume. Msg&data rates may apply.";
  const url = String(appUrl || "").replace(/[^\x20-\x7e]/g, "");
  const full = url ? `${base} More: ${url}` : base;
  return full.length <= HELP_SEGMENT_LIMIT ? full : base;
}
