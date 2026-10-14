// v1.3 Phase 20 SAFETY-VIEW-01: /ops/safety — Lakera Guard flag log for operators.
//
// Renders a table of safety_events rows from /api/ops/safety (last 100 events,
// last 7 days). Unreviewed rows show with an amber background tint.
// "Mark all reviewed" button POSTs to /api/ops/safety/mark-reviewed which
// clears the red-dot badge in WorkspaceShell. Since v1.7 Phase 43-03 the rows
// only flip to reviewed (and the list refetches) when the server confirms;
// a failure shows an error toast and leaves the rows unreviewed.
//
// v1.7 Phase 43-03 (LAK-01): blocked email rows the server marks
// `can_move_to_inbox` get a "Move to Inbox" button in the Recover column. It
// POSTs /api/ops/safety/:eventId/move-to-inbox, shows one toast per outcome,
// and refetches after a successful move. All page state lives in
// safetyLogReducer (app/lib/safety-log.ts).
//
// Operator-only at the API layer (requireOperator on GET /, POST /mark-reviewed
// and POST /:eventId/move-to-inbox). Non-operators receive a 403 surfaced as
// the empty state.

import { Shield } from "lucide-react";
import { useCallback, useEffect, useReducer } from "react";
import { SafetyMoveCell } from "~/components/SafetyMoveCell";
import { WorkspaceShell } from "~/components/WorkspaceShell";
import { apiFetch } from "~/lib/api";
import {
	dismissToast,
	initialSafetyLogState,
	loadFailed,
	loaded,
	markAllDone,
	markAllReviewed,
	markAllStarted,
	moveFinished,
	moveStarted,
	moveToInbox,
	safetyLogReducer,
	type SafetyEvent,
	type ToastKind,
} from "~/lib/safety-log";

function relativeTime(iso: string): string {
	const then = new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
	const delta = Math.max(0, Date.now() - then);
	const sec = Math.round(delta / 1000);
	if (sec < 60) return `${sec}s ago`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h ago`;
	return `${Math.round(hr / 24)}d ago`;
}

const ACTION_BADGE: Record<string, string> = {
	blocked: "bg-rose-100 text-rose-700",
	flagged: "bg-amber-100 text-amber-700",
	passed_lakera_unavailable: "bg-slate-100 text-slate-500",
	passed: "bg-emerald-100 text-emerald-700",
};

const TOAST_STYLE: Record<ToastKind, string> = {
	success: "bg-slate-800 text-white",
	info: "bg-amber-50 text-amber-900 border border-amber-200",
	error: "bg-rose-600 text-white",
};

export default function OpsSafetyRoute() {
	const [state, dispatch] = useReducer(safetyLogReducer, initialSafetyLogState);
	const { events, statusById, toast, loading, marking } = state;

	const loadEvents = useCallback(async () => {
		try {
			const res = await apiFetch("/api/ops/safety");
			if (!res.ok) {
				dispatch(loadFailed());
				return;
			}
			const data = (await res.json()) as { events?: SafetyEvent[] };
			dispatch(loaded(data.events ?? []));
		} catch {
			dispatch(loadFailed());
		}
	}, []);

	useEffect(() => {
		void loadEvents();
	}, [loadEvents]);

	// Inline toast auto-dismisses after ~4 s (InboxPane pattern).
	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => dispatch(dismissToast()), 4000);
		return () => clearTimeout(t);
	}, [toast]);

	async function onMove(eventId: string) {
		dispatch(moveStarted(eventId));
		const result = await moveToInbox(apiFetch, eventId);
		dispatch(moveFinished(eventId, result));
		if (result.kind === "success") await loadEvents();
	}

	async function onMarkAll() {
		dispatch(markAllStarted());
		const result = await markAllReviewed(apiFetch);
		dispatch(markAllDone(result));
		if (result.ok) await loadEvents();
	}

	const unreviewed = events.filter((e) => !e.reviewed && e.action !== "passed").length;

	return (
		<WorkspaceShell title="Safety Screening Log">
			<div className="p-6 max-w-5xl mx-auto">
				<div className="flex items-center gap-3 mb-6">
					<Shield size={20} className="text-slate-500" />
					<h1 className="text-lg font-semibold text-slate-900">
						Safety Screening Log
					</h1>
					{unreviewed > 0 && (
						<button
							type="button"
							disabled={marking}
							onClick={onMarkAll}
							className="ml-auto text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2"
						>
							{marking ? "Marking…" : `Mark all reviewed (${unreviewed})`}
						</button>
					)}
				</div>

				{loading && <p className="text-sm text-slate-400">Loading…</p>}

				{!loading && events.length === 0 && (
					<p className="text-sm text-slate-400">
						No safety flags in the last 7 days — clean traffic.
					</p>
				)}

				{!loading && events.length > 0 && (
					<div className="overflow-x-auto rounded-lg border border-slate-200">
						<table className="min-w-full divide-y divide-slate-200 text-sm">
							<thead className="bg-slate-50">
								<tr>
									{["Time", "Channel", "Action", "Reason", "Score", "Sender", "Preview", "Recover"].map(
										(h) => (
											<th
												key={h}
												className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
											>
												{h}
											</th>
										),
									)}
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100 bg-white">
								{events.map((ev) => (
									<tr
										key={ev.id}
										className={
											ev.reviewed || ev.action === "passed" ? "" : "bg-amber-50"
										}
									>
										<td className="px-4 py-2 whitespace-nowrap text-slate-500">
											{relativeTime(ev.created_at)}
										</td>
										<td className="px-4 py-2 uppercase text-xs font-mono text-slate-600">
											{ev.channel}
										</td>
										<td className="px-4 py-2">
											<span
												className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
													ACTION_BADGE[ev.action] ?? "bg-slate-100 text-slate-500"
												}`}
											>
												{ev.action}
											</span>
										</td>
										<td className="px-4 py-2 text-slate-600">{ev.reason_label}</td>
										<td className="px-4 py-2 font-mono text-slate-500">
											{ev.score != null ? Number(ev.score).toFixed(2) : "—"}
										</td>
										<td className="px-4 py-2 font-mono text-slate-400">
											…{ev.sender_last4 ?? "—"}
										</td>
										<td
											className="px-4 py-2 text-slate-500 max-w-xs truncate"
											title={ev.preview ?? ""}
										>
											{ev.preview ?? "—"}
										</td>
										<td className="px-4 py-2">
											<SafetyMoveCell
												event={ev}
												status={statusById[ev.id] ?? "idle"}
												onMove={onMove}
											/>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{toast && (
					<div
						role="status"
						className={`fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-lg px-4 py-2.5 text-xs shadow-lg ${TOAST_STYLE[toast.kind]}`}
					>
						{toast.message}
					</div>
				)}
			</div>
		</WorkspaceShell>
	);
}
