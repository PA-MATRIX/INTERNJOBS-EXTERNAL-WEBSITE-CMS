# Phase 44 Context: Telnyx SMS provider (code)

## Locked decisions
- D26: students move from iMessage to plain Telnyx SMS. No iMessage, BlueBubbles, Mac or Spectrum fallback in the new path.
- D27: the number is the existing +1 406-321-0019 (`AGENT_NUMBER`), ported into Telnyx later (Phase 45). Code reads `TELNYX_FROM_NUMBER` from config; nothing is hard-coded.
- D10/D33: main freeze. Phase 43 got a one-off exception (D33). Phase 44's merge/deploy needs its own recorded exception. This phase is CODE ONLY: no deploy, no Telnyx account calls, no Fly secrets, no production writes. Pushing a branch + opening a do-not-merge PR for CI is allowed (same pattern as 43-04, with a gitleaks scan first; the repo is public).

## Spec and research
- Spec: `.planning/milestones/v1.7-telnyx-sms/REQUIREMENTS.md` SMS-01..SMS-04, OPT-01, PAIR-01.
- Research (file:line, Telnyx API facts, pitfalls): `.planning/milestones/v1.7-telnyx-sms/research/TELNYX-SMS-RESEARCH.md`. Read it fully. Key points:
  - The seam is thin: `server.mjs:55-57` builds providers directly; inbound is one hard-coded route `POST /webhooks/mac-bridge` (`server.mjs:831-1163`). Extract a shared inbound handler parameterised by provider rather than copying ~330 lines.
  - Set `metadata.provider='telnyx'` (dedupe in `store.recordInboundMessage` defaults to `photon`, `store.mjs:864-866`).
  - Ed25519 verify over `${timestamp}|${rawBody}` with a 300 s window via `node:crypto`; fail CLOSED when the public key is unset (unlike `apps/startup`).
  - Telnyx needs a 2xx within ~2 s: ack after verify + dedupe + DB write; run the Lakera screen and agent after the ack.
  - No opt-out storage exists: add a migration (number AFTER 0015, i.e. 0016) for `sms_opt_outs`, with STOP/START/HELP handled before the unknown-sender reply and the agent; never send to an opted-out number (outbound guard).
  - Tests without network: generate an Ed25519 keypair in-test, inject `fetch` into the provider, `TELNYX_API_BASE` override.
- Phase 43 lessons: the student app has `npm test` + the CI `app-tests` job (Postgres 16 service) from 43-01; the 42703 fallback pattern exists in `src/safety/events-api.mjs`. A local-suite-guard hook blocks whole-suite and >3-file local test runs; run files individually and rely on CI for the whole suite.

## Scope boundaries
- In: Telnyx provider (send, verify, parse), the shared inbound handler and `/webhooks/telnyx/sms` route, dedupe, Lakera parity, STOP/START/HELP with storage plus the outbound guard, SMS pairing copy (`src/views.mjs` iMessage wording) and the claim through the Telnyx path, config validation for `SMS_PROVIDER=telnyx`, `/healthz` readiness keys.
- Out (later phases): number port and 10DLC (45), iMessage-era address handling PAIR-02 (45), the production cutover (46), deleting mac-bridge (47). The mac-bridge route keeps working unchanged in this phase (production still runs `SMS_PROVIDER=mac-bridge`), so shared-handler extraction must keep mac-bridge behaviour identical (regression tests).
- Before changing a rule (provider selection, dedupe key, pairing claim path, outbound send guard), grep every enforcement site and list each disposition.

## Constraints
- TDD-first per task with negative controls; RED before GREEN in evidence; each must_have names its test.
- Code in a worktree from origin/main (now 951e103, which includes Phase 43): e.g. `/Users/rajren/internjobs-cms-wt-44` on `feat/v1.7-44-telnyx-sms`. Planning docs stay on `docs/v1.7-telnyx-sms`.
- Never print secrets; never call real Telnyx; tests use local keys and fake fetch.

## D34 (2026-10-15): route gate
- `/webhooks/telnyx/sms` is active when `TELNYX_WEBHOOK_PUBLIC_KEY` is configured (fail closed without it); NOT gated on `SMS_PROVIDER`. This enables a signed canary in Phase 45/46 before the outbound flip. Phase 46 still flips `SMS_PROVIDER` for outbound.
- The 44-05 pairing-page visual check is deferred to the Phase 46 UAT (recorded decision, not just plan text).
- D34 clarification (2026-10-15, orchestrator reading of Raj's choice; revisit if Raj objects): replies to messages that ARRIVE on the Telnyx route go out through the Telnyx provider (reply on the channel the student used), even while `SMS_PROVIDER=mac-bridge`. Every other outbound path (mac-bridge/spectrum routes, agent-initiated sends) follows `SMS_PROVIDER`. This is what makes the signed canary a true round trip.
