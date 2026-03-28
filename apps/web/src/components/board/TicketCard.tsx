import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Ticket } from "@claudehub/shared";
import Badge from "../ui/Badge.js";
import { truncate } from "../../lib/utils.js";

interface TicketCardProps {
  ticket: Ticket;
  onClick: () => void;
}

const ccStatusVariant: Record<string, "ok" | "warn" | "error" | "info"> = {
  idle: "info",
  queued: "warn",
  running: "ok",
  completed: "ok",
};

const mergeStepLabel: Record<string, string> = {
  creating_pr: "Creating PR...",
  merging: "Merging...",
  waiting_cd: "Waiting for CD...",
  cd_failed: "CD Failed",
  cd_timeout: "CD Timeout",
};

export default function TicketCard({ ticket, onClick }: TicketCardProps) {
  const mergeStep = (ticket as Ticket & { mergeStep?: string }).mergeStep;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `ticket-${ticket.number}`,
    data: { ticket },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-bg-card border border-border-default p-2.5 cursor-pointer hover:border-accent/40 transition-colors group"
    >
      {/* Row 1: number, type, priority */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-pixel text-[8px] text-text-muted">
          #{ticket.number}
        </span>
        <Badge variant={ticket.type}>{ticket.type.toUpperCase()}</Badge>
        <span className="ml-auto font-pixel text-[8px] text-text-muted">
          P:{ticket.priority}
        </span>
      </div>

      {/* Row 2: title */}
      <div className="font-mono text-[12px] text-text-primary leading-tight mb-1.5">
        {truncate(ticket.title, 40)}
      </div>

      {/* Row 3: status badges */}
      <div className="flex items-center gap-1 flex-wrap">
        {ticket.status !== "merged" && (
          <Badge variant={ccStatusVariant[ticket.ccStatus] || "info"}>
            {ticket.ccStatus}
          </Badge>
        )}

        {mergeStep && mergeStep !== "merged" && (
          <Badge
            variant={
              mergeStep === "cd_failed" || mergeStep === "cd_timeout"
                ? "warn"
                : "info"
            }
          >
            {mergeStepLabel[mergeStep] || mergeStep}
          </Badge>
        )}

        {ticket.returnReason === "conflict" && (
          <Badge variant="error">REBASE CONFLICT</Badge>
        )}
        {ticket.returnReason === "rejected" && (
          <Badge variant="warn">REJECTED</Badge>
        )}
      </div>
    </div>
  );
}
