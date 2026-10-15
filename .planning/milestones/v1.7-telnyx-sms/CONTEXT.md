# v1.7 Context: Students on Telnyx SMS (no Mac)

## Why

- D26 (Raj, 2026-10-13): drop iMessage; students move to plain Telnyx SMS. Quotes: "or just move it to telnyx??", "forget about having imessage part", "just sms is fine with me", "this will help me not even depend on mac etc", "lets wire telnyx anyway".
- HostMyApple cancelled the Mac mini service on 2026-10-13. `canary.internjobs.ai` returns CF 1033 (tunnel down), and student iMessage is down in production.
- Production `apps/app/fly.toml:11` has `SMS_PROVIDER = "mac-bridge"`, so outbound student messages currently fail.

## Locked decisions

- **Channel:** plain SMS through Telnyx. No iMessage, BlueBubbles, Mac or Spectrum fallback.
- **Integration point:** the existing seam at `apps/app/src/sms/provider.mjs` (sendSms / verifyWebhook / parseInbound). Add a Telnyx implementation selected by `SMS_PROVIDER=telnyx`. Don't restructure the agent, pairing or store logic beyond what SMS needs.
- **Number:** NOT decided (reuse the startup toll-free `STARTUP_TELNYX_NUMBER` or buy a new student number). Code must read it from config (`TELNYX_FROM_NUMBER`), so the choice only matters at cutover.
- **Credentials:** the old Telnyx API key is dead (D21). Raj must create a new one. It goes to Infisical (project `26995afd...`, env `prod`, path `/internjobs-ai`) before use, then to Fly secrets. Never into git (the repo is public).
- **Carrier registration** (toll-free verification or A2P 10DLC) is external and slow. Code and tests must not wait on it. The live cutover plan states it as a precondition.

## Constraints

- TDD-first: failing tests (with negative controls) before implementation, RED then GREEN evidence in SUMMARY. `apps/app` uses `node --test` (see `src/auth.test.mjs`).
- **Webhook security:** inbound Telnyx webhooks must be signature-verified (Telnyx Ed25519 `telnyx-signature-ed25519` + `telnyx-timestamp`, with replay window). Reject unsigned or forged requests. Keep the existing Lakera pre-LLM screen (SAFETY-01) on the new inbound path, the same as the mac-bridge path.
- **Inbound dedupe:** by Telnyx message id, so retried webhooks don't double-fire the agent.
- **Opt-out:** STOP/HELP keywords must be handled or respected. Carriers and Telnyx enforce STOP, and the app must not keep messaging an opted-out number.
- **Pairing/onboarding:** the student flow currently tells students to send the code "through iMessage" (`src/views.mjs` ~298 and 377) and claims it on `/webhooks/mac-bridge`. Copy and route must become SMS/Telnyx. `pairing.mjs` already accepts a channelType.
- **D10:** `main` is frozen to non-v1.6 changes until Phase 41. Build on a branch. Merging to main and deploying to Fly need Raj's explicit recorded exception (urgent outage), plus his approval for the live production steps. Executors stop and report.
- **Live production steps** (Fly secrets, `SMS_PROVIDER` flip, Telnyx messaging-profile webhook URL, a real round-trip SMS) are executor tasks gated on Raj's recorded approval, each with a readback that fails before and passes after.
- **Decommission** (mac-bridge code, canary-monitor Worker, bridge/canary tunnel hostnames, `/webhooks/mac-bridge` route) happens only after SMS is proven live. It's a later plan in this phase and is also approval-gated. Grep every place a removed rule or route is referenced and list each disposition.
- **Workspace (apps/parrot), startups (apps/startup) and agentic-inbox** are out of scope. They don't use the Mac. `apps/startup` has Phase 29 Telnyx SMS code (TypeScript Worker); reuse its knowledge (signature verification, payload shape), but don't import across apps unless trivial.

## D27 update (2026-10-13): number decided

- Port the existing student number **+1 406-321-0019** (`AGENT_NUMBER`) into Telnyx; it becomes `TELNYX_FROM_NUMBER` (same value as `AGENT_NUMBER`). Students keep texting the same number.
- Local number, so **A2P 10DLC** brand+campaign registration is required (run in parallel with the port).
- After the port, **deregister the number from iMessage**, or iPhone users' texts go blue and are lost. The Apple deregister SMS code is received through the new Telnyx inbound path, which doubles as a live inbound test.
- Port order (LOA, carrier account number/PIN) is a Raj action. The current carrier and account holder are unknown so far.

## Milestone provenance (2026-10-13)

- D28: Raj chose a new milestone v1.7 for this work instead of inserted Phase 39.1 in v1.6. The research was written as `39.1-RESEARCH.md` and now lives at `research/TELNYX-SMS-RESEARCH.md`. Where it says "Phase 39.1", read v1.7.
- D29: Raj chose "Pause v1.6, v1.7 active". v1.6 pauses at Phase 39 (39-04 blocked on rotation D22/D24; 39-10 not started) and resumes after v1.7.
- Decision source of truth for D26–D29: `.planning/milestones/v1.6-repo-split/CONTEXT.md` (where they were made); mirrored here.

## Carry-forward to Phase 46 (cutover), from Phase 44
- Apply migration 0016 (`sms_opt_outs`) to the production student DB BEFORE setting `SMS_PROVIDER=telnyx`. Without it every Telnyx send fails closed (`opt_out_check_failed`).
- D34: the Telnyx route goes live once `TELNYX_WEBHOOK_PUBLIC_KEY` is set (signed canary possible before the outbound flip). Check for double HELP replies (Telnyx auto-response vs ours).
- Phase 44 merge needs its own recorded D10 exception (D33 covered Phase 43 only).
- From 44-04 verification: on the Telnyx route a pairing `confirmation.error` still returns 422 (inherited handler behaviour), which makes Telnyx retry a message that can never succeed. Review in Phase 46 (prefer 200 + logged error for non-retryable outcomes).

## Push of docs/v1.7-telnyx-sms (2026-10-15)
Pushed to the public repo by the orchestrator, with the secret scan run right after the push rather than before (a process slip, disclosed). gitleaks over origin/main..branch (117 commits) found 10 hits, all in Phase 38 commits already public on `docs/phase-38-code-map`: fake fixtures in `scripts/verify-code-maps.test.mjs` (the secret detector's own test strings, e.g. `sk-live-abcdefghijklmnop1234`) and placeholder `KEY=` examples in Phase 38 docs, the same class D25 recorded. The 53 v1.7-only commits (7d7721a..branch): no leaks. Rule going forward: scan before every push of a planning branch too.
