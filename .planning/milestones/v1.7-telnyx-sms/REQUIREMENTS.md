# Requirements: InternJobs.ai v1.7 — Students on Telnyx SMS (no Mac)

**Defined:** 2026-10-13
**Core Value:** InternJobs.ai helps students and startups meet through natural messages, not resume piles or application black holes.
**Current Milestone:** v1.7
**Sources:** decisions D26–D29 (`CONTEXT.md`), research `research/TELNYX-SMS-RESEARCH.md`. Scope was set by Raj's decisions on 2026-10-13 ("just sms is fine with me", "port it to telnyx", "keep going and finish this").

## v1.7 — Students on Telnyx SMS (Active)

### Lakera / Safety log (Phase 43, first — D30, D31, D32)

- [x] **LAK-01**: An operator (Ridhi, Raj) can press "Move to Inbox" on a blocked email row in the Workspace Safety Screening Log, and the quarantined email moves from that employee's Spam to their Inbox. Each move is audit-logged (actor, target employee, event id); the sender is NOT auto-trusted (D31). SMS rows and soft flags show no button.
- [x] **LAK-02**: Safety events keep the email's Message-ID (`source_id`) end to end (Worker → student app → table → API), so new rows link exactly to their stored email.
- [x] **LAK-03**: Rows logged before the fix are matched best-effort (Spam folder, preview prefix, time window) and moved only on exactly one match; otherwise the operator sees "not found — check Spam" (covers mail dropped 07-20..10-09) (D32).
- [x] **LAK-04**: Safety-log hygiene: the `lakera_flagged` reason shows a human label; "Mark all reviewed" persists for every row it marks; `apps/app/src/safety/screen.test.mjs` runs in CI (v1.5 gap 6).
- [ ] **LAK-05**: Live readback after deploy: the v1.5.1 quarantine readback stays GREEN, and the Trust-sender plus Move-to-Inbox UAT on production is recorded (closes the v1.5.1 human_needed item); Lakera tier/quota confirmed by Raj (LAKERA-V2-03).


### Messaging

- [ ] **SMS-01**: A student who texts the agent number gets their message received by the app through a Telnyx inbound webhook. Requests without a valid Telnyx Ed25519 signature (or outside the 300 s timestamp window) are rejected, and the app fails closed when the public key is not configured.
- [ ] **SMS-02**: The agent's replies to a student are sent as SMS through the Telnyx Messages API from the configured number when `SMS_PROVIDER=telnyx`, with the Telnyx message id recorded.
- [ ] **SMS-03**: A Telnyx webhook delivered twice for the same message produces exactly one stored inbound message and one agent run.
- [ ] **SMS-04**: Inbound SMS goes through the same Lakera pre-LLM screen as the mac-bridge path did (SAFETY-01 parity), and the webhook is acknowledged within Telnyx's 2 s budget, with screening and the agent running after the ack.

### Opt-out

- [ ] **OPT-01**: A student who texts STOP (or the standard synonyms) is recorded as opted out, and the app never sends them another message until they text START. HELP gets a fixed help reply.

### Pairing / onboarding

- [ ] **PAIR-01**: A new student pairing their phone is told to text the code by SMS (no iMessage wording), and the texted code claims their account through the Telnyx path.
- [ ] **PAIR-02**: Students paired during the iMessage era whose stored address is not an E.164 phone number are counted (read-only) and get a defined path, with re-pairing allowed despite `phone_already_bound`.

### Number and carrier

- [ ] **NUM-01**: +1 406-321-0019 is ported into Telnyx and assigned to a student messaging profile whose webhook points at the app (Raj supplies carrier, account holder, account number/PIN, LOA and invoice).
- [ ] **NUM-02**: The number is attached to an approved A2P 10DLC brand + campaign, so carriers deliver its traffic.
- [ ] **NUM-03**: The number is deregistered from iMessage, so iPhone senders' texts arrive as SMS instead of vanishing.

### Cutover

- [ ] **CUT-01**: Production runs `SMS_PROVIDER=telnyx`, with the Telnyx secrets stored in Infisical first and then Fly. A real round-trip (a phone texts the number, and the agent replies by SMS) is observed. This is approval-gated, with a recorded rollback target, and needs Raj's D10 exception before any merge or deploy from `main`.

### Carried security (from v1.6 Phase 39; see CARRYOVER.md §A)

- [ ] **SECO-01**: The leaked live Neon `neondb_owner` password (Parrot project) is rotated, Parrot's Fly `NEON_DATABASE_URL` and Infisical are updated in the same approved step, and a readback proves the old password fails and Parrot is healthy (D22, D24).
- [ ] **SECO-02**: The probably-live audit-webhook X-API-Key is rotated or revoked (Raj names the issuing service), and the three secret literals are removed from the Parrot tree in an approved Parrot change.

### Hygiene (carry-over; see CARRYOVER.md §E and research/STALE-WORK-AUDIT.md)

- [ ] **HYG-01**: Stale planning records are corrected (v1.4 boxes/traceability, PROJECT Context still naming Neon/Photon/iMessage, stale STATE blockers, top-level HANDOFF.md), and stale branches/worktrees from the audit are removed after Raj approves the exact list.

### Decommission

- [ ] **DECOM-01**: The Mac path is retired: `apps/mac-bridge`, the `/webhooks/mac-bridge` route and provider, the `internjobs-canary-monitor` Worker, the `bridge`/`canary` tunnel hostnames and the HostMyApple subscription. Every reference is grepped and listed with a disposition.

## Future Milestones

### Candidates

- Remaining carry-overs not pulled into v1.7 are listed with dispositions in `CARRYOVER.md` (startup Telnyx/Voice go-live, pilot install, SEC-ROTATE-ALL, human UAT backlog, etc.).

- **SMS-MMS**: inbound picture messages (MMS) handling. *Source: research.*

## Out of Scope

| Feature | Reason | Revisit? |
|---------|--------|----------|
| iMessage / blue bubbles, typing indicators, tapbacks | Raj dropped iMessage (D26) | Never (unless a Mac-free iMessage path appears) |
| Self-hosted Mac mini | Raj: "help me not even depend on mac" | Never |
| Second student number / toll-free | Porting keeps the known number and avoids a second number's cost (D27) | If 10DLC is refused |
| Startup Telnyx SMS / Voice AI go-live (v1.5 Phase 34) | Separate product surface, deferred under D8 | Later milestone |
| Workspace / Parrot changes | Workspace doesn't use the Mac | — |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAK-01 | Phase 43 | Complete |
| LAK-02 | Phase 43 | Complete |
| LAK-03 | Phase 43 | Complete |
| LAK-04 | Phase 43 | Complete |
| LAK-05 | Phase 43 | Partial — readbacks GREEN + UAT done; Lakera tier/quota pending (Raj) |
| SMS-01 | Phase 44 | Code complete (PR #30, verified); live at Phase 46 |
| SMS-02 | Phase 44 | Code complete (PR #30, verified); live at Phase 46 |
| SMS-03 | Phase 44 | Code complete (PR #30, verified); live at Phase 46 |
| SMS-04 | Phase 44 | Code complete (PR #30, verified); live at Phase 46 |
| OPT-01 | Phase 44 | Code complete (PR #30, verified); live at Phase 46 |
| PAIR-01 | Phase 44 | Code complete (PR #30, verified); live at Phase 46 |
| PAIR-02 | Phase 45 | Pending |
| NUM-01 | Phase 45 | Pending |
| NUM-02 | Phase 45 | Pending |
| NUM-03 | Phase 46 | Pending |
| CUT-01 | Phase 46 | Pending |
| DECOM-01 | Phase 47 | Pending |
| SECO-01 | Phase 48 | Pending |
| SECO-02 | Phase 48 | Pending |
| HYG-01 | Phase 49 | Pending |

**Coverage (v1.7):**
- Active requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-13*
*Last updated: 2026-10-13 after D30–D32 (Lakera first, carry-overs, operator move, best-effort match)*
