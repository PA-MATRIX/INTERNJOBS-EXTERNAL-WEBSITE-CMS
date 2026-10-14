// v1.3 Phase 20 SAFETY-VIEW-01 — /api/ops/safety API routes.
//
//   GET  /api/ops/safety                    — paginated flag log (operator-only)
//   GET  /api/ops/safety/unreviewed-count   — badge count (any authed employee)
//   POST /api/ops/safety/mark-reviewed      — mark event(s) reviewed (operator-only)
//   POST /api/ops/safety/:eventId/move-to-inbox
//                                           — v1.7 Phase 43-02: move a quarantined
//                                             email from the OWNING employee's Spam
//                                             to their Inbox (operator-only; D31 no
//                                             auto-trust; D32 unique-match fallback;
//                                             audit log line on every attempt)
//
// Neon-exit (2026-05-21): safety_events lives in the student app's Postgres
// (see apps/app migration 0009_v1_3_safety_events.sql). That DB moved off
// Neon to a Fly-internal host the Worker can't reach, so these routes now
// proxy to the student app's /internal/safety-events API (Bearer
// STUDENT_API_SECRET). When STUDENT_API_URL/SECRET are unset or the call
// fails, every route degrades fail-soft and returns empty results.

import { Hono } from "hono";
import type { ParrotContext } from "../lib/mailbox";
import { getMailboxStub } from "../lib/mailbox";
import { requireOperator } from "../lib/operator";
import {
	canMoveToInbox,
	moveQuarantinedToInbox,
	type SafetyEventRow,
	type SafetyMoveMailbox,
} from "../lib/safety-move";
import { getFolderDisplayName } from "../../shared/folders";

// Human-readable labels for Lakera reason codes (FEATURES.md UX gotcha:
// raw codes are confusing in the table — operators want plain English).
const REASON_LABELS: Record<string, string> = {
	prompt_injection: "Injection attempt",
	jailbreak: "Jailbreak attempt",
	pii_detection: "Personal info detected",
	unknown: "Policy violation",
	passed_lakera_unavailable: "Lakera unavailable (passed through)",
	lakera_flagged: "Flagged by Lakera Guard",
};

// Call the student app's internal safety-events API. Returns null when the
// API is not configured or the request throws — callers degrade fail-soft.
async function callStudentApi(
	env: { STUDENT_API_URL?: string; STUDENT_API_SECRET?: string },
	path: string,
	init?: RequestInit,
): Promise<Response | null> {
	if (!env.STUDENT_API_URL || !env.STUDENT_API_SECRET) return null;
	try {
		return await fetch(`${env.STUDENT_API_URL}${path}`, {
			...init,
			headers: {
				...(init?.headers ?? {}),
				authorization: `Bearer ${env.STUDENT_API_SECRET}`,
				"content-type": "application/json",
			},
		});
	} catch {
		return null;
	}
}

export const opsSafety = new Hono<ParrotContext>();

// GET /api/ops/safety — paginated flag log (last 100 events, last 7 days).
// Operator-only.
opsSafety.get("/", requireOperator, async (c) => {
	const res = await callStudentApi(c.env, "/internal/safety-events");
	if (!res || !res.ok) {
		return c.json({ events: [], total: 0, error: "safety_events_not_configured" });
	}
	try {
		const data = (await res.json()) as { events?: SafetyEventRow[] };
		const events = (data.events ?? []).map((row) => {
			// source_id is an internal identifier (Message-ID / mailbox uuid);
			// the browser never needs it — Move to Inbox resolves it server-side.
			const { source_id: _sourceId, ...rest } = row;
			return {
				...rest,
				reason_label: REASON_LABELS[row.reason ?? ""] ?? String(row.reason ?? "unknown"),
				preview: String(row.preview ?? "").slice(0, 80),
				can_move_to_inbox: canMoveToInbox(row),
			};
		});
		return c.json({ events, total: events.length });
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				event: "ops_safety_query_failed",
				error: (err as Error)?.message ?? String(err),
			}),
		);
		return c.json({ events: [], total: 0, error: "query_failed" });
	}
});

// GET /api/ops/safety/unreviewed-count — red-dot badge data.
// Returns count of unreviewed flagged events within last 24h.
// Accessible to ANY authenticated employee (not operator-only) so the badge
// shows for all workspace members when there's a safety flag.
opsSafety.get("/unreviewed-count", async (c) => {
	const res = await callStudentApi(c.env, "/internal/safety-events/unreviewed-count");
	if (!res || !res.ok) {
		return c.json({ count: 0 });
	}
	try {
		const data = (await res.json()) as { count?: number };
		return c.json({ count: data.count ?? 0 });
	} catch {
		return c.json({ count: 0 });
	}
});

// POST /api/ops/safety/mark-reviewed — operator marks event(s) reviewed.
opsSafety.post("/mark-reviewed", requireOperator, async (c) => {
	const body = await c.req.json<{ ids?: string[] }>().catch(() => ({}) as { ids?: string[] });
	const employee = c.var.employee;
	const reviewedBy = employee?.email ?? "operator";
	const res = await callStudentApi(c.env, "/internal/safety-events/mark-reviewed", {
		method: "POST",
		body: JSON.stringify({ ids: body?.ids, reviewed_by: reviewedBy }),
	});
	if (!res || !res.ok) {
		return c.json({ ok: false, error: "not_configured" }, 503);
	}
	return c.json({ ok: true });
});

// POST /api/ops/safety/:eventId/move-to-inbox — v1.7 Phase 43-02.
//
// The ONLY route that opens ANOTHER employee's mailbox (the target is the
// safety row's employee_id, resolved to its Clerk id via WorkspaceDO). Gated by
// the same requireOperator as the rest of this file; D31 (Raj, 2026-10-13) is
// the recorded approval. Never trusts the sender (D31). Emits one structured
// audit line per attempt (actor + target; no preview or sender text) — the
// mailbox DO has no audit_events table, so this line plus reviewed_by on the
// safety row is the audit trail.
opsSafety.post("/:eventId/move-to-inbox", requireOperator, async (c) => {
	const eventId = c.req.param("eventId");
	const actor = c.var.employee;
	const actorEmail = actor?.email ?? "operator";

	const audit = (
		outcome: string,
		match: string | null,
		targetEmployeeId: string | null,
	) => {
		console.log(
			JSON.stringify({
				level: "info",
				event: "ops_safety_move_to_inbox",
				actor_email: actorEmail,
				actor_id: actor?.employeeId ?? null,
				target_employee_id: targetEmployeeId,
				safety_event_id: eventId,
				outcome,
				match,
			}),
		);
	};

	const listRes = await callStudentApi(c.env, "/internal/safety-events");
	if (!listRes || !listRes.ok) {
		audit("unavailable", null, null);
		return c.json({ ok: false, outcome: "unavailable" }, 503);
	}
	let rows: SafetyEventRow[];
	try {
		const data = (await listRes.json()) as { events?: SafetyEventRow[] };
		rows = data.events ?? [];
	} catch {
		audit("unavailable", null, null);
		return c.json({ ok: false, outcome: "unavailable" }, 503);
	}

	const row = rows.find((r) => r.id === eventId);
	if (!row) {
		audit("event_not_found", null, null);
		return c.json({ ok: false, outcome: "event_not_found" }, 404);
	}
	const targetId = row.employee_id ?? null;
	if (row.channel !== "email") {
		audit("not_email", null, targetId);
		return c.json({ ok: false, outcome: "not_email" }, 400);
	}
	if (row.action !== "blocked") {
		audit("not_quarantined", null, targetId);
		return c.json({ ok: false, outcome: "not_quarantined" }, 400);
	}
	if (!targetId) {
		audit("no_target_employee", null, null);
		return c.json({ ok: false, outcome: "no_target_employee" }, 400);
	}

	const workspace = c.env.WORKSPACE.get(c.env.WORKSPACE.idFromName("workspace"));
	const employee = await workspace.getEmployeeById(targetId);
	if (!employee || !employee.clerk_user_id) {
		audit("not_found", null, targetId);
		return c.json({ ok: false, outcome: "not_found" }, 404);
	}

	const stub = getMailboxStub(c.env, employee.clerk_user_id) as unknown as SafetyMoveMailbox;
	const result = await moveQuarantinedToInbox(stub, row);
	audit(result.outcome, result.match, targetId);

	switch (result.outcome) {
		case "moved":
		case "already_in_inbox": {
			const mark = await callStudentApi(c.env, "/internal/safety-events/mark-reviewed", {
				method: "POST",
				body: JSON.stringify({ ids: [eventId], reviewed_by: actorEmail }),
			});
			return c.json({ ok: true, outcome: result.outcome, reviewed: !!mark?.ok }, 200);
		}
		case "elsewhere": {
			const folder = result.folder ?? "";
			return c.json(
				{ ok: false, outcome: "elsewhere", folder, folder_name: getFolderDisplayName(folder) },
				200,
			);
		}
		case "ambiguous":
			return c.json({ ok: false, outcome: "ambiguous" }, 409);
		default:
			return c.json({ ok: false, outcome: "not_found" }, 404);
	}
});
