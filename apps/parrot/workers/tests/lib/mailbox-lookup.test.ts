// v1.7 Phase 43-02 (LAK-01/LAK-03): mailbox lookup finders.
//
// These tests run REAL SQL against the production emails/folders schema
// (employeeMailboxMigrations[0]) in node:sqlite, so the WHERE clauses are
// actually executed, not string-matched. node:sqlite needs
// --experimental-sqlite on Node 22.12 (set in vitest.config.ts execArgv).
//
// All rows are synthetic; no real addresses.
import { describe, it, expect, beforeEach } from "vitest";
import { employeeMailboxMigrations } from "../../durableObject/migrations";
import {
	findEmailBySourceId,
	findSpamCandidatesByPreview,
	HEURISTIC_WINDOW_MS,
} from "../../lib/mailbox-lookup";

type Row = Record<string, unknown>;
type Exec = (sql: string, ...params: unknown[]) => Row[];

// node:sqlite is loaded through a variable specifier so the Workers tsconfig
// (no @types/node sqlite module) does not try to resolve it.
const SQLITE_SPECIFIER = "node:sqlite";

async function makeDb(): Promise<{ exec: Exec; insert: (r: Partial<EmailRow>) => void }> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const mod = (await import(/* @vite-ignore */ SQLITE_SPECIFIER)) as any;
	const db = new mod.DatabaseSync(":memory:");
	db.exec(employeeMailboxMigrations[0].sql);
	const exec: Exec = (sql, ...params) =>
		db.prepare(sql).all(...params) as Row[];
	const insert = (r: Partial<EmailRow>) => {
		db.prepare(
			`INSERT INTO emails (id, folder_id, subject, sender, recipient, date, body, message_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			r.id ?? crypto.randomUUID(),
			r.folder_id ?? "spam",
			r.subject ?? "synthetic",
			r.sender ?? "sender@example.test",
			r.recipient ?? "employee@example.test",
			r.date ?? T0,
			r.body ?? "",
			r.message_id ?? null,
		);
	};
	return { exec, insert };
}

interface EmailRow {
	id: string;
	folder_id: string;
	subject: string;
	sender: string;
	recipient: string;
	date: string;
	body: string;
	message_id: string | null;
}

const T0 = "2026-10-10T12:00:00.000Z";
const at = (offsetMs: number) => new Date(Date.parse(T0) + offsetMs).toISOString();

let exec: Exec;
let insert: (r: Partial<EmailRow>) => void;

beforeEach(async () => {
	({ exec, insert } = await makeDb());
});

describe("findEmailBySourceId", () => {
	it("matches message_id", () => {
		insert({ id: "uuid-1", folder_id: "spam", message_id: "<abc@mail.example.test>" });
		insert({ id: "uuid-2", folder_id: "inbox", message_id: "<other@mail.example.test>" });
		const hit = findEmailBySourceId(exec, "<abc@mail.example.test>");
		expect(hit).toMatchObject({ id: "uuid-1", folder_id: "spam" });
	});

	it("falls back to id when no Message-ID was stored", () => {
		insert({ id: "uuid-only", folder_id: "spam", message_id: null });
		const hit = findEmailBySourceId(exec, "uuid-only");
		expect(hit).toMatchObject({ id: "uuid-only", folder_id: "spam" });
	});

	it("returns null when nothing matches", () => {
		insert({ id: "uuid-1", message_id: "<abc@mail.example.test>" });
		expect(findEmailBySourceId(exec, "<missing@mail.example.test>")).toBeNull();
		expect(findEmailBySourceId(exec, "")).toBeNull();
	});

	it("newest wins if two rows share a message_id", () => {
		insert({ id: "older", folder_id: "inbox", date: at(-60_000), message_id: "<dup@x.test>" });
		insert({ id: "newer", folder_id: "spam", date: at(0), message_id: "<dup@x.test>" });
		expect(findEmailBySourceId(exec, "<dup@x.test>")).toMatchObject({ id: "newer" });
	});
});

describe("findSpamCandidatesByPreview", () => {
	const body = "Hello there, this is a synthetic quarantined message used only in unit tests. It keeps going past eighty.";
	const preview = body.slice(0, 80);

	it("one Spam row inside the window", () => {
		insert({ id: "s1", folder_id: "spam", date: at(30_000), body });
		const got = findSpamCandidatesByPreview(exec, preview, T0);
		expect(got).toEqual([{ id: "s1", folder_id: "spam" }]);
	});

	it("Inbox copy is not a candidate", () => {
		insert({ id: "i1", folder_id: "inbox", date: at(0), body });
		insert({ id: "t1", folder_id: "trash", date: at(0), body });
		expect(findSpamCandidatesByPreview(exec, preview, T0)).toEqual([]);
	});

	it("outside +/-5 min is excluded", () => {
		insert({ id: "late", folder_id: "spam", date: at(HEURISTIC_WINDOW_MS + 1_000), body });
		insert({ id: "early", folder_id: "spam", date: at(-HEURISTIC_WINDOW_MS - 1_000), body });
		insert({ id: "edge", folder_id: "spam", date: at(HEURISTIC_WINDOW_MS - 1_000), body });
		expect(findSpamCandidatesByPreview(exec, preview, T0).map((r) => r.id)).toEqual(["edge"]);
	});

	it("body longer than preview still matches on prefix", () => {
		const long = preview + " ".repeat(10) + "x".repeat(5000);
		insert({ id: "long", folder_id: "spam", body: long });
		insert({ id: "different", folder_id: "spam", body: "Different start " + long });
		expect(findSpamCandidatesByPreview(exec, preview, T0).map((r) => r.id)).toEqual(["long"]);
	});

	it("'%' and '_' in the preview are literal", () => {
		insert({ id: "x-off", folder_id: "spam", body: "100x off everything a_b" });
		insert({ id: "pct-off", folder_id: "spam", date: at(1_000), body: "100% off everything a_b" });
		expect(findSpamCandidatesByPreview(exec, "100% off", T0).map((r) => r.id)).toEqual(["pct-off"]);
		insert({ id: "ab", folder_id: "spam", body: "aXb tail" });
		expect(findSpamCandidatesByPreview(exec, "a_b", T0)).toEqual([]);
	});

	it("emoji (surrogate pair) straddling position 80 still matches", () => {
		// 79 ASCII chars then an emoji: UTF-16 units 79 and 80 are the pair, so
		// slice(0,80) ends with a lone high surrogate, exactly like inbound-email.ts.
		const emojiBody = "a".repeat(79) + "\u{1F600}" + " trailing text";
		const p = emojiBody.slice(0, 80);
		expect(p.length).toBe(80);
		expect(p.charCodeAt(79)).toBeGreaterThanOrEqual(0xd800);
		expect(p.charCodeAt(79)).toBeLessThanOrEqual(0xdbff);
		insert({ id: "emoji", folder_id: "spam", body: emojiBody });
		expect(findSpamCandidatesByPreview(exec, p, T0).map((r) => r.id)).toEqual(["emoji"]);
	});

	it("empty or whitespace preview returns []", () => {
		insert({ id: "s1", folder_id: "spam", body: "" });
		insert({ id: "s2", folder_id: "spam", body: "   anything" });
		expect(findSpamCandidatesByPreview(exec, "", T0)).toEqual([]);
		expect(findSpamCandidatesByPreview(exec, "   ", T0)).toEqual([]);
	});

	it("invalid createdAt returns []", () => {
		insert({ id: "s1", folder_id: "spam", body });
		expect(findSpamCandidatesByPreview(exec, preview, "not-a-date")).toEqual([]);
	});

	it("returns at most 3 candidates", () => {
		for (let i = 0; i < 5; i++) {
			insert({ id: `dup-${i}`, folder_id: "spam", date: at(i * 1_000), body });
		}
		const got = findSpamCandidatesByPreview(exec, preview, T0);
		expect(got).toHaveLength(3);
		for (const r of got) {
			expect(Object.keys(r).sort()).toEqual(["folder_id", "id"]);
		}
	});
});
