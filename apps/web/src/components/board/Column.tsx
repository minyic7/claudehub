import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardColumn } from "@claudehub/shared";
import TicketCard from "./TicketCard.js";

interface ColumnProps {
  column: BoardColumn;
  onTicketClick: (number: number) => void;
}

const columnColors: Record<string, string> = {
  todo: "border-t-text-muted",
  in_progress: "border-t-accent",
  reviewing: "border-t-status-warn",
  merged: "border-t-status-ok",
};

const eyeColors: Record<string, string> = {
  todo: "bg-[#808080]",
  in_progress: "bg-[#5ED490]",
  reviewing: "bg-[#E8C040]",
  merged: "bg-[#70B8F0]",
};

export default function Column({ column, onTicketClick }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.status}`,
    data: { status: column.status },
  });

  const sortableIds = column.tickets.map((t) => `ticket-${t.number}`);

  return (
    <div
      className={`flex flex-col flex-1 min-w-[200px] bg-bg-base border-t-2 ${columnColors[column.status] || "border-t-border-default"} ${isOver ? "bg-accent/5" : ""} transition-colors`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${eyeColors[column.status] || "bg-text-muted"} opacity-70`} />
          <span className="font-pixel text-[8px] text-text-secondary uppercase">
            {column.label}
          </span>
        </div>
        <span className="font-pixel text-[8px] text-text-muted">
          {column.tickets.length}
        </span>
      </div>

      {/* Ticket list */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-1.5 min-h-[100px]"
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {column.tickets.map((ticket) => (
            <TicketCard
              key={ticket.number}
              ticket={ticket}
              onClick={() => onTicketClick(ticket.number)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
