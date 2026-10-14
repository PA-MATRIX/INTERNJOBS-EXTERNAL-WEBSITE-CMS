// v1.7 Phase 43-02 (LAK-01/LAK-03): map a safety_events row to a stored email
// in an employee mailbox.
//
// Two finders over an injectable `exec` so the SQL can be exercised against a
// real SQLite in tests and against ctx.storage.sql.exec in the mailbox DO:
//
//   findEmailBySourceId          exact match. inbound-email.ts sends
//                                source_id = originalMessageId ?? messageId,
//                                and stores id = messageId (uuid) and
//                                message_id = originalMessageId, so
//                                `message_id = ? OR id = ?` covers both.
//   findSpamCandidatesByPreview  D32 best-effort match for older rows without
//                                source_id: Spam rows within +/- window of the
//                                safety event whose body starts with the
//                                80-char preview. The prefix compare is done in
//                                JS because the preview is a UTF-16
//                                slice(0,80) (may end in half a surrogate
//                                pair) while SQLite substr counts characters;
//                                and no LIKE, so '%' / '_' stay literal.

export type Exec = (
	sql: string,
	...params: unknown[]
) => Array<Record<string, unknown>>;

export interface EmailLocation {
	id: string;
	folder_id: string;
}

export const HEURISTIC_WINDOW_MS = 5 * 60 * 1000;
const MAX_CANDIDATES = 3;
const SCAN_LIMIT = 200;

export function findEmailBySourceId(
	exec: Exec,
	sourceId: string | null | undefined,
): EmailLocation | null {
	if (!sourceId) return null;
	const rows = exec(
		`SELECT id, folder_id FROM emails WHERE message_id = ? OR id = ? ORDER BY date DESC LIMIT 1`,
		sourceId,
		sourceId,
	);
	const row = rows[0];
	if (!row) return null;
	return { id: String(row.id), folder_id: String(row.folder_id) };
}

export function findSpamCandidatesByPreview(
	exec: Exec,
	preview: string | null | undefined,
	createdAtIso: string,
	windowMs: number = HEURISTIC_WINDOW_MS,
): EmailLocation[] {
	if (!preview || preview.trim() === "") return [];
	const t = Date.parse(createdAtIso);
	if (!Number.isFinite(t)) return [];
	const from = new Date(t - windowMs).toISOString();
	const to = new Date(t + windowMs).toISOString();
	const rows = exec(
		`SELECT id, folder_id, body FROM emails WHERE folder_id = 'spam' AND date BETWEEN ? AND ? ORDER BY date DESC LIMIT ${SCAN_LIMIT}`,
		from,
		to,
	);
	const out: EmailLocation[] = [];
	for (const row of rows) {
		if (String(row.body ?? "").startsWith(preview)) {
			out.push({ id: String(row.id), folder_id: String(row.folder_id) });
			if (out.length >= MAX_CANDIDATES) break;
		}
	}
	return out;
}
