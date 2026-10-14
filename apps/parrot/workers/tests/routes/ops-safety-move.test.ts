// v1.7 Phase 43-02 (LAK-01 server, LAK-03, LAK-04 label; D31, D32):
// POST /api/ops/safety/:eventId/move-to-inbox and list enrichment.
//
// opsSafety is mounted on a bare Hono app with a middleware that sets
// c.var.employee (what the Clerk middleware does in production). The student
// API is faked via a stubbed global fetch; WORKSPACE and EMPLOYEE_MAILBOX are
// in-memory fakes. PARROT_CLERK_SECRET_KEY is left unset, so requireOperator
// never reaches Clerk over the network. All data is synthetic.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { opsSafety } from "../../routes/ops-safety";

const OPERATOR = {
	employeeId: "clerk-op",
	email: "op@example.test",
	displayName: "Op",
	publicMetadata: {},
};
const NON_OPERATOR = {
	employeeId: "clerk-staff",
	email: "staff@example.test",
	displayName: "Staff",
	publicMetadata: {},
};
const TARGET = {
	id: "emp-target",
	clerk_user_id: "clerk-target",
	workspace_email: "target@example.test",
};

type Loc = { id: string; folder_id: string };

function baseRow(over: Record<string, unknown> = {}) {
	return {
		id: "evt-1",
		channel: "email",
		action: "blocked",
		reason: "lakera_flagged",
		score: 0.97,
		sender_last4: "t.io",
		preview: "SECRET-PREVIEW-TEXT synthetic body start",
		employee_id: TARGET.id,
		reviewed: false,
		reviewed_at: null,
		created_at: "2026-10-10T12:00:00.000Z",
		source_id: "<msg-1@example.test>",
		...over,
	};
}

interface Harness {
	app: Hono;
	fetchMock: ReturnType<typeof vi.fn>;
	markReviewedBodies: Array<{ ids: string[]; reviewed_by: string }>;
	mailbox: {
		findEmailBySourceId: ReturnType<typeof vi.fn>;
		findSpamCandidatesByPreview: ReturnType<typeof vi.fn>;
		moveEmail: ReturnType<typeof vi.fn>;
		trustSender: ReturnType<typeof vi.fn>;
	};
	idFromName: ReturnType<typeof vi.fn>;
	getEmployeeById: ReturnType<typeof vi.fn>;
}

function harness(opts: {
	employee?: typeof OPERATOR | null;
	rows?: Array<Record<string, unknown>>;
	listStatus?: number | "throw";
	exact?: Loc | null;
	candidates?: Loc[];
	employeeRecord?: typeof TARGET | null;
} = {}): Harness {
	const markReviewedBodies: Harness["markReviewedBodies"] = [];
	const rows = opts.rows ?? [baseRow()];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith("/internal/safety-events/mark-reviewed")) {
			markReviewedBodies.push(JSON.parse(String(init?.body)));
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}
		if (url.endsWith("/internal/safety-events")) {
			if (opts.listStatus === "throw") throw new Error("unreachable");
			const status = opts.listStatus ?? 200;
			return new Response(JSON.stringify({ events: rows }), { status });
		}
		throw new Error(`unexpected fetch ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);

	const mailbox = {
		findEmailBySourceId: vi.fn(async () => opts.exact ?? null),
		findSpamCandidatesByPreview: vi.fn(async () => opts.candidates ?? []),
		moveEmail: vi.fn(async () => true),
		trustSender: vi.fn(async () => undefined),
	};
	const idFromName = vi.fn((name: string) => ({ name }));
	const getEmployeeById = vi.fn(async (id: string) =>
		opts.employeeRecord === null ? null : id === TARGET.id ? (opts.employeeRecord ?? TARGET) : null,
	);
	const env = {
		STUDENT_API_URL: "https://student.example.test",
		STUDENT_API_SECRET: "test-secret",
		PARROT_OPERATOR_EMAILS: OPERATOR.email,
		EMPLOYEE_MAILBOX: { idFromName, get: vi.fn(() => mailbox) },
		WORKSPACE: {
			idFromName: vi.fn(() => "ws-id"),
			get: vi.fn(() => ({ getEmployeeById })),
		},
	};

	const app = new Hono();
	const employee = opts.employee === undefined ? OPERATOR : opts.employee;
	app.use("*", async (c, next) => {
		if (employee) (c as any).set("employee", employee);
		await next();
	});
	app.route("/api/ops/safety", opsSafety as any);
	const origFetch = app.fetch.bind(app);
	(app as any).fetch = (req: Request) => origFetch(req, env as any);
	return { app, fetchMock, markReviewedBodies, mailbox, idFromName, getEmployeeById };
}

async function post(h: Harness, id = "evt-1") {
	const res = await h.app.fetch(
		new Request(`https://parrot.example.test/api/ops/safety/${id}/move-to-inbox`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		}),
	);
	const text = await res.text();
	let body: Record<string, unknown> = {};
	try {
		body = JSON.parse(text) as Record<string, unknown>;
	} catch {
		body = { raw: text };
	}
	return { status: res.status, body };
}

function auditLines(spy: ReturnType<typeof vi.spyOn>) {
	return spy.mock.calls
		.map((args) => String(args[0]))
		.filter((s) => s.includes("ops_safety_move_to_inbox"));
}

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("POST /api/ops/safety/:eventId/move-to-inbox", () => {
	it("non-operator gets 403 and nothing is touched", async () => {
		const h = harness({ employee: NON_OPERATOR, exact: { id: "e1", folder_id: "spam" } });
		const r = await post(h);
		expect(r.status).toBe(403);
		expect(h.fetchMock).not.toHaveBeenCalled();
		expect(h.idFromName).not.toHaveBeenCalled();
		expect(h.getEmployeeById).not.toHaveBeenCalled();
		for (const fn of Object.values(h.mailbox)) expect(fn).not.toHaveBeenCalled();
	});

	it("unauthenticated gets 401", async () => {
		const h = harness({ employee: null });
		const r = await post(h);
		expect(r.status).toBe(401);
		expect(h.fetchMock).not.toHaveBeenCalled();
		expect(h.mailbox.moveEmail).not.toHaveBeenCalled();
	});

	it("moves a quarantined email from Spam to Inbox (exact source_id match)", async () => {
		const h = harness({ exact: { id: "email-uuid-1", folder_id: "spam" } });
		const r = await post(h);
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ ok: true, outcome: "moved", reviewed: true });
		// The TARGET employee's mailbox, not the operator's.
		expect(h.getEmployeeById).toHaveBeenCalledWith(TARGET.id);
		expect(h.idFromName).toHaveBeenCalledWith(TARGET.clerk_user_id);
		expect(h.idFromName).not.toHaveBeenCalledWith(OPERATOR.employeeId);
		expect(h.mailbox.findEmailBySourceId).toHaveBeenCalledWith("<msg-1@example.test>");
		expect(h.mailbox.moveEmail).toHaveBeenCalledTimes(1);
		expect(h.mailbox.moveEmail).toHaveBeenCalledWith("email-uuid-1", "inbox");
		// D31: no auto-trust.
		expect(h.mailbox.trustSender).not.toHaveBeenCalled();
		expect(h.markReviewedBodies).toEqual([
			{ ids: ["evt-1"], reviewed_by: OPERATOR.email },
		]);
		// Never leak email id / content to the browser.
		const text = JSON.stringify(r.body);
		expect(text).not.toContain("email-uuid-1");
		expect(text).not.toContain("SECRET-PREVIEW-TEXT");
	});

	it("writes an audit line for every outcome", async () => {
		const cases: Array<{ opts: Parameters<typeof harness>[0]; outcome: string; match: string }> = [
			{ opts: { exact: { id: "e1", folder_id: "spam" } }, outcome: "moved", match: "source_id" },
			{ opts: { exact: { id: "e1", folder_id: "inbox" } }, outcome: "already_in_inbox", match: "source_id" },
			{ opts: { exact: null }, outcome: "not_found", match: "source_id" },
			{
				opts: {
					rows: [baseRow({ source_id: null })],
					candidates: [
						{ id: "c1", folder_id: "spam" },
						{ id: "c2", folder_id: "spam" },
					],
				},
				outcome: "ambiguous",
				match: "heuristic",
			},
		];
		for (const c of cases) {
			logSpy.mockClear();
			const h = harness(c.opts);
			await post(h);
			const lines = auditLines(logSpy);
			expect(lines, c.outcome).toHaveLength(1);
			const parsed = JSON.parse(lines[0]);
			expect(parsed).toMatchObject({
				event: "ops_safety_move_to_inbox",
				actor_email: OPERATOR.email,
				actor_id: OPERATOR.employeeId,
				target_employee_id: TARGET.id,
				safety_event_id: "evt-1",
				outcome: c.outcome,
				match: c.match,
			});
			expect(parsed).not.toHaveProperty("preview");
			expect(parsed).not.toHaveProperty("sender");
			expect(lines[0]).not.toContain("SECRET-PREVIEW-TEXT");
			vi.unstubAllGlobals();
		}
	});

	it("rejects SMS rows and soft flags", async () => {
		const sms = harness({ rows: [baseRow({ channel: "sms" })], exact: { id: "e1", folder_id: "spam" } });
		const r1 = await post(sms);
		expect(r1.status).toBe(400);
		expect(r1.body).toMatchObject({ ok: false, outcome: "not_email" });
		expect(sms.mailbox.moveEmail).not.toHaveBeenCalled();
		vi.unstubAllGlobals();

		const soft = harness({ rows: [baseRow({ action: "flagged" })], exact: { id: "e1", folder_id: "spam" } });
		const r2 = await post(soft);
		expect(r2.status).toBe(400);
		expect(r2.body).toMatchObject({ ok: false, outcome: "not_quarantined" });
		expect(soft.mailbox.moveEmail).not.toHaveBeenCalled();
	});

	it("row without employee_id -> 400 no_target_employee", async () => {
		const h = harness({ rows: [baseRow({ employee_id: null })] });
		const r = await post(h);
		expect(r.status).toBe(400);
		expect(r.body).toMatchObject({ outcome: "no_target_employee" });
		expect(h.mailbox.moveEmail).not.toHaveBeenCalled();
	});

	it("already in Inbox is a successful no-op", async () => {
		const h = harness({ exact: { id: "e1", folder_id: "inbox" } });
		const r = await post(h);
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ ok: true, outcome: "already_in_inbox", reviewed: true });
		expect(h.mailbox.moveEmail).not.toHaveBeenCalled();
		expect(h.markReviewedBodies).toEqual([{ ids: ["evt-1"], reviewed_by: OPERATOR.email }]);
	});

	it("email in Trash is left alone", async () => {
		const h = harness({ exact: { id: "e1", folder_id: "trash" } });
		const r = await post(h);
		expect(r.status).toBe(200);
		expect(r.body).toMatchObject({ outcome: "elsewhere", folder: "trash", folder_name: "Trash" });
		expect(h.mailbox.moveEmail).not.toHaveBeenCalled();
		expect(h.markReviewedBodies).toEqual([]);
	});

	describe("D32 matching", () => {
		it("no source_id, exactly one Spam candidate -> moved (heuristic)", async () => {
			const h = harness({
				rows: [baseRow({ source_id: null })],
				candidates: [{ id: "c1", folder_id: "spam" }],
			});
			const r = await post(h);
			expect(r.status).toBe(200);
			expect(r.body).toMatchObject({ outcome: "moved" });
			expect(h.mailbox.moveEmail).toHaveBeenCalledWith("c1", "inbox");
			expect(h.mailbox.findEmailBySourceId).not.toHaveBeenCalled();
			expect(JSON.parse(auditLines(logSpy)[0]).match).toBe("heuristic");
		});

		it("no source_id, zero candidates -> 404 not_found", async () => {
			const h = harness({ rows: [baseRow({ source_id: null })], candidates: [] });
			const r = await post(h);
			expect(r.status).toBe(404);
			expect(r.body).toMatchObject({ ok: false, outcome: "not_found" });
			expect(h.mailbox.moveEmail).not.toHaveBeenCalled();
		});

		it("no source_id, two candidates -> 409 ambiguous, nothing moved", async () => {
			const h = harness({
				rows: [baseRow({ source_id: null })],
				candidates: [
					{ id: "c1", folder_id: "spam" },
					{ id: "c2", folder_id: "spam" },
				],
			});
			const r = await post(h);
			expect(r.status).toBe(409);
			expect(r.body).toMatchObject({ ok: false, outcome: "ambiguous" });
			expect(h.mailbox.moveEmail).not.toHaveBeenCalled();
			expect(h.markReviewedBodies).toEqual([]);
		});

		it("source_id present but no match -> not_found, heuristic never consulted", async () => {
			const h = harness({ exact: null, candidates: [{ id: "c1", folder_id: "spam" }] });
			const r = await post(h);
			expect(r.status).toBe(404);
			expect(r.body).toMatchObject({ outcome: "not_found" });
			expect(h.mailbox.findSpamCandidatesByPreview).not.toHaveBeenCalled();
			expect(h.mailbox.moveEmail).not.toHaveBeenCalled();
		});
	});

	it("unknown event id -> 404 event_not_found", async () => {
		const h = harness();
		const r = await post(h, "evt-missing");
		expect(r.status).toBe(404);
		expect(r.body).toMatchObject({ outcome: "event_not_found" });
		expect(h.idFromName).not.toHaveBeenCalled();
	});

	it("student API unreachable -> 503 unavailable", async () => {
		const h1 = harness({ listStatus: "throw" });
		const r1 = await post(h1);
		expect(r1.status).toBe(503);
		expect(r1.body).toMatchObject({ ok: false, outcome: "unavailable" });
		vi.unstubAllGlobals();
		const h2 = harness({ listStatus: 500 });
		const r2 = await post(h2);
		expect(r2.status).toBe(503);
		expect(h2.mailbox.moveEmail).not.toHaveBeenCalled();
	});

	it("employee missing in workspace -> 404 not_found", async () => {
		const h = harness({ employeeRecord: null, exact: { id: "e1", folder_id: "spam" } });
		const r = await post(h);
		expect(r.status).toBe(404);
		expect(r.body).toMatchObject({ outcome: "not_found" });
		expect(h.idFromName).not.toHaveBeenCalled();
		expect(h.mailbox.moveEmail).not.toHaveBeenCalled();
	});
});

describe("GET /api/ops/safety", () => {
	it("list adds can_move_to_inbox and label, hides source_id", async () => {
		const h = harness({
			rows: [
				baseRow({ id: "a" }),
				baseRow({ id: "b", channel: "sms" }),
				baseRow({ id: "c", action: "flagged" }),
				baseRow({ id: "d", employee_id: null }),
			],
		});
		const res = await h.app.fetch(new Request("https://parrot.example.test/api/ops/safety"));
		expect(res.status).toBe(200);
		const data = (await res.json()) as { events: Array<Record<string, unknown>> };
		const byId = Object.fromEntries(data.events.map((e) => [e.id, e]));
		expect(byId.a.can_move_to_inbox).toBe(true);
		expect(byId.b.can_move_to_inbox).toBe(false);
		expect(byId.c.can_move_to_inbox).toBe(false);
		expect(byId.d.can_move_to_inbox).toBe(false);
		expect(byId.a.reason_label).toBe("Flagged by Lakera Guard");
		for (const e of data.events) expect(e).not.toHaveProperty("source_id");
	});
});
