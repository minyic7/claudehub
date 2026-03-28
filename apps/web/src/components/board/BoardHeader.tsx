import type { BoardStats } from "@claudehub/shared";
import Badge from "../ui/Badge.js";
import Button from "../ui/Button.js";

interface BoardHeaderProps {
  kanbanCCStatus: "running" | "stopped" | "error";
  stats: BoardStats;
  isOperator: boolean;
  onNewTicket: () => void;
}

export default function BoardHeader({
  kanbanCCStatus,
  stats,
  isOperator,
  onNewTicket,
}: BoardHeaderProps) {
  const statusVariant =
    kanbanCCStatus === "running"
      ? "ok"
      : kanbanCCStatus === "error"
        ? "error"
        : "warn";

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border-default bg-bg-surface shrink-0">
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant}>
          KANBAN CC: {kanbanCCStatus.toUpperCase()}
        </Badge>
      </div>

      <div className="flex items-center gap-3 font-pixel text-[8px] text-text-muted">
        <span>{stats.total} tickets</span>
        <span>{stats.runningCC} running</span>
        <span>{stats.queuedCC} queued</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {!isOperator && (
          <Badge variant="warn">VIEW ONLY</Badge>
        )}
        <Button variant="primary" size="sm" onClick={onNewTicket} disabled={!isOperator}>
          + NEW TICKET
        </Button>
      </div>
    </div>
  );
}
