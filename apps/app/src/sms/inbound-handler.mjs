// v1.7 Phase 44-03: shared, provider-parameterised inbound SMS webhook handler.
//
// Extracted statement for statement from the POST /webhooks/mac-bridge route
// (server.mjs:836-1163 on origin/main 951e103). The only substitutions are:
//   - the literal "mac-bridge" -> providerName, "mac-bridge-pairing" ->
//     `${providerName}-pairing` (so mac-bridge values are byte-identical);
//   - macBridgeProvider -> the injected provider;
//   - the hard-block reply text -> the hardBlockReply dependency
//     (mac-bridge passes LEGACY_HARD_BLOCK_REPLY, the identical string);
//   - process.env.LAKERA_GUARD_API_KEY -> lakeraKey() (default: same read,
//     still at call time);
//   - console -> the injected log (default console);
//   - the two identical Lakera blocks -> one internal screenAndDispatch().
//
// Flow: verify -> parse -> START-code claim (when store.pool) -> legacy code
// confirm / recordInboundMessage -> unknown-sender reply -> welcome ->
// student_reply write + Lakera screen + workflow dispatch -> respond.
//
// ackEarly (Telnyx, SMS-04: 2xx within ~2 s): the slow steps (ensureLinkedIn,
// screen + dispatch, unknown-sender reply, welcome send) are queued and run
// AFTER the response, each in its own try/catch logging
// sms_post_ack_step_failed. DB writes (messaging/audit/inbound rows and the
// store's own dedupe) are never deferred. With ackEarly false (mac-bridge)
// every step is awaited inline at its original position, so ordering and
// error propagation are unchanged.

export const LEGACY_HARD_BLOCK_REPLY = "hey — couldn't process that one. try rephrasing?";

export function createInboundSmsHandler({
  providerName,
  provider,
  store,
  config,
  screenMessage,
  runStudentInboundWorkflow,
  claimPairingCode,
  parsePairingCode,
  ensureLinkedInProfileForFirstContact,
  createUnknownSenderText,
  createWelcomeText,
  hardBlockReply,
  readBody,
  sendJson,
  ackEarly = false,
  lakeraKey = () => process.env.LAKERA_GUARD_API_KEY || "",
  log = console,
}) {
  if (!providerName) throw new Error("createInboundSmsHandler: providerName is required");
  if (!provider) throw new Error("createInboundSmsHandler: provider is required");
  if (typeof hardBlockReply !== "string" || !hardBlockReply) {
    throw new Error("createInboundSmsHandler: hardBlockReply is required");
  }

  const pairingSource = `${providerName}-pairing`;

  // v1.3 SAFETY-01: Pre-LLM screen. Same hard-block rule (>=0.8) and
  // fail-open semantics as photon. `source` is providerName on the
  // student_reply path and `${providerName}-pairing` on the first-contact path.
  async function screenAndDispatch({ messageId, inbound, source }) {
    const _screenStart = Date.now();
    const screenResult = await screenMessage(inbound.text || "", lakeraKey());
    const _screenMs = Date.now() - _screenStart;
    log.log(JSON.stringify({ level: "info", event: "lakera_latency_ms", ms: _screenMs, channel: "sms", source }));
    const injectionScore = screenResult.score ?? 0;
    // Lakera v2 returns a binary flag (no per-category score) — `flagged: true`
    // alone is sufficient to hard-block. The `>= 0.8` clause is the forward-compat
    // shim for if Lakera ever re-introduces a per-category numeric score.
    const isHardBlock = screenResult.flagged === true || injectionScore >= 0.8;

    if (screenResult.action !== "passed") {
      log.log(JSON.stringify({
        level: "info",
        event: "lakera_screen",
        action: screenResult.action,
        reason: screenResult.reason,
        score: screenResult.score,
        channel: "sms",
        hard_block: isHardBlock,
        sender_last4: (inbound.channelAddress || "").slice(-4),
        message_id: messageId,
        source,
        preview: (inbound.text || "").slice(0, 80),
      }));

      store.pool.query(
        `insert into safety_events
           (channel, action, reason, score, sender_last4, preview, reviewed)
         values ($1, $2, $3, $4, $5, $6, false)`,
        [
          "sms",
          isHardBlock ? "blocked" : screenResult.action,
          screenResult.reason,
          screenResult.score,
          (inbound.channelAddress || "").slice(-4),
          (inbound.text || "").slice(0, 80),
        ],
      ).catch((err) => {
        log.error(JSON.stringify({ level: "error", event: "safety_events_write_failed", error: err?.message ?? String(err) }));
      });
    }

    if (isHardBlock) {
      try {
        await provider.sendSms(inbound.channelAddress, hardBlockReply);
      } catch (sendErr) {
        log.error(JSON.stringify({
          level: "error",
          event: "safety_block_reply_failed",
          source,
          error: sendErr?.message ?? String(sendErr),
        }));
      }
      // Agent never sees the text. Audit / pairing rows preserved.
    } else {
      runStudentInboundWorkflow({
        pool: store.pool,
        messageId,
        smsProvider: provider,
        config,
      }).catch((err) => {
        log.error(
          JSON.stringify({
            level: "error",
            message: "student_inbound_workflow_failed",
            source,
            messageId,
            error: err?.message ?? String(err),
          }),
        );
      });
    }
  }

  return async function handleInboundSms(req, res) {
    const post = [];
    // Non-early: run the step now, at its original position (errors propagate
    // exactly as before). Early: queue it for after the response.
    const run = async (fn) => (ackEarly ? void post.push(fn) : fn());
    const respond = async (status, body) => {
      sendJson(res, status, body);
      for (const fn of post) {
        try {
          await fn();
        } catch (err) {
          log.error(JSON.stringify({
            level: "error",
            event: "sms_post_ack_step_failed",
            source: providerName,
            error: err?.message ?? String(err),
          }));
        }
      }
    };

    const rawBody = await readBody(req);
    const verified = provider.verifyWebhook(req, rawBody);
    if (!verified.ok) {
      sendJson(res, 401, { error: "unauthorized", reason: verified.reason });
      return;
    }

    const payload = JSON.parse(rawBody || "{}");
    const inbound = provider.parseInbound(payload);

    // v1.2 Phase 09 — START- pairing-code branch. Runs BEFORE the legacy
    // hex/IJ-XXXXXX confirmPairingCode path so a Standout-style code
    // matches even if parseInbound's legacy regex happened to also pick
    // something up. claimPairingCode binds the phone atomically; on
    // success we fire the FIRST-CONTACT workflow with the LinkedIn
    // context already in place.
    const startCode = parsePairingCode(inbound.text);
    if (startCode && store?.pool) {
      const claim = await claimPairingCode(store.pool, startCode, inbound.channelAddress, {
        channelType: inbound.channelType,
      });
      if (claim.ok) {
        await run(() => ensureLinkedInProfileForFirstContact(claim.studentId));

        // Record the inbound for messaging_events observability and
        // write an inbound_messages row so the workflow has something
        // to consume. providerEventId from the provider is reused so
        // dedup still works on a retry.
        await store.writeMessagingEvent({
          provider: providerName,
          providerEventId: inbound.providerEventId,
          studentId: claim.studentId,
          direction: "inbound",
          channelType: inbound.channelType,
          channelAddress: inbound.channelAddress,
          eventType: "pairing_started",
          deliveryStatus: "received",
          metadata: { ...inbound.metadata, pairingCode: startCode, source: "phase-09" },
        });
        await store.writeAuditEvent(claim.studentId, "pairing_started", "provider", {
          code: startCode,
          channelType: inbound.channelType,
        });

        if (typeof store.writeInboundMessage === "function") {
          try {
            const messageId = await store.writeInboundMessage({
              provider: providerName,
              providerEventId: inbound.providerEventId,
              channelType: inbound.channelType,
              channelAddress: inbound.channelAddress,
              studentId: claim.studentId,
              body: inbound.text,
              metadata: { ...inbound.metadata, firstContact: true, pairingCode: startCode },
            });
            if (messageId && store?.pool) {
              await run(() => screenAndDispatch({ messageId, inbound, source: pairingSource }));
            }
          } catch (err) {
            log.error(
              JSON.stringify({
                level: "error",
                message: "write_inbound_message_failed",
                source: pairingSource,
                error: err?.message ?? String(err),
              }),
            );
          }
        }

        await respond(200, { ok: true, eventType: "pairing_started", studentId: claim.studentId });
        return;
      }

      // Code matched the START-XXXXXX format but the claim failed
      // (expired, already used, or phone already tied to this LinkedIn
      // profile). Record the attempt for ops review but don't fire any
      // workflow.
      const rejectedEventType =
        claim.reason === "phone_already_bound" || claim.reason === "linkedin_profile_required_for_pairing"
          ? "pairing_rejected"
          : "pairing_expired";
      await store.writeMessagingEvent({
        provider: providerName,
        providerEventId: inbound.providerEventId,
        studentId: null,
        direction: "inbound",
        channelType: inbound.channelType,
        channelAddress: inbound.channelAddress,
        eventType: rejectedEventType,
        deliveryStatus: "received",
        metadata: { ...inbound.metadata, pairingCode: startCode, reason: claim.reason },
      });
      await respond(200, { ok: false, eventType: rejectedEventType, reason: claim.reason });
      return;
    }

    const confirmation = inbound.code
      ? await store.confirmPairingCode({ ...inbound, provider: providerName })
      : await store.recordInboundMessage(inbound);

    if (!confirmation.error && confirmation.eventType === "unmatched_inbound" && !confirmation.duplicate) {
      const reply = createUnknownSenderText(config, inbound.text);
      await run(async () => {
        try {
          const sent = await provider.sendSms(inbound.channelAddress, reply);
          await store.writeMessagingEvent({
            provider: providerName,
            providerEventId: `${inbound.providerEventId}:unknown-reply`,
            studentId: null,
            direction: "outbound",
            channelType: inbound.channelType,
            channelAddress: inbound.channelAddress,
            eventType: "unknown_sender_registration_reply",
            deliveryStatus: sent?.status || "sent",
            metadata: {
              source: "unknown_sender",
              providerMessageId: sent?.providerMessageId || sent?.metadata?.providerMessageId || null,
            },
          });
        } catch (sendErr) {
          log.error(JSON.stringify({
            level: "error",
            event: "unknown_sender_reply_failed",
            source: providerName,
            error: sendErr?.message ?? String(sendErr),
          }));
        }
      });
    }

    if (confirmation.student && confirmation.welcomeNeeded) {
      await run(async () => {
        const welcome = await provider.sendSms(
          confirmation.student.channelAddress,
          createWelcomeText(confirmation.student),
        );
        await store.markWelcomeSent(confirmation.student.id, welcome.status, welcome.metadata);
      });
    }

    if (
      !confirmation.error &&
      confirmation.eventType === "student_reply" &&
      confirmation.student &&
      typeof store.writeInboundMessage === "function"
    ) {
      try {
        const messageId = await store.writeInboundMessage({
          provider: providerName,
          providerEventId: inbound.providerEventId,
          channelType: inbound.channelType,
          channelAddress: inbound.channelAddress,
          studentId: confirmation.student.id,
          body: inbound.text,
          metadata: inbound.metadata || {},
        });
        if (messageId && store?.pool) {
          await run(() => screenAndDispatch({ messageId, inbound, source: providerName }));
        }
      } catch (err) {
        log.error(
          JSON.stringify({
            level: "error",
            message: "write_inbound_message_failed",
            source: providerName,
            error: err?.message ?? String(err),
          }),
        );
      }
    }

    await respond(confirmation.error ? 422 : 200, {
      ok: !confirmation.error,
      duplicate: confirmation.duplicate,
      error: confirmation.error,
      eventType: confirmation.eventType,
    });
  };
}
