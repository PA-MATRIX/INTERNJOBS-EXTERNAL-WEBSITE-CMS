// v1.7 Phase 43-03 (LAK-01): per-row "Move to Inbox" cell for /ops/safety.
//
// The button appears only when the server says the row is movable
// (`can_move_to_inbox`, 43-02) and the row is idle or errored (retry).
// While moving it is disabled; once moved it reads "Moved".

import type { MoveStatus, SafetyEvent } from "../lib/safety-log";

interface SafetyMoveCellProps {
	event: SafetyEvent;
	status: MoveStatus;
	onMove: (eventId: string) => void;
}

export function SafetyMoveCell({ event, status, onMove }: SafetyMoveCellProps) {
	if (status === "done") {
		return <span className="text-xs font-medium text-emerald-700">Moved</span>;
	}
	if (!event.can_move_to_inbox) {
		return <span className="text-slate-300">—</span>;
	}
	const moving = status === "moving";
	return (
		<button
			type="button"
			disabled={moving}
			onClick={() => onMove(event.id)}
			className="whitespace-nowrap text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 disabled:cursor-wait disabled:text-slate-400 disabled:no-underline"
		>
			{moving ? "Moving…" : "Move to Inbox"}
		</button>
	);
}
