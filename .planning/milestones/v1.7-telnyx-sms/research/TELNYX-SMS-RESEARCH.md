# Phase 39.1: Telnyx SMS for students - Research

**Researched:** 2026-10-13
**Domain:** Telnyx SMS provider for the Node student app (`apps/app`), number port, A2P 10DLC, iMessage deregistration, mac-bridge decommission
**Confidence:** MEDIUM (repo findings HIGH; Telnyx API/porting/10DLC facts MEDIUM from official docs and support pages; timelines LOW)

Scope: CONTEXT.md D26 and D27 are locked. The number is the existing student number +1 406-321-0019, ported into Telnyx, so the toll-free-vs-new-number analysis is dropped. No network calls were made to Telnyx, Fly or production. No secret values were read.

## Summary

The "SMS seam" is thinner than the CONTEXT implies. `apps/app/src/sms/provider.mjs` is a JSDoc-only contract (`export {};`, provider.mjs:40). There is no provider registry. `server.mjs:55-57` constructs `spectrumProvider` and `macBridgeProvider` directly, and the whole student inbound flow is one hard-coded ~330-line route, `POST /webhooks/mac-bridge` (server.mjs:831-1163), that calls `macBridgeProvider` by name. `config.smsProviderName` is used only for config validation (config.mjs:98-101, 131-133). So "add a Telnyx provider selected by `SMS_PROVIDER=telnyx`" means three things: (1) a new `createTelnyxSmsProvider(config, deps)` module, (2) a provider selector in server.mjs, and (3) a new `/webhooks/telnyx/sms` route that reuses the mac-bridge route's logic. That logic should be extracted into a shared function and parametrised on the provider, not copy-pasted (330 lines including two Lakera blocks).

Telnyx mechanics are standard. The send is `POST https://api.telnyx.com/v2/messages` with Bearer auth. Inbound is a `message.received` event signed with Ed25519 over `${timestamp}|${rawBody}`. `apps/startup/workers/lib/telnyx.ts` and `routes/telnyx.ts` already contain a working, tested reference for send, signature check, payload parsing and the STOP regex. Port them to plain ESM using `node:crypto` (no Web Crypto needed).

The long poles are external: the number port (1-7 business days per Telnyx, longer in practice), 10DLC brand+campaign approval (no reliable 2026 figure found), and Apple iMessage deregistration after the port. Production stays down until the port completes AND the number is attached to a messaging profile AND a 10DLC campaign. Code and tests do not wait on any of this.

**Primary recommendation:** Build `src/sms/telnyx.mjs` (factory with injectable `fetch`) plus `src/sms/telnyx-webhook.mjs` pure helpers, extract the shared inbound handler, add `/webhooks/telnyx/sms`, add an opt-out table, and test everything with a locally generated Ed25519 keypair and a stub `fetch`. Do cutover and decommission as separate approval-gated plans.

## Standard Stack

### Core
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `node:crypto` | Node >=22 (package.json engines) | Ed25519 verify (`crypto.verify(null, data, keyObject, sig)`), key build from raw 32 bytes | Zero dependency, matches repo's plain-ESM style |
| global `fetch` + `AbortSignal.timeout(10000)` | Node 22 | Telnyx REST send | Same as startup's `sendSms` (telnyx.ts:77) and mac-bridge provider |
| `node:test` + `node:assert/strict` | Node 22 | Unit tests | Repo convention (auth.test.mjs, safety/screen.test.mjs) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| hand-written verify | `telnyx` npm SDK (`webhooks.unwrap`) | New dependency in a repo that hand-rolls HTTP everywhere; SDK reads key from `TELNYX_PUBLIC_KEY`. Not worth it for one function. |

No new npm packages. Installation: none.

## Architecture Patterns

### Recommended structure (additions only)
```
apps/app/src/sms/telnyx.mjs            # createTelnyxSmsProvider(config, { fetchImpl, now })
apps/app/src/sms/telnyx.test.mjs       # unit tests (no network)
apps/app/src/sms/inbound-handler.mjs  # extracted shared inbound logic (provider-parametrised)
apps/app/src/sms/opt-out.mjs           # STOP/START detection + normalisePhone (E.164)
apps/app/db/migrations/0015_sms_opt_outs.sql
```
(Last existing migration is 0014; 0006 is absent, do not reuse it.)

### Pattern 1: What a Telnyx provider must implement (the seam, provider.mjs:1-40)
- `sendSms(to, body) -> { providerMessageId, status: 'sent'|'skipped_configuration_missing'|'provider_error', metadata }`. `routeAndSend` (outbound.mjs:72-80) throws on `provider_error` and returns `providerMessageId` otherwise. Return `status:'opted_out'`-style only if you also teach routeAndSend; simplest is to return `provider_error` with `metadata.opted_out=true` and let the draft go `failed`.
- `verifyWebhook(req, rawBody) -> { ok, reason?, mode? }` (use `mode:'ed25519'`).
- `parseInbound(payload) -> InboundMessage` with `providerEventId, text, code, channelType:'sms', channelAddress (E.164), metadata:{provider:'telnyx', receivedAt, channel:'sms', hasText}`. Add `eventType` so the route can ignore `message.sent`/`message.finalized`.
- `listen() {}` no-op (webhook model, same as mac-bridge.mjs:29-31).
- Reuse `extractPairingCode` (mac-bridge.mjs:112-118) verbatim: move it to a shared helper so decommission of mac-bridge.mjs does not break Telnyx.
- `metadata.provider` MUST be `'telnyx'`: `store.recordInboundMessage` derives the dedupe provider from `metadata?.provider || "photon"` (store.mjs:864-866), and `confirmPairingCode` takes a `provider` arg (store.mjs:781, default `spectrum`). Forgetting this silently dedupes in the wrong namespace.

### Pattern 2: Route flow to mirror (server.mjs:831-1163), in this order
1. `readBody(req)` (http.mjs:41-52 returns the concatenated utf8 string; pass it untouched to verify, then `JSON.parse`).
2. `verifyWebhook` -> 401 on failure.
3. If `data.event_type !== 'message.received'` -> 200 `{ok:true}` (delivery events). Optionally write a `messaging_events` row for `message.finalized` with `deliveryStatus` and errors.
4. STOP/START/HELP keyword -> record/clear opt-out, no agent, no Lakera, no extra reply (Telnyx/carrier sends its own).
5. `parsePairingCode(text)` (pairing.mjs) + `claimPairingCode(pool, code, from, { channelType:'sms' })` (pairing.mjs:113; already accepts channelType, so no change to pairing logic).
6. Else `confirmPairingCode` (legacy hex/IJ code) or `recordInboundMessage`; unknown sender -> `createUnknownSenderText` reply; student_reply -> `writeInboundMessage` -> Lakera `screenMessage` (SAFETY-01) -> hard-block reply or `runStudentInboundWorkflow({ smsProvider })` fire-and-forget.
7. Respond 200 quickly (see Pitfall 1).

### Pattern 3: Ed25519 verify in plain Node
```js
// Source: Telnyx webhook docs (signed string = `${timestamp}|${rawBody}`), key = base64 raw 32 bytes
// (same format apps/startup stores in TELNYX_WEBHOOK_PUBLIC_KEY, telnyx.ts routes/telnyx.ts:62-67)
import { createPublicKey, verify } from "node:crypto";
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
function keyFromRawB64(b64) {
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(b64, "base64")]), format: "der", type: "spki" });
}
export function verifyTelnyx({ publicKeyB64, sigB64, timestamp, rawBody, nowSec, toleranceSec = 300 }) {
  if (!publicKeyB64) return { ok: false, reason: "public_key_missing" };   // fail closed (startup skips; do NOT copy that)
  if (!sigB64 || !timestamp) return { ok: false, reason: "missing_signature_headers" };
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) return { ok: false, reason: "timestamp_outside_tolerance" };
  const ok = verify(null, Buffer.from(`${timestamp}|${rawBody}`, "utf8"), keyFromRawB64(publicKeyB64), Buffer.from(sigB64, "base64"));
  return ok ? { ok: true, mode: "ed25519" } : { ok: false, reason: "invalid_signature" };
}
```
Wrap in try/catch (bad base64/length throws) and return `{ok:false}`. Tolerance 300 s matches the Telnyx SDK default (MEDIUM, Hookdeck + SDK docs). Note the startup Worker skips verification when the key is unbound (routes/telnyx.ts:229-237); the student app must fail closed.

### Pattern 4: Send call (mirror startup telnyx.ts:77-100)
Body `{ from: TELNYX_FROM_NUMBER, to, text, messaging_profile_id? }`, headers `Authorization: Bearer <key>`, `Content-Type: application/json`. Success response is `{ data: { id, type:'SMS', direction:'outbound', from:{phone_number}, to:[{phone_number,status}], messaging_profile_id } }`; return `providerMessageId = json.data.id`. Missing key or from-number -> `skipped_configuration_missing` (matches mac-bridge.mjs:73-79). Add `config.telnyx.apiBase` (default `https://api.telnyx.com`) so integration tests can point at a local stub.

### Anti-Patterns
- Copying the 330-line route a second time. Extract once; the mac-bridge route becomes a thin wrapper and is deleted at decommission.
- Skipping signature verification when the key is unset (startup does this; unacceptable for the student path).
- Deriving the dedupe provider from the default (`photon`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pairing code parsing | new regex | `parsePairingCode` (pairing.mjs) and `extractPairingCode` (mac-bridge.mjs:112) | Existing START-XXXXXX / hex / IJ- formats |
| Pairing claim | new binding | `claimPairingCode(pool, code, phone, { channelType })` | Atomic; already channelType-aware |
| Prompt-injection screen | new filter | `screenMessage` (safety/screen.mjs) | SAFETY-01 is a locked constraint |
| Carrier STOP enforcement | own blocklist as the only control | Telnyx block rules (error 40300) plus a DB record | Telnyx enforces per messaging profile; app only mirrors it |
| Body reading | new stream reader | `readBody` (http.mjs:41) | 1 MB cap already there |

## Common Pitfalls

### Pitfall 1: Telnyx expects a 2xx within 2 seconds
Telnyx retries non-2xx up to 3 times with backoff (and to a failover URL if set); duplicates happen, so dedupe on event id (Telnyx docs). The pairing first-contact path awaits `screenMessage` (server.mjs:896) and DB writes BEFORE responding; the student_reply path likewise awaits Lakera (server.mjs:1073). Lakera latency is logged but unbounded. Fix: respond 200 after verify + dedupe + DB write, and run screen + workflow after `res.end` (or wrap Lakera in a short timeout). Dedupe already exists via `messaging_events (provider, provider_event_id)`; use `data.id` (event id) with `data.payload.id` in metadata.

### Pitfall 2: Raw-body capture
Signature is over exact bytes. `readBody` returns the utf8 string of the unmodified chunks, so `verify(rawBody)` then `JSON.parse(rawBody)` is safe. Never `JSON.stringify(payload)` back. Do not add any body-parsing middleware before the route. Tests must sign the exact string they POST.

### Pitfall 3: Stored student addresses from the iMessage era may not be phone numbers
The mac-bridge listener sets `from: phone || address || chatGuid` (apps/mac-bridge/src/listener.mjs:208), so a student who paired by iMessage with an Apple ID may have an EMAIL or chat GUID in `students.channel_address`; `claimPairingCode` stores whatever `from` was (pairing.mjs:188). Those rows cannot receive SMS. Also `normalizeAddress`/`normalizePhone` strip to `[0-9+]` (store.mjs normalizeAddress; pairing.mjs:249-251), so a stored `4063210019` would not equal Telnyx's `+14063210019`, and an email normalises to garbage digits. Plan: (a) a read-only count query as an approved executor task: students with `channel_confirmed_at is not null and channel_address !~ '^\+?[0-9]{10,15}$'`; (b) a `toE164(value)` helper in the provider (10 digits -> `+1`, 11 starting 1 -> `+`, else reject); (c) the inbound lookup should match both `+1XXXXXXXXXX` and bare 10-digit forms (store.mjs recordInboundMessage query uses `regexp_replace(...) = $1`, exact equality); (d) affected students re-pair through the START code flow (their `phone_already_bound` check, pairing.mjs:160-167, only blocks a DIFFERENT confirmed phone, so a student with an email address on file may be rejected as `phone_already_bound`; verify with a test and decide whether to clear stale non-phone addresses). Open question below.

### Pitfall 4: channelType values
New inbound is `'sms'`. Nothing downstream branches on `'imessage'` except spectrum.mjs and mac-bridge.mjs parsing (grep: spectrum.mjs:270,329; mac-bridge.mjs:55-56). `routeAndSend` ignores the student's stored `channel_type`; the workflow hard-codes `channel = "sms"` for drafts (student-inbound.mjs ~488-494) and `outbound.mjs:72` already accepts `sms`/`sms_telnyx`. Existing rows with `channel_type='imessage'` keep it (`coalesce(nullif(channel_type,''), $2)`, store.mjs:834) which is harmless. No migration needed for channel type.

### Pitfall 5: Opt-out and the existing "stop" branch
No opt-out storage exists in `apps/app` (grep: only `startup_channel_links.status='opted_out'`, migration 0011:42). `createUnknownSenderText` replies "got it - no more from this thread..." to STOP-like text from unknown senders (server.mjs:1818-1822). On Telnyx that would send a message to a number Telnyx just blocked (40300), and double up with the carrier STOP confirmation. Fix: STOP/START/HELP handling happens BEFORE the unmatched-sender reply and the agent; send nothing extra. Telnyx recognised STOP keywords: stop, stopall, stop all, unsubscribe, cancel, end, quit (Telnyx opt-out docs, MEDIUM); START/UNSTOP resume. HELP is a reserved keyword handled with a configured auto-response. Reuse the startup regex `^(stop\s*all|stop|unsubscribe|cancel|end|quit)$/i` (routes/telnyx.ts:43). Add table `sms_opt_outs(phone text primary key, opted_out_at timestamptz, restored_at timestamptz, source text)` keyed by E.164; inject an `isOptedOut(to)` check so the workflow skips drafting/sending; map a Telnyx 40300 send error to `metadata.opted_out=true`, not a retry. Block rules are per messaging profile (Telnyx docs); one source says account level is default, so confirm at cutover (LOW on default).

### Pitfall 6: Unicode doubles segment cost
Agent copy contains em dashes, e.g. the hard-block reply `"hey — couldn't process that one. try rephrasing?"` (server.mjs ~917, 1096) and curly quotes may appear in LLM output. Any non-GSM-7 char forces UCS-2 (70 chars/segment instead of 160; 67 vs 153 when concatenated). Not a correctness bug, a cost/length one. Either swap to ASCII hyphens in the fixed strings or accept it. Cap outbound at ~1580 chars like startup (telnyx.ts:24-26, 70-73).

### Pitfall 7: Apple's deregistration code arrives on the new inbound path
It will look like an unmatched inbound from an Apple short code; the existing path would call `createUnknownSenderText` and try to reply to Apple (harmless but noisy and may error). Add a structured log line for unmatched inbound text (sender_last4 + length only, never the body in prod logs per the repo's privacy note at server.mjs ~1747) and do not auto-reply when `from` is not an E.164 long code (short codes are 5-6 digits). The executor reads the code from the Telnyx portal message log, which also serves as the live inbound proof.

### Pitfall 8: One webhook URL per messaging profile; keep students and startups separate
`apps/startup` Phase 29 profile posts to `https://mcp.internjobs.ai/webhooks/telnyx/sms` (PHASE-29-DEFERRED-OPS.md DEFER-29-01-D). The student number needs its OWN messaging profile pointing at `https://app.internjobs.ai/webhooks/telnyx/sms`. Opt-out scope is per profile, so a separate profile also keeps student STOPs from blocking startup messaging. The webhook public key is per account per Hookdeck (MEDIUM), so if both profiles live in one Telnyx account the same `TELNYX_WEBHOOK_PUBLIC_KEY` value works; verify in portal (Account Settings, Keys & Credentials). The old API key is dead (D21), which also means the startup Worker's `TELNYX_API_KEY` may be dead; out of scope here but flag it.

## Code Examples: testing without network

### Provider unit tests (fetch injection)
```js
import test from "node:test"; import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createTelnyxSmsProvider } from "./telnyx.mjs";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPub = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
const signHeaders = (raw, ts) => ({
  "telnyx-timestamp": String(ts),
  "telnyx-signature-ed25519": sign(null, Buffer.from(`${ts}|${raw}`), privateKey).toString("base64"),
});
const cfg = { telnyx: { apiKey: "k", fromNumber: "+14063210019", publicKey: rawPub, apiBase: "https://api.telnyx.com" } };

test("sendSms posts to /v2/messages and returns data.id", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url: String(url), init }; return new Response(JSON.stringify({ data: { id: "m1" } }), { status: 200 }); };
  const p = createTelnyxSmsProvider(cfg, { fetchImpl });
  const r = await p.sendSms("+15555550123", "hi");
  assert.equal(r.providerMessageId, "m1");
  assert.equal(seen.url, "https://api.telnyx.com/v2/messages");
  assert.equal(JSON.parse(seen.init.body).from, "+14063210019");
});
// negative controls: tampered body, wrong key, stale timestamp, missing headers, missing public key -> ok:false;
// 4xx/5xx -> provider_error; thrown fetch -> provider_error; missing apiKey -> skipped_configuration_missing.
```
Route tests: extract the handler to `handleInboundSms(deps)` so it can be called with a fake `req` (`Readable.from([body])` plus `headers`) and fake `res`, `store` and `screenMessage`; or follow `scripts/verify-app.mjs` (spawns `src/server.mjs` with env, no DATABASE_URL so the in-memory store is used, polls `/healthz`) and set `TELNYX_WEBHOOK_PUBLIC_KEY` plus `TELNYX_API_BASE` to a local stub server. Server.mjs has no exports for the route and starts listening at import (server.mjs:1780), so direct import in a test is not viable. Cover: forged/unsigned -> 401, valid `message.received` -> 200, retried same event id -> `duplicate:true` and agent not fired twice, `message.finalized` -> 200 ignored, STOP -> opt-out row and no agent/no reply, START-code pairing claim with `channelType:'sms'`, Lakera hard-block -> block reply.
The existing script is `npm run test:auth` only; add `"test:sms": "node --test src/sms/*.test.mjs"` and check `.github/workflows/ci.yml` (exists, not read) so the new tests run in CI.

## Telnyx API facts (verified against Telnyx docs unless marked)

| Item | Fact | Confidence |
|------|------|-----------|
| Send | `POST https://api.telnyx.com/v2/messages`, Bearer key, JSON `{from,to,text}`, E.164 numbers, response `data.id`, `data.to[].status` | HIGH (docs + startup code) |
| Inbound event | `data.event_type='message.received'`, `data.id` (event), `data.payload.id`, `payload.from.phone_number`, `payload.to[].phone_number`, `payload.text`, `payload.type` SMS/MMS, `payload.messaging_profile_id`, `meta.attempt` | HIGH (docs envelope; matches startup interface) |
| Delivery events | `message.sent` (carrier accepted), `message.finalized` (final: delivered, sending_failed, delivery_failed, delivery_unconfirmed; `errors[]` e.g. 40300 STOP-blocked, 40010 blocked) | HIGH |
| Webhook response | any 2xx within 2 s; 3 attempts + exponential backoff; failover URL adds 3; dedupe on `data.id`; order not guaranteed (use `occurred_at`) | HIGH |
| Signature | headers `telnyx-signature-ed25519` (base64) and `telnyx-timestamp` (unix s); signed `${timestamp}|${rawBody}`; public key from portal (Account Settings, Keys & Credentials), base64 raw 32 bytes; tolerance 300 s | MEDIUM (SDK docs via search, plus startup code) |
| STOP | Telnyx creates a block rule on STOP keywords; later sends fail with 40300 "Blocked due to STOP message"; START/UNSTOP resumes; scope per messaging profile | MEDIUM |

## Number port into Telnyx (+1 406-321-0019) (D27)

- **Requirements (Telnyx US porting page):** signed LOA containing BTN, account number and service address, plus the latest invoice from the losing carrier. LOA must list every number, customer legal name, service address, current carrier, account number, date and signature; signer must match the name on file at the losing carrier. Telnyx provides an LOA template/auto-generation in the port request. A PIN/passcode is needed only if the line is PIN-locked (wireless carriers usually require a number-transfer PIN). Source: Telnyx US porting article and porting policy pages. MEDIUM.
- **Timeline:** Telnyx says 1-7 business days for local US numbers (one page says 3-7); the FOC date can be requested but is not guaranteed because losing carriers set their own rules. A rejected LOA (name/account mismatch) restarts the clock. Budget a week or more; LOW for the exact figure.
- **FastPort:** one search summary lists FastPort as an option for eligible numbers, but Telnyx's US porting article does not mention it. Treat as unconfirmed (LOW); ask Telnyx support whether this number is eligible.
- **Messaging vs voice:** for US local numbers voice and messaging port separately. `messaging_port_status` reads `pending` before the FOC date, then `activating` after porting until messaging is verified, then `ported`. Every US local number needs an NNID before it can send/receive. Docs retrieved do NOT state whether a messaging profile can be attached during the port; the API example sets `messaging_profile_id` in the number's configuration. Plan on attaching the messaging profile (and webhook URL) AFTER the port completes and messaging reaches `ported`; verify in the portal at that point. MEDIUM-LOW.
- **Consequence:** the number cannot send or receive on Telnyx until the port finishes, so student SMS stays down until then (D26 forbids any Mac/Spectrum fallback). Code can be merged-ready and fully tested beforehand.
- **Unknowns for Raj (executor stops and reports):** current carrier, account holder, account number, whether +14063210019 is a wireless line (HostMyApple Mac mini SIM/eSIM or a VoIP number). If it is a wireless line, porting out ends that plan; confirm nothing else depends on it. Port order is a Raj action.

## A2P 10DLC (local number needs it) (D27)

- **Costs (Telnyx fees page, passed through at cost):** brand application $4.50 one time; campaign review $15 per review (resubmissions repeat it); monthly campaign fee Low Volume Mixed $1.50, Sole Proprietor $2, most standard use cases $10, billed 3 months up front then monthly; carrier per-message fees on registered traffic roughly $0.003 (T-Mobile send+receive), $0.003 AT&T send (free receive), $0.0045 Verizon send. Secondary brand vetting fee was not on the page (not found). HIGH for the listed figures.
- **Registration inputs:** brand = legal company name, EIN/tax ID, address, website, contact; campaign = use case, description, sample messages, opt-in flow description, opt-out/HELP wording, privacy policy and terms URLs. The student flow is a user-initiated opt-in (student texts the START code after web sign-in), which is the opt-in evidence to describe. Pick Low Volume Mixed ($1.50) if volume is under its cap, else Mixed/Customer Care ($10); confirm cap in the Telnyx portal. The startup toll-free work already used the company EIN (DEFER-29-01-C), so the legal entity data exists. MEDIUM (inferred from fees page plus general TCR rules; not read from a Telnyx requirements page).
- **Timeline:** no reliable 2026 figure found. Telnyx marketing cites ~3 business days for API registrations (2023, LOW). Campaigns can be rejected and resubmitted. Assume days to a couple of weeks.
- **Can it start before the port completes?** Yes for brand and campaign (they attach to the Telnyx account, not a number). Assigning the number to the campaign needs the number on the account, so that step follows the port. Inference from how TCR assignment works, MEDIUM-LOW; confirm with Telnyx support. Start brand registration immediately, in parallel with the LOA.
- **Unregistered traffic:** US carriers filter or block unregistered 10DLC; from general industry knowledge (not verified in this research, LOW), so treat registration as a hard precondition for real student traffic. Cutover precondition: port complete, number `ported`, campaign approved and number attached.

## iMessage deregistration (D27)

- Apple's tool: `selfsolve.apple.com/deregister-imessage`. Enter the phone number; Apple texts a confirmation code to that number; enter it to finish. Works without the old device. Source: several consumer how-to pages (MEDIUM). An April 2026 forum thread reports the tool sometimes fails; fallbacks are putting the SIM in an iPhone and switching iMessage off, or contacting Apple Support (LOW).
- Sequence: port completes -> number receives SMS on Telnyx -> run Apple's tool -> read the code from the Telnyx message log or inbound log -> confirm. This is the first real inbound proof. It needs messaging active (and ideally the 10DLC campaign attached) BEFORE deregistration, otherwise the code SMS may not arrive.
- **Until it completes:** iPhone users texting the number stay on iMessage, which Apple still routes to the number's old registration (the Mac, now gone), so those messages never reach Telnyx. Android and non-iMessage senders are unaffected after the port. Older sources say Apple drops the registration on its own after about 30 days of the number being off the iPhone (LOW, dated). Expect a window of iPhone-sender loss; consider a line on the sign-up page telling iPhone users to send as "Text Message" if the QR flow is live in that window.

## Cutover facts (Fly / Telnyx / Infisical)

- Fly app `internjobs-ai-student-app`; `apps/app/fly.toml:11` has `SMS_PROVIDER = "mac-bridge"` and `AGENT_NUMBER = "+14063210019"` (fly.toml:12) already, so the deep link/QR number needs no change. `ENABLE_SPECTRUM_LISTENER = "false"` stays.
- New config in `config.mjs`: `telnyx: { apiKey: TELNYX_API_KEY, fromNumber: TELNYX_FROM_NUMBER, messagingProfileId: TELNYX_MESSAGING_PROFILE_ID, publicKey: TELNYX_WEBHOOK_PUBLIC_KEY, apiBase: TELNYX_API_BASE || default }`, and a `telnyx` branch in `getMissingProviderConfig` requiring API key, from-number, and public key (config.mjs:131-133 is the mac-bridge analogue). `TELNYX_FROM_NUMBER` must equal `AGENT_NUMBER`.
- Secrets to Fly (`fly secrets set`, values never in git): `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER`, `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_WEBHOOK_PUBLIC_KEY`; flip `SMS_PROVIDER=telnyx` last. Save each to Infisical first (project `26995afd...`, env `prod`, path `/internjobs-ai`). `BRIDGE_URL`/`BRIDGE_HMAC_SECRET` are not in fly.toml, so they are Fly secrets if set; remove at decommission (`fly secrets list` readback).
- Telnyx portal: messaging profile for students -> inbound webhook URL `https://app.internjobs.ai/webhooks/telnyx/sms`; attach the ported number; attach number to 10DLC campaign.
- Readbacks: before flip `/config/status` (or `getMissingProviderConfig`) reports missing Telnyx config; after, empty. Real round trip: text the number from a phone, see `messaging_events` row with `provider='telnyx'` and a reply delivered (`message.finalized` delivered).
- D10: main is frozen to non-v1.6 changes; merging and deploying need Raj's recorded urgent-outage exception. Deploy only from main (memory: workspace deploy is full-replace; the student app is a separate Fly app, but keep the same discipline).

## Reference grep: mac-bridge / bridge / canary (excluding `.planning/`, node_modules, .git)

| Location | Disposition |
|----------|-------------|
| `apps/app/fly.toml:11` `SMS_PROVIDER` | Change at cutover (to `telnyx`) |
| `apps/app/.env.example:29-32` (SMS_PROVIDER, BRIDGE_URL, BRIDGE_HMAC_SECRET) | Change now: document Telnyx vars; remove BRIDGE_* at decommission |
| `apps/app/src/config.mjs:86-101` (`macBridge`, `smsProviderName`) | Change now (add `telnyx`); remove `macBridge` at decommission |
| `apps/app/src/config.mjs:131-133` validation | Change now (add telnyx branch); drop mac-bridge branch at decommission |
| `apps/app/src/config.mjs:109-113` agentNumber comment ("iMessage number") | Change now (comment/copy only) |
| `apps/app/src/server.mjs:9,57` import and `macBridgeProvider` | Change now (selector); remove at decommission |
| `apps/app/src/server.mjs:56, 453, 505, 821-831` comments | Change now (comments) |
| `apps/app/src/server.mjs:831-1163` `/webhooks/mac-bridge` route | Leave until Telnyx proven; becomes thin wrapper on shared handler; remove at decommission |
| `apps/app/src/server.mjs` `provider:"mac-bridge"` and `source:"mac-bridge*"` literals (861-1151) | Move into the shared handler as a parameter; gone at decommission |
| `apps/app/src/sms/mac-bridge.mjs` | Move `extractPairingCode` to shared helper now; delete file at decommission |
| `apps/app/src/onboarding/pairing.mjs:11` (comment), `:110,117` default channelType `'imessage'` | Change now: comment, and default to `'sms'` |
| `apps/app/src/views.mjs:298-299` (comment), `:377` "through iMessage" | Change now (copy to "by text message"; check ~298-380 for other iMessage wording) |
| `apps/app/src/sms/spectrum.mjs`, `spectrum-listener.mjs` | Leave (out of scope; D26 says no Spectrum fallback, dead-code removal is a separate decision) |
| `apps/app/db/migrations/0008_...sql:7` comment | Leave |
| `apps/app/src/workflows/student-inbound.mjs:368, 1356, 1378` (iMessage wording in prompt/comments) | Change now: the system prompt tells the agent about iMessage reactions/emoji behaviour; adjust so replies suit plain SMS (needs a prompt-test check; keep minimal) |
| `apps/mac-bridge/**` (whole dir, launchd, setup.sh) | Remove at decommission |
| `apps/canary-monitor/**` (untracked in git status) | Remove at decommission (also CF Worker/cron in dashboard) |
| `package-lock.json:84-85,2157-2158` workspace entry | Update when `apps/mac-bridge` is deleted (`npm install`) |
| `.gitignore:9-10` mac-bridge entries | Remove at decommission |
| `scripts/verify-code-maps.mjs:461` lists `apps/mac-bridge` | Update at decommission (code-map verifier will fail otherwise); check `.planning/codebase/*.md` code maps too |
| `apps/agentic-inbox/wrangler.jsonc:14` comment | Leave (historical comment) |
| `infra/LAKERA-VERIFY-LIVE.md:10` | Leave (historical evidence) |
| `.planning/**` references | Not enumerated; grep again in the decommission plan |
| External: `bridge.internjobs.ai`, `canary.internjobs.ai` (CF tunnel hostnames/DNS, CF 1033), Fly secrets BRIDGE_* | Remove at decommission, approval-gated; before deleting DNS verify nothing else (canary-monitor Worker, email alerts) still polls them |

Open item: I did not grep `smsProviderName` in server.mjs; confirm no other selection logic exists there before writing the selector.

## State of the Art

| Old | Current | Impact |
|-----|---------|--------|
| iMessage via Mac + BlueBubbles + mac-bridge | Plain SMS via Telnyx (D26) | Loses blue bubbles, typing indicators, reactions; agent copy and prompt need SMS-appropriate tone |
| Toll-free verification (startup) | 10DLC for a local number (students) | Different registration path; BRN fields required for toll-free since 2026-02-17 are not relevant here |

## Open Questions

1. **How many existing students have non-E.164 `channel_address` (emails/chat GUIDs)?** Unknown. Recommendation: approved read-only count query in the plan; decide re-pair or clear before cutover. Can they re-pair given `phone_already_bound`? Test it.
2. **Current carrier / line type of +14063210019.** Unknown; drives port requirements (PIN, wireless rules).
3. **Can the messaging profile be assigned to the number before the port completes?** Telnyx docs retrieved do not say. Ask Telnyx support or check the portal.
4. **10DLC approval time in 2026 and whether the number can be attached to a campaign mid-port.** Not found. Confirm with Telnyx (10dlcquestions@telnyx.com per their fees page).
5. **Does Telnyx account-level vs profile-level opt-out default apply?** Sources conflict; check portal settings.
6. **Is the webhook public key shared across the startup and student profiles?** Believed per account; verify in portal.
7. **FastPort eligibility** for this number: unconfirmed.
8. **CI:** whether `.github/workflows/ci.yml` runs `apps/app` tests; not read.

## Sources

### Primary (HIGH)
- Repo: `apps/app/src/sms/{provider,mac-bridge}.mjs`, `config.mjs`, `server.mjs` (831-1163, 1818-1822), `outbound.mjs`, `onboarding/pairing.mjs`, `store.mjs` (781-900), `http.mjs`, `views.mjs`, `workflows/student-inbound.mjs`, `scripts/verify-app.mjs`, `fly.toml`; `apps/startup/workers/lib/telnyx.ts`, `routes/telnyx.ts`; `apps/mac-bridge/src/listener.mjs`; PHASE-29-DEFERRED-OPS.md; CONTEXT.md D26/D27.
- https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks (event shapes, 2xx in 2 s, retries, dedupe)
- https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges (10DLC fees)

### Secondary (MEDIUM)
- https://developers.telnyx.com/docs/development/sdk/node/webhooks and Hookdeck Telnyx guide https://hookdeck.com/webhooks/platforms/guide-to-telnyx-webhooks-features-and-best-practices (Ed25519 scheme, 300 s tolerance, per-account key)
- https://support.telnyx.com/en/articles/3267816-united-states-number-porting (LOA, invoice, 1-7 business days)
- https://developers.telnyx.com/docs/v2/numbers/porting/port_in_resources/messaging_porting (via search summary: messaging port statuses, NNID)
- https://developers.telnyx.com/docs/messaging/messages/advanced-opt-in-out and https://support.telnyx.com/en/articles/1270091-sms-opt-out-keywords-and-stop-words (STOP keywords, 40300)
- https://developers.telnyx.com/docs/messaging/messages/send-message and https://developers.telnyx.com/docs/messaging/messages/schedule-message (send shape)
- https://techlicious.com/blog/apple-deregister-imessage-webtool-lost-text-message-fix and https://allthings.how/how-to-deregister-phone-number-from-imessage/ (Apple deregistration)

### Tertiary (LOW)
- Forum thread (April 2026) on Apple tool failures; Telnyx marketing "3 business days" 10DLC; FastPort mention; unregistered-10DLC blocking claim (general knowledge, unverified); 30-day Apple auto-expiry (dated).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new dependencies, mirrors working startup code.
- Architecture: HIGH for repo structure (read directly); MEDIUM for Telnyx behaviours.
- Pitfalls: HIGH for repo-derived ones (1-4, 6-7); MEDIUM for opt-out scope.
- Port/10DLC/Apple timelines: LOW (external, variable).

**Research date:** 2026-10-13
**Valid until:** 2026-10-27 for Telnyx/10DLC pricing and rules (fast-moving); repo findings valid until the next change to server.mjs or the sms modules.
