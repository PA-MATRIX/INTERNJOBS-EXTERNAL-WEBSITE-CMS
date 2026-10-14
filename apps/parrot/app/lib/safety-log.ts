// v1.7 Phase 43-03 (LAK-01 UI, LAK-04 Mark-all): pure helpers and the page
// reducer for /ops/safety.
//
// No React and no window access: `apiFetch` is passed in so the helpers can
// be tested in plain Node. Button eligibility comes from the server's
// `can_move_to_inbox` flag (43-02); nothing here re-derives it.

export interface SafetyEvent {
	id: string;
	channel: "sms" | "email" | "unknown";
	action: string;
	reason: string | null;
	reason_label: string;
	score: number | null;
	sender_last4: string | null;
	preview: string | null;
	employee_id: string | null;
	reviewed: boolean;
	created_at: string;
	can_move_to_inbox: boolean;
}

export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export type MoveStatus = "idle" | "moving" | "done" | "error";
export type ToastKind = "success" | "info" | "error";

export interface MoveResult {
	kind: ToastKind;
	outcome?: string;
	message: string;
}

export interface MarkAllResult {
	ok: boolean;
	message?: string;
}

export interface Toast {
	kind: ToastKind;
	message: string;
}

const MOVE_FAILED = "Move failed — try again";
const NOT_FOUND =
	"Not found — check Spam. It may have been deleted before Oct 9 or purged.";
const FORBIDDEN = "Only operators can move quarantined mail";
const MARK_ALL_FAILED = "Could not mark all reviewed — try again";

export function outcomeMessage(outcome: string, folderName?: string | null): string {
	switch (outcome) {
		case "moved":
			return "Moved to Inbox";
		case "already_in_inbox":
			return "Already in Inbox";
		case "elsewhere":
			return folderName
				? `Already moved out of Spam (now in ${folderName}) — left where it is`
				: "Already moved out of Spam — left where it is";
		case "not_found":
			return NOT_FOUND;
		case "ambiguous":
			return `${NOT_FOUND} (several similar messages, nothing was moved)`;
		default:
			return MOVE_FAILED;
	}
}

interface MoveBody {
	ok?: boolean;
	outcome?: string;
	folder_name?: string | null;
}

export async function moveToInbox(apiFetch: ApiFetch, eventId: string): Promise<MoveResult> {
	let res: Response;
	try {
		res = await apiFetch(
			`/api/ops/safety/${encodeURIComponent(eventId)}/move-to-inbox`,
			{ method: "POST", body: JSON.stringify({}) },
		);
	} catch {
		return { kind: "error", message: MOVE_FAILED };
	}

	if (res.status === 403) return { kind: "error", message: FORBIDDEN };

	let body: MoveBody | null = null;
	try {
		body = (await res.json()) as MoveBody;
	} catch {
		body = null;
	}
	const outcome = body?.outcome;

	// Success only on a 2xx that names a success outcome.
	if (res.ok && (outcome === "moved" || outcome === "already_in_inbox")) {
		return { kind: "success", outcome, message: outcomeMessage(outcome) };
	}
	// Known "nothing moved" answers: elsewhere (200), not_found (404), ambiguous (409).
	if (
		(outcome === "elsewhere" && res.ok) ||
		(outcome === "not_found" && res.status === 404) ||
		(outcome === "ambiguous" && res.status === 409)
	) {
		return { kind: "info", outcome, message: outcomeMessage(outcome, body?.folder_name) };
	}
	return { kind: "error", outcome, message: MOVE_FAILED };
}

export async function markAllReviewed(apiFetch: ApiFetch): Promise<MarkAllResult> {
	try {
		const res = await apiFetch("/api/ops/safety/mark-reviewed", {
			method: "POST",
			body: JSON.stringify({}),
		});
		if (res.ok) return { ok: true };
		return { ok: false, message: MARK_ALL_FAILED };
	} catch {
		return { ok: false, message: MARK_ALL_FAILED };
	}
}

// ---------------------------------------------------------------------------
// Page reducer: every state transition of /ops/safety goes through here.

export interface SafetyLogState {
	events: SafetyEvent[];
	statusById: Record<string, MoveStatus>;
	toast: Toast | null;
	loading: boolean;
	marking: boolean;
}

export const initialSafetyLogState: SafetyLogState = {
	events: [],
	statusById: {},
	toast: null,
	loading: true,
	marking: false,
};

export type SafetyLogAction =
	| { type: "loaded"; events: SafetyEvent[] }
	| { type: "loadFailed" }
	| { type: "moveStarted"; id: string }
	| { type: "moveFinished"; id: string; result: MoveResult }
	| { type: "markAllStarted" }
	| { type: "markAllDone"; result: MarkAllResult }
	| { type: "dismissToast" };

export const loaded = (events: SafetyEvent[]): SafetyLogAction => ({ type: "loaded", events });
export const loadFailed = (): SafetyLogAction => ({ type: "loadFailed" });
export const moveStarted = (id: string): SafetyLogAction => ({ type: "moveStarted", id });
export const moveFinished = (id: string, result: MoveResult): SafetyLogAction => ({
	type: "moveFinished",
	id,
	result,
});
export const markAllStarted = (): SafetyLogAction => ({ type: "markAllStarted" });
export const markAllDone = (result: MarkAllResult): SafetyLogAction => ({
	type: "markAllDone",
	result,
});
export const dismissToast = (): SafetyLogAction => ({ type: "dismissToast" });

export function safetyLogReducer(
	state: SafetyLogState,
	action: SafetyLogAction,
): SafetyLogState {
	switch (action.type) {
		case "loaded":
			return { ...state, events: action.events, loading: false };
		case "loadFailed":
			// Initial failure shows the empty state; a failed refetch keeps the rows.
			return { ...state, loading: false };
		case "moveStarted":
			return { ...state, statusById: { ...state.statusById, [action.id]: "moving" } };
		case "moveFinished": {
			const success = action.result.kind === "success";
			return {
				...state,
				statusById: { ...state.statusById, [action.id]: success ? "done" : "error" },
				events: success
					? state.events.map((e) => (e.id === action.id ? { ...e, reviewed: true } : e))
					: state.events,
				toast: { kind: action.result.kind, message: action.result.message },
			};
		}
		case "markAllStarted":
			return { ...state, marking: true };
		case "markAllDone":
			if (action.result.ok) {
				return {
					...state,
					marking: false,
					events: state.events.map((e) => ({ ...e, reviewed: true })),
				};
			}
			return {
				...state,
				marking: false,
				toast: { kind: "error", message: action.result.message ?? MARK_ALL_FAILED },
			};
		case "dismissToast":
			return { ...state, toast: null };
		default:
			return state;
	}
}
