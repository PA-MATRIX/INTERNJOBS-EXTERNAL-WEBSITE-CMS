// v1.7 Phase 43-03 (LAK-01 UI, LAK-04 Mark-all): /ops/safety page helpers,
// reducer and the per-row Move to Inbox cell.
//
// Node environment (vitest include is workers/tests/**/*.test.ts), so the
// cell is rendered to static markup with react-dom/server instead of a DOM.
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	moveToInbox,
	markAllReviewed,
	outcomeMessage,
	safetyLogReducer,
	initialSafetyLogState,
	loaded,
	loadFailed,
	moveStarted,
	moveFinished,
	markAllStarted,
	markAllDone,
	dismissToast,
	type SafetyEvent,
	type SafetyLogState,
	type MoveStatus,
} from "../../../app/lib/safety-log";
import { SafetyMoveCell } from "../../../app/components/SafetyMoveCell";

function ev(over: Partial<SafetyEvent> = {}): SafetyEvent {
	return {
		id: "evt-1",
		channel: "email",
		action: "blocked",
		reason: "lakera_flagged",
		reason_label: "Flagged by safety screen",
		score: 0.9,
		sender_last4: ".com",
		preview: "Synthetic preview",
		employee_id: "emp-1",
		reviewed: false,
		created_at: "2026-10-10T12:00:00.000Z",
		can_move_to_inbox: true,
		...over,
	};
}

type FakeFetch = (path: string, init?: RequestInit) => Promise<Response>;

function respond(status: number, body: unknown): FakeFetch {
	return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function cell(event: SafetyEvent, status: MoveStatus = "idle"): string {
	return renderToStaticMarkup(
		createElement(SafetyMoveCell, { event, status, onMove: () => {} }),
	);
}

function stateWith(events: SafetyEvent[]): SafetyLogState {
	return safetyLogReducer(initialSafetyLogState, loaded(events));
}

describe("SafetyMoveCell", () => {
	it("renders a Move to Inbox button only for movable rows", () => {
		const movable = cell(ev());
		expect(movable).toMatch(/<button[^>]*>Move to Inbox<\/button>/);

		// Negative controls: the server flag is the only eligibility source.
		const sms = cell(ev({ channel: "sms", can_move_to_inbox: false }));
		expect(sms).not.toContain("<button");
		expect(sms).not.toContain("Move to Inbox");

		const soft = cell(ev({ action: "flagged", can_move_to_inbox: false }));
		expect(soft).not.toContain("<button");

		// The UI does not re-derive eligibility: an email+blocked row the server
		// marks ineligible still gets no button.
		const serverSaysNo = cell(ev({ can_move_to_inbox: false }));
		expect(serverSaysNo).not.toContain("<button");
	});

	it("moving state disables the button and a moved row shows Moved instead of the button", () => {
		const moving = cell(ev(), "moving");
		expect(moving).toMatch(/<button[^>]*disabled=""[^>]*>Moving…<\/button>/);

		const done = cell(ev(), "done");
		expect(done).not.toContain("<button");
		expect(done).toContain("Moved");

		// After an error the operator can retry.
		const errored = cell(ev(), "error");
		expect(errored).toMatch(/<button[^>]*>Move to Inbox<\/button>/);
		expect(errored).not.toContain('disabled=""');
	});
});

describe("moveToInbox", () => {
	it("posts to the move-to-inbox endpoint for the event id", async () => {
		const f = respond(200, { ok: true, outcome: "moved", reviewed: true });
		await moveToInbox(f, "evt/1");
		expect(f).toHaveBeenCalledTimes(1);
		const [path, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(path).toBe("/api/ops/safety/evt%2F1/move-to-inbox");
		expect(init.method).toBe("POST");
		expect(init.body).toBe("{}");
	});

	it("moveToInbox maps every server outcome to a distinct message", async () => {
		const moved = await moveToInbox(respond(200, { ok: true, outcome: "moved" }), "e");
		expect(moved).toMatchObject({ kind: "success", outcome: "moved", message: "Moved to Inbox" });

		const already = await moveToInbox(
			respond(200, { ok: true, outcome: "already_in_inbox" }),
			"e",
		);
		expect(already.message).toBe("Already in Inbox");
		expect(already.outcome).toBe("already_in_inbox");

		const elsewhere = await moveToInbox(
			respond(200, { ok: false, outcome: "elsewhere", folder: "archive", folder_name: "Archive" }),
			"e",
		);
		expect(elsewhere.kind).toBe("info");
		expect(elsewhere.message).toContain("Already moved out of Spam");
		expect(elsewhere.message).toContain("left where it is");
		expect(elsewhere.message).toContain("Archive");

		const notFound = await moveToInbox(respond(404, { ok: false, outcome: "not_found" }), "e");
		expect(notFound.kind).toBe("info");
		expect(notFound.message).toContain("Not found — check Spam");
		expect(notFound.message).toContain("deleted before Oct 9");
		expect(notFound.message).toContain("purged");

		const ambiguous = await moveToInbox(respond(409, { ok: false, outcome: "ambiguous" }), "e");
		expect(ambiguous.kind).toBe("info");
		expect(ambiguous.message).toContain("Not found — check Spam");
		expect(ambiguous.message).toContain("(several similar messages, nothing was moved)");

		const forbidden = await moveToInbox(respond(403, { error: "forbidden" }), "e");
		expect(forbidden).toMatchObject({
			kind: "error",
			message: "Only operators can move quarantined mail",
		});

		const messages = [moved, already, elsewhere, notFound, ambiguous, forbidden].map(
			(r) => r.message,
		);
		expect(new Set(messages).size).toBe(messages.length);
	});

	it("failures never read as success (negative control)", async () => {
		const failures = [
			await moveToInbox(respond(500, { error: "boom" }), "e"),
			await moveToInbox(respond(503, { ok: false, outcome: "unavailable" }), "e"),
			// A 500 whose body lies about success must still be an error.
			await moveToInbox(respond(500, { ok: true, outcome: "moved" }), "e"),
			await moveToInbox(
				vi.fn(async () => {
					throw new TypeError("network down");
				}),
				"e",
			),
			await moveToInbox(
				vi.fn(async () => new Response("not json", { status: 502 })),
				"e",
			),
		];
		for (const r of failures) {
			expect(r.kind).toBe("error");
			expect(r.message).toBe("Move failed — try again");
			expect(r.message).not.toBe("Moved to Inbox");
		}
	});

	it("outcomeMessage covers each outcome", () => {
		expect(outcomeMessage("moved")).toBe("Moved to Inbox");
		expect(outcomeMessage("already_in_inbox")).toBe("Already in Inbox");
		expect(outcomeMessage("not_found")).toContain("Not found — check Spam");
		expect(outcomeMessage("something_new")).toBe("Move failed — try again");
	});
});

describe("markAllReviewed", () => {
	it("markAllReviewed only clears local rows when the server confirmed", async () => {
		const state = stateWith([ev({ id: "a" }), ev({ id: "b", channel: "sms" })]);

		const failed = await markAllReviewed(respond(503, { error: "unavailable" }));
		expect(failed.ok).toBe(false);
		expect(failed.message).toBeTruthy();
		const afterFail = safetyLogReducer(state, markAllDone(failed));
		expect(afterFail.events.every((e) => e.reviewed === false)).toBe(true);
		expect(afterFail.toast).toMatchObject({ kind: "error" });

		const thrown = await markAllReviewed(
			vi.fn(async () => {
				throw new TypeError("offline");
			}),
		);
		expect(thrown.ok).toBe(false);

		const f = respond(200, { ok: true });
		const okRes = await markAllReviewed(f);
		expect(okRes.ok).toBe(true);
		const [path, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(path).toBe("/api/ops/safety/mark-reviewed");
		expect(init.method).toBe("POST");
		const afterOk = safetyLogReducer(state, markAllDone(okRes));
		expect(afterOk.events.every((e) => e.reviewed === true)).toBe(true);
		expect(afterOk.marking).toBe(false);
	});
});

describe("safetyLogReducer", () => {
	it("safetyLogReducer drives the page state", () => {
		let s = stateWith([ev({ id: "a" }), ev({ id: "b" })]);
		expect(s.loading).toBe(false);
		expect(s.statusById).toEqual({});
		expect(s.toast).toBeNull();

		s = safetyLogReducer(s, moveStarted("a"));
		expect(s.statusById.a).toBe("moving");
		expect(s.statusById.b ?? "idle").toBe("idle");

		s = safetyLogReducer(
			s,
			moveFinished("a", { kind: "success", outcome: "moved", message: "Moved to Inbox" }),
		);
		expect(s.statusById.a).toBe("done");
		expect(s.events.find((e) => e.id === "a")?.reviewed).toBe(true);
		expect(s.toast).toEqual({ kind: "success", message: "Moved to Inbox" });

		s = safetyLogReducer(s, moveStarted("b"));
		s = safetyLogReducer(
			s,
			moveFinished("b", {
				kind: "info",
				outcome: "not_found",
				message: outcomeMessage("not_found"),
			}),
		);
		expect(s.statusById.b).toBe("error");
		expect(s.events.find((e) => e.id === "b")?.reviewed).toBe(false);
		expect(s.toast?.kind).toBe("info");

		s = safetyLogReducer(s, dismissToast());
		expect(s.toast).toBeNull();

		s = safetyLogReducer(s, markAllStarted());
		expect(s.marking).toBe(true);
		s = safetyLogReducer(s, markAllDone({ ok: false, message: "nope" }));
		expect(s.marking).toBe(false);
		expect(s.events.find((e) => e.id === "b")?.reviewed).toBe(false);
		expect(s.toast).toEqual({ kind: "error", message: "nope" });
	});

	it("a refetch (loaded) replaces events but keeps finished row statuses", () => {
		let s = stateWith([ev({ id: "a" })]);
		s = safetyLogReducer(s, moveStarted("a"));
		s = safetyLogReducer(
			s,
			moveFinished("a", { kind: "success", outcome: "moved", message: "Moved to Inbox" }),
		);
		s = safetyLogReducer(s, loaded([ev({ id: "a", reviewed: true, can_move_to_inbox: false })]));
		expect(s.statusById.a).toBe("done");
		expect(s.events[0].reviewed).toBe(true);
		expect(s.toast).toEqual({ kind: "success", message: "Moved to Inbox" });
	});

	it("a failed load ends loading without wiping rows already on screen", () => {
		// Initial load failure (403 for a non-operator, network): empty state.
		const first = safetyLogReducer(initialSafetyLogState, loadFailed());
		expect(first.loading).toBe(false);
		expect(first.events).toEqual([]);

		// Refetch failure after a move: the table keeps its rows.
		const s = safetyLogReducer(stateWith([ev({ id: "a" })]), loadFailed());
		expect(s.loading).toBe(false);
		expect(s.events.map((e) => e.id)).toEqual(["a"]);
	});
});
