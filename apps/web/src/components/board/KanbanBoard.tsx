import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { BoardColumn as BoardColumnType, Ticket, TicketStatus } from "@claudehub/shared";
import { useBoardStore } from "../../stores/boardStore.js";
import Column from "./Column.js";
import Badge from "../ui/Badge.js";
import { truncate } from "../../lib/utils.js";
import { toast } from "sonner";

/** Minimum column width used to calculate how many columns fit */
const COL_BASE_WIDTH = 200;
const COL_GAP = 8;    // gap-2
const BOARD_PAD = 16; // p-2 on each side

interface KanbanBoardProps {
  columns: BoardColumnType[];
  projectId: string;
  onTicketClick: (number: number) => void;
}

export default function KanbanBoard({
  columns,
  projectId,
  onTicketClick,
}: KanbanBoardProps) {
  const { moveTicket, reorderTicket } = useBoardStore();
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [visibleCount, setVisibleCount] = useState(columns.length);
  const containerRef = useRef<HTMLDivElement>(null);

  // Observe container width and calculate how many columns fit
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const calc = (w: number) => {
      // How many columns fit: w >= BOARD_PAD + n * COL_BASE_WIDTH + (n-1) * COL_GAP
      // Solve: n <= (w - BOARD_PAD + COL_GAP) / (COL_BASE_WIDTH + COL_GAP)
      const n = Math.floor((w - BOARD_PAD + COL_GAP) / (COL_BASE_WIDTH + COL_GAP));
      setVisibleCount(Math.max(0, Math.min(columns.length, n)));
    };

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        calc(entry.contentRect.width);
      }
    });
    ro.observe(el);
    calc(el.clientWidth);

    return () => ro.disconnect();
  }, [columns.length]);

  const visibleColumns = columns.slice(0, visibleCount);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const ticket = event.active.data.current?.ticket as Ticket | undefined;
    if (ticket) setActiveTicket(ticket);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTicket(null);
      const { active, over } = event;
      if (!over) return;

      const ticket = active.data.current?.ticket as Ticket | undefined;
      if (!ticket) return;

      // Determine target column
      const overId = String(over.id);
      let targetStatus: TicketStatus | null = null;

      if (overId.startsWith("column-")) {
        targetStatus = overId.replace("column-", "") as TicketStatus;
      } else if (overId.startsWith("ticket-")) {
        // Dropped on another ticket — find which column it's in
        const overTicket = over.data.current?.ticket as Ticket | undefined;
        if (overTicket) {
          targetStatus = overTicket.status;
        }
      }

      if (!targetStatus) return;

      if (targetStatus !== ticket.status) {
        // Cross-column drag: status change
        try {
          await moveTicket(projectId, ticket.number, targetStatus);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to move ticket");
        }
      } else {
        // Same-column drag: priority reorder
        const overTicket = over.data.current?.ticket as Ticket | undefined;
        if (overTicket && overTicket.number !== ticket.number) {
          try {
            await reorderTicket(projectId, ticket.number, overTicket.priority);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to reorder ticket");
          }
        }
      }
    },
    [projectId, moveTicket, reorderTicket],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div ref={containerRef} className="flex gap-2 h-full p-2">
        {visibleColumns.map((col) => (
          <Column
            key={col.status}
            column={col}
            onTicketClick={onTicketClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTicket && (
          <div className="bg-bg-card border border-accent p-2.5 w-[200px] shadow-lg opacity-90">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="font-pixel text-[8px] text-text-muted">
                #{activeTicket.number}
              </span>
              <Badge variant={activeTicket.type}>
                {activeTicket.type.toUpperCase()}
              </Badge>
            </div>
            <div className="font-mono text-[12px] text-text-primary leading-tight">
              {truncate(activeTicket.title, 30)}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
