// ─── Internal safety-events API (Neon-exit 2026-05-21) ───────────────────
//
// The Parrot Worker (apps/parrot) used to read/write the safety_events
// table directly via @neondatabase/serverless. Once the student DB moved
// off Neon to a Fly-internal Postgres, a Cloudflare Worker can no longer
// reach it — so the Worker now calls these endpoints instead. The student
// app owns safety_events (it also writes the SMS-path rows via
// store.pool). Bearer-secret auth mirrors the GRAPH_API_SECRET pattern;
// every handler is fail-soft so the Worker degrades cleanly.
//
// v1.7 Phase 43-01: extracted from server.mjs so it can be unit tested.
// Returns an async (req, res, url) => boolean; true means the request was
// handled (a response was sent).

const SOURCE_ID_MAX = 512;

// Message identifier from the Worker (email Message-ID). Anything that is not
// a 1..512 char string after trimming is stored as NULL; the row is never
// rejected because of it.
export function normaliseSourceId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > SOURCE_ID_MAX) return null;
  return trimmed;
}

// pg 42703 = undefined_column (migration 0015 not applied yet).
function isUndefinedColumn(err) {
  return err?.code === "42703";
}

function logSourceIdColumnMissing(op) {
  // Never log source_id values or previews.
  console.warn(JSON.stringify({ level: "warn", event: "safety_events_source_id_column_missing", op }));
}

const LEGACY_LIST_COLUMNS = `id, channel, action, reason, score, sender_last4, preview,
                  employee_id, reviewed, reviewed_at, created_at`;
const LIST_COLUMNS = `${LEGACY_LIST_COLUMNS}, source_id`;

// The visible log window. Shared with "mark all reviewed" (see below).
const VISIBLE_WINDOW = "7 days";

function listSql(columns) {
  return `select ${columns}
             from safety_events
            where created_at > now() - interval '${VISIBLE_WINDOW}'
            order by created_at desc
            limit 100`;
}

export function createSafetyEventsHandler({ store, config, readBody, sendJson, safeStringEqual }) {
  return async function handleSafetyEvents(req, res, url) {
    if (!(url.pathname === "/internal/safety-events" || url.pathname.startsWith("/internal/safety-events/"))) {
      return false;
    }
    const authHeader = String(req.headers["authorization"] || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!config.internalApiSecret || !safeStringEqual(bearer, config.internalApiSecret)) {
      sendJson(res, 401, { error: "unauthorized" });
      return true;
    }
    if (!store?.pool) {
      if (req.method === "GET" && url.pathname.endsWith("/unreviewed-count")) { sendJson(res, 200, { count: 0 }); return true; }
      if (req.method === "GET") { sendJson(res, 200, { events: [], total: 0 }); return true; }
      sendJson(res, 200, { ok: true, skipped: "no_database" });
      return true;
    }

    // POST /internal/safety-events — insert one screening event.
    if (req.method === "POST" && url.pathname === "/internal/safety-events") {
      let body = {};
      try {
        const raw = String((await readBody(req)) || "");
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: "bad_json" });
        return true;
      }
      const legacyParams = [
        body.channel ?? "unknown",
        body.action ?? "flagged",
        body.reason ?? null,
        body.score ?? null,
        body.sender_last4 ?? null,
        body.preview ?? null,
        body.employee_id ?? null,
      ];
      try {
        try {
          await store.pool.query(
            `insert into safety_events
               (channel, action, reason, score, sender_last4, preview, employee_id, reviewed, source_id)
             values ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
            [...legacyParams, normaliseSourceId(body.source_id)],
          );
        } catch (err) {
          // Fly deploy can land before migration 0015 (or a rollback after it):
          // keep the row, just without source_id.
          if (!isUndefinedColumn(err)) throw err;
          logSourceIdColumnMissing("insert");
          await store.pool.query(
            `insert into safety_events
               (channel, action, reason, score, sender_last4, preview, employee_id, reviewed)
             values ($1, $2, $3, $4, $5, $6, $7, false)`,
            legacyParams,
          );
        }
        sendJson(res, 200, { ok: true });
      } catch (err) {
        console.error(JSON.stringify({ level: "error", event: "safety_events_write_failed", error: err?.message ?? String(err) }));
        sendJson(res, 500, { ok: false, error: "write_failed" });
      }
      return true;
    }

    // GET /internal/safety-events — paginated flag log (last 100, 7 days).
    if (req.method === "GET" && url.pathname === "/internal/safety-events") {
      try {
        let rows;
        try {
          ({ rows } = await store.pool.query(listSql(LIST_COLUMNS)));
        } catch (err) {
          // Same deploy-before-migration window as the insert above.
          if (!isUndefinedColumn(err)) throw err;
          logSourceIdColumnMissing("select");
          ({ rows } = await store.pool.query(listSql(LEGACY_LIST_COLUMNS)));
        }
        sendJson(res, 200, { events: rows, total: rows.length });
      } catch (err) {
        console.error(JSON.stringify({ level: "error", event: "ops_safety_query_failed", error: err?.message ?? String(err) }));
        sendJson(res, 200, { events: [], total: 0, error: "query_failed" });
      }
      return true;
    }

    // GET /internal/safety-events/unreviewed-count — badge count (24h).
    if (req.method === "GET" && url.pathname === "/internal/safety-events/unreviewed-count") {
      try {
        const { rows } = await store.pool.query(
          `select count(*)::int as n
             from safety_events
            where reviewed = false
              and action in ('flagged', 'blocked')
              and created_at > now() - interval '24 hours'`,
        );
        sendJson(res, 200, { count: rows[0]?.n ?? 0 });
      } catch (err) {
        console.error(JSON.stringify({ level: "error", event: "ops_safety_unreviewed_count_failed", error: err?.message ?? String(err) }));
        sendJson(res, 200, { count: 0 });
      }
      return true;
    }

    // POST /internal/safety-events/mark-reviewed — mark event(s) reviewed.
    if (req.method === "POST" && url.pathname === "/internal/safety-events/mark-reviewed") {
      let body = {};
      try {
        const raw = String((await readBody(req)) || "");
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: "bad_json" });
        return true;
      }
      const ids = Array.isArray(body.ids) ? body.ids : null;
      const reviewedBy = typeof body.reviewed_by === "string" && body.reviewed_by ? body.reviewed_by : "operator";
      try {
        if (ids && ids.length > 0) {
          await store.pool.query(
            `update safety_events
                set reviewed = true, reviewed_at = now(), reviewed_by = $2
              where id = any($1::uuid[])`,
            [ids, reviewedBy],
          );
        } else {
          await store.pool.query(
            `update safety_events
                set reviewed = true, reviewed_at = now(), reviewed_by = $1
              where reviewed = false
                and created_at > now() - interval '24 hours'`,
            [reviewedBy],
          );
        }
        sendJson(res, 200, { ok: true });
      } catch (err) {
        console.error(JSON.stringify({ level: "error", event: "ops_safety_mark_reviewed_failed", error: err?.message ?? String(err) }));
        sendJson(res, 500, { ok: false, error: "update_failed" });
      }
      return true;
    }

    sendJson(res, 404, { error: "not_found" });
    return true;
  };
}
