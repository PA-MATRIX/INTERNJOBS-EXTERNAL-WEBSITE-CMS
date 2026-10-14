// v1.7 Phase 43-02 (LAK-01/LAK-03): "Move to Inbox" for a Lakera-quarantined
// email, given its safety_events row and the OWNING employee's mailbox stub.
//
//   - row.source_id present -> exact lookup only (no heuristic fallback).
//   - row.source_id absent  -> D32 best-effort: Spam rows near created_at
//     whose body starts with the preview; move only on EXACTLY one match.
//   - Moves only out of Spam. Inbox -> already_in_inbox; any other folder
//     (Trash, Archive, ...) -> elsewhere, left where the employee put it.
//   - D31: never trusts the sender. This module deliberately has no
//     reference to the mailbox's sender-trust method.

import { Folders } from "../../shared/folders";
import type { EmailLocation } from "./mailbox-lookup";

export interface SafetyEventRow {
	id: string;
	channel: string;
	action: string;
	reason: string | null;
	score: number | null;
	sender_last4: string | null;
	preview: string | null;
	employee_id: string | null;
	reviewed: boolean;
	reviewed_at: string | null;
	created_at: string;
	source_id?: string | null;
}

export interface SafetyMoveMailbox {
	findEmailBySourceId(sourceId: string): Promise<EmailLocation | null>;
	findSpamCandidatesByPreview(
		preview: string,
		createdAtIso: string,
	): Promise<EmailLocation[]>;
	moveEmail(id: string, folderId: string): Promise<boolean>;
}

export type MoveOutcome =
	| "moved"
	| "already_in_inbox"
	| "elsewhere"
	| "not_found"
	| "ambiguous";

export interface MoveResult {
	outcome: MoveOutcome;
	match: "source_id" | "heuristic" | null;
	emailId?: string;
	folder?: string;
}

export function canMoveToInbox(
	row: Pick<SafetyEventRow, "channel" | "action" | "employee_id">,
): boolean {
	return row.channel === "email" && row.action === "blocked" && !!row.employee_id;
}

export async function moveQuarantinedToInbox(
	stub: SafetyMoveMailbox,
	row: SafetyEventRow,
): Promise<MoveResult> {
	let loc: EmailLocation | null;
	let match: MoveResult["match"];

	if (row.source_id) {
		match = "source_id";
		loc = await stub.findEmailBySourceId(row.source_id);
		if (!loc) return { outcome: "not_found", match };
	} else {
		match = "heuristic";
		const candidates = await stub.findSpamCandidatesByPreview(
			String(row.preview ?? ""),
			row.created_at,
		);
		if (candidates.length === 0) return { outcome: "not_found", match };
		if (candidates.length > 1) return { outcome: "ambiguous", match };
		loc = candidates[0];
	}

	if (loc.folder_id === Folders.INBOX) {
		return { outcome: "already_in_inbox", match, emailId: loc.id, folder: loc.folder_id };
	}
	if (loc.folder_id !== Folders.SPAM) {
		return { outcome: "elsewhere", match, emailId: loc.id, folder: loc.folder_id };
	}
	const ok = await stub.moveEmail(loc.id, Folders.INBOX);
	if (!ok) return { outcome: "not_found", match };
	return { outcome: "moved", match, emailId: loc.id, folder: Folders.INBOX };
}
