// v1.7 Phase 43-02 (LAK-01/LAK-03, D31, D32): Move-to-Inbox orchestrator.
import { describe, it, expect, vi } from "vitest";
import {
	canMoveToInbox,
	moveQuarantinedToInbox,
	type SafetyEventRow,
} from "../../lib/safety-move";

function row(over: Partial<SafetyEventRow> = {}): SafetyEventRow {
	return {
		id: "evt-1",
		channel: "email",
		action: "blocked",
		reason: "lakera_flagged",
		score: 0.9,
		sender_last4: ".com",
		preview: "Synthetic preview text",
		employee_id: "emp-1",
		reviewed: false,
		reviewed_at: null,
		created_at: "2026-10-10T12:00:00.000Z",
		source_id: "<msg-1@example.test>",
		...over,
	};
}

function stub(opts: {
	exact?: { id: string; folder_id: string } | null;
	candidates?: Array<{ id: string; folder_id: string }>;
	moveResult?: boolean;
} = {}) {
	return {
		findEmailBySourceId: vi.fn(async () => opts.exact ?? null),
		findSpamCandidatesByPreview: vi.fn(async () => opts.candidates ?? []),
		moveEmail: vi.fn(async () => opts.moveResult ?? true),
		trustSender: vi.fn(async () => undefined),
	};
}

describe("canMoveToInbox", () => {
	it("true only for email + blocked + employee_id", () => {
		expect(canMoveToInbox(row())).toBe(true);
		expect(canMoveToInbox(row({ channel: "sms" }))).toBe(false);
		expect(canMoveToInbox(row({ action: "flagged" }))).toBe(false);
		expect(canMoveToInbox(row({ employee_id: null }))).toBe(false);
		expect(canMoveToInbox(row({ employee_id: "" }))).toBe(false);
	});
});

describe("moveQuarantinedToInbox", () => {
	it("moved: Spam -> moveEmail(id,'inbox') once", async () => {
		const s = stub({ exact: { id: "e1", folder_id: "spam" } });
		const r = await moveQuarantinedToInbox(s, row());
		expect(r).toMatchObject({ outcome: "moved", match: "source_id", emailId: "e1" });
		expect(s.findEmailBySourceId).toHaveBeenCalledWith("<msg-1@example.test>");
		expect(s.moveEmail).toHaveBeenCalledTimes(1);
		expect(s.moveEmail).toHaveBeenCalledWith("e1", "inbox");
	});

	it("already_in_inbox: no move", async () => {
		const s = stub({ exact: { id: "e1", folder_id: "inbox" } });
		const r = await moveQuarantinedToInbox(s, row());
		expect(r.outcome).toBe("already_in_inbox");
		expect(s.moveEmail).not.toHaveBeenCalled();
	});

	it("elsewhere: trash / archive left alone and folder reported", async () => {
		for (const folder of ["trash", "archive"]) {
			const s = stub({ exact: { id: "e1", folder_id: folder } });
			const r = await moveQuarantinedToInbox(s, row());
			expect(r).toMatchObject({ outcome: "elsewhere", folder });
			expect(s.moveEmail).not.toHaveBeenCalled();
		}
	});

	it("not_found when the exact lookup misses", async () => {
		const s = stub({ exact: null });
		const r = await moveQuarantinedToInbox(s, row());
		expect(r).toMatchObject({ outcome: "not_found", match: "source_id" });
	});

	it("exact miss never falls through to heuristic", async () => {
		const s = stub({ exact: null, candidates: [{ id: "c1", folder_id: "spam" }] });
		const r = await moveQuarantinedToInbox(s, row());
		expect(r.outcome).toBe("not_found");
		expect(s.findSpamCandidatesByPreview).not.toHaveBeenCalled();
		expect(s.moveEmail).not.toHaveBeenCalled();
	});

	it("heuristic: exactly one candidate is moved (D32)", async () => {
		const s = stub({ candidates: [{ id: "c1", folder_id: "spam" }] });
		const r = await moveQuarantinedToInbox(s, row({ source_id: null }));
		expect(r).toMatchObject({ outcome: "moved", match: "heuristic", emailId: "c1" });
		expect(s.findEmailBySourceId).not.toHaveBeenCalled();
		expect(s.findSpamCandidatesByPreview).toHaveBeenCalledWith(
			"Synthetic preview text",
			"2026-10-10T12:00:00.000Z",
		);
		expect(s.moveEmail).toHaveBeenCalledWith("c1", "inbox");
	});

	it("heuristic: zero candidates -> not_found", async () => {
		const s = stub({ candidates: [] });
		const r = await moveQuarantinedToInbox(s, row({ source_id: undefined }));
		expect(r).toMatchObject({ outcome: "not_found", match: "heuristic" });
		expect(s.moveEmail).not.toHaveBeenCalled();
	});

	it("ambiguous: two or more candidates -> nothing moved (D32)", async () => {
		const s = stub({
			candidates: [
				{ id: "c1", folder_id: "spam" },
				{ id: "c2", folder_id: "spam" },
			],
		});
		const r = await moveQuarantinedToInbox(s, row({ source_id: null }));
		expect(r).toMatchObject({ outcome: "ambiguous", match: "heuristic" });
		expect(s.moveEmail).not.toHaveBeenCalled();
	});

	it("trustSender never called (D31)", async () => {
		const cases = [
			stub({ exact: { id: "e1", folder_id: "spam" } }),
			stub({ exact: { id: "e1", folder_id: "inbox" } }),
			stub({ exact: null }),
		];
		for (const s of cases) {
			await moveQuarantinedToInbox(s, row());
			expect(s.trustSender).not.toHaveBeenCalled();
		}
		const h = stub({ candidates: [{ id: "c1", folder_id: "spam" }] });
		await moveQuarantinedToInbox(h, row({ source_id: null }));
		expect(h.trustSender).not.toHaveBeenCalled();
	});

	it("moveEmail returning false is reported as not_found, not moved", async () => {
		const s = stub({ exact: { id: "e1", folder_id: "spam" }, moveResult: false });
		const r = await moveQuarantinedToInbox(s, row());
		expect(r.outcome).toBe("not_found");
	});
});
