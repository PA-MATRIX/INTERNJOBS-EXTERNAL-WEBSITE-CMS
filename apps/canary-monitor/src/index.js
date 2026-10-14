// ─── internjobs-canary-monitor ───────────────────────────────────────────────
//
// External watcher for the Mac mini's iMessage pipeline canary. See
// wrangler.toml for why this runs off-box.
//
// Every cron tick:
//   1. GET the canary endpoint (200 + {"status":"ok"} = healthy).
//   2. Compare against the last state in KV.
//   3. Email on transitions, and re-remind while still down.
//
// Alert policy — the goal is "always noticed, never muted":
//   ok    → down  : alert immediately
//   down  → down  : remind at most every REMINDER_HOURS
//   down  → ok    : send a recovery note (so a silent self-heal is still visible)
//   ok    → ok    : say nothing
//
// UNREACHABLE IS AN OUTAGE. A timeout, DNS failure, or 5xx from the tunnel all
// mean the pipeline is not provably working, which is the only thing that
// matters. Treating "no answer" as inconclusive is what let the 2026-08 outage
// run for four days.

import { EmailMessage } from "cloudflare:email";

const STATE_KEY = "canary:last";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCheck(env, { trigger: "cron" }));
  },

  // Manual surface, for verifying the Worker without waiting on cron.
  //   GET /            → current stored state, read-only, no email
  //   GET /check       → run a real check now (may email)
  //   GET /test-alert  → force a test email; requires ?token=<MONITOR_TEST_TOKEN>
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/test-alert") {
      const token = url.searchParams.get("token") ?? "";
      // Constant-ish time compare is overkill here, but bail loudly if the
      // secret was never set so a blank token can't authorize a send.
      if (!env.MONITOR_TEST_TOKEN || token !== env.MONITOR_TEST_TOKEN) {
        return json({ error: "unauthorized" }, 401);
      }
      const probe = await probeCanary(env);
      await sendAlert(env, {
        subject: "[canary] TEST — alerting path works",
        body: testBody(probe),
      });
      return json({ sent: true, probe });
    }

    if (url.pathname === "/check") {
      return json(await runCheck(env, { trigger: "manual" }));
    }

    const last = await readState(env);
    return json({ worker: "internjobs-canary-monitor", last });
  },
};

// ─── Core check ──────────────────────────────────────────────────────────────

async function runCheck(env, { trigger }) {
  const now = Date.now();
  const probe = await probeCanary(env);
  const last = await readState(env);

  const wasHealthy = last?.healthy === true;
  const isHealthy = probe.healthy;

  let action = "none";

  if (!isHealthy && wasHealthy) {
    action = "alert_new";
  } else if (!isHealthy && !wasHealthy) {
    // Still down. Remind only when the reminder window has elapsed, so the
    // alert stays meaningful instead of becoming background noise.
    const reminderMs = Number(env.REMINDER_HOURS ?? 6) * 3600 * 1000;
    const lastNotified = last?.lastNotifiedAt ?? 0;
    if (now - lastNotified >= reminderMs) action = "alert_reminder";
  } else if (isHealthy && last && !wasHealthy) {
    action = "recovery";
  }
  // isHealthy && (no prior state) → first ever run, healthy: stay quiet.

  // downSince: preserved across consecutive failures so the alert can state
  // how long this has actually been going on.
  const downSince = !isHealthy ? (last && !wasHealthy ? (last.downSince ?? now) : now) : null;

  let notified = false;
  if (action !== "none") {
    try {
      await sendAlert(env, buildAlert({ action, probe, downSince, now, last }));
      notified = true;
    } catch (err) {
      // Never let a mail failure poison the state write — otherwise a transient
      // send error would reset downSince and re-alert from scratch next tick.
      console.error(
        JSON.stringify({
          level: "error",
          message: "canary_alert_send_failed",
          action,
          error: err?.message ?? String(err),
        }),
      );
    }
  }

  const state = {
    healthy: isHealthy,
    checkedAt: now,
    downSince,
    // Only advance the notify clock when an email actually went out, so a
    // failed send is retried on the next tick rather than silently skipped.
    lastNotifiedAt: notified ? now : (last?.lastNotifiedAt ?? 0),
    detail: probe.detail,
  };
  await env.CANARY_MONITOR_STATE.put(STATE_KEY, JSON.stringify(state));

  console.log(
    JSON.stringify({
      level: "info",
      message: "canary_check",
      trigger,
      healthy: isHealthy,
      action,
      notified,
      detail: probe.detail,
    }),
  );

  return { healthy: isHealthy, action, notified, probe, downSince };
}

// Fetch the canary. Any non-200, unparseable body, or non-"ok" status is
// unhealthy; so is a network failure or timeout.
async function probeCanary(env) {
  const timeoutMs = Number(env.FETCH_TIMEOUT_S ?? 20) * 1000;
  try {
    const res = await fetch(env.CANARY_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "internjobs-canary-monitor" },
      cf: { cacheTtl: 0 },
    });
    const text = await res.text();

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // fall through — a body we can't parse is itself a failure signal
    }

    const healthy = res.status === 200 && parsed?.status === "ok";
    return {
      healthy,
      httpStatus: res.status,
      canaryStatus: parsed?.status ?? null,
      checks: parsed?.checks ?? null,
      failures: parsed?.failures ?? null,
      detail: healthy
        ? "ok"
        : `http=${res.status} status=${parsed?.status ?? "unparseable"} failures=${parsed?.failures ?? "?"}`,
    };
  } catch (err) {
    const reason = err?.name === "TimeoutError" ? "timeout" : (err?.message ?? String(err));
    return {
      healthy: false,
      httpStatus: null,
      canaryStatus: null,
      checks: null,
      failures: null,
      // This is the case an on-box alerter can never report.
      detail: `unreachable (${reason})`,
    };
  }
}

// ─── Alert composition ───────────────────────────────────────────────────────

function buildAlert({ action, probe, downSince, now, last }) {
  if (action === "recovery") {
    const downMin = last?.downSince ? Math.round((now - last.downSince) / 60000) : null;
    return {
      subject: "[canary] RECOVERED — iMessage pipeline is back",
      body: [
        "The InternJobs iMessage pipeline is healthy again.",
        "",
        downMin !== null ? `Down for roughly ${formatDuration(downMin)}.` : "",
        `Checks: ${probe.checks ?? "(none)"}`,
        "",
        "Dashboard: https://canary.internjobs.ai/",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  const downMin = downSince ? Math.round((now - downSince) / 60000) : 0;
  const isReminder = action === "alert_reminder";

  return {
    subject: isReminder
      ? `[canary] STILL DOWN — iMessage pipeline (${formatDuration(downMin)})`
      : "[canary] DOWN — iMessage pipeline is not delivering",
    body: [
      "Candidates cannot exchange iMessages with the agent.",
      "",
      `Down for: ${formatDuration(downMin)}`,
      `Detail:   ${probe.detail}`,
      `Checks:   ${probe.checks ?? "(canary unreachable)"}`,
      `Failures: ${probe.failures ?? "(canary unreachable)"}`,
      "",
      "── Triage ──────────────────────────────────────────",
      "Get on the Mac via NoMachine :4000 (SSH/22 is firewalled at the host).",
      "",
      "Then read the IDS registration state — it decides the fix:",
      "  sudo log show --last 5m --predicate 'process == \"identityservicesd\"' \\",
      "    | grep -iE 'Setup state|hasSetupCompleted'",
      "",
      "  Setup state 2  → registration lost      → sudo reboot re-registers",
      "  Setup state 1  → parked at the macOS    → clear the setup screen in the GUI.",
      "  hasSetupCompleted: NO   setup screen      A REBOOT MAKES THIS WORSE.",
      "",
      "Ground truth is chat.db, never /health (which is a static {ok:true}):",
      "  sqlite3 ~/Library/Messages/chat.db \\",
      "    'select ROWID,is_from_me,is_delivered,error from message order by ROWID desc limit 5;'",
      "",
      "Dashboard: https://canary.internjobs.ai/",
    ].join("\n"),
  };
}

function testBody(probe) {
  return [
    "This is a test from internjobs-canary-monitor.",
    "If you are reading this, the alerting path works end to end.",
    "",
    `Live canary right now: ${probe.healthy ? "HEALTHY" : "UNHEALTHY"}`,
    `Detail: ${probe.detail}`,
    `Checks: ${probe.checks ?? "(none)"}`,
    "",
    "Dashboard: https://canary.internjobs.ai/",
  ].join("\n");
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ${minutes % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// ─── Email ───────────────────────────────────────────────────────────────────

// Hand-rolled MIME so this Worker needs no dependencies. Headers must be
// CRLF-separated with a blank line before the body or CF rejects the message.
async function sendAlert(env, { subject, body }) {
  const from = env.ALERT_FROM;
  const to = env.ALERT_TO;
  const messageId = `<canary-${Date.now()}-${crypto.randomUUID()}@internjobs.ai>`;

  const raw = [
    `From: InternJobs Canary <${from}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    body,
  ].join("\r\n");

  await env.ALERT_EMAIL.send(new EmailMessage(from, to, raw));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function readState(env) {
  const raw = await env.CANARY_MONITOR_STATE.get(STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
