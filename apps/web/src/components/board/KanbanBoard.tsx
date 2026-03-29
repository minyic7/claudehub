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
  const [startIndex, setStartIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Observe container width and calculate how many columns fit
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const calc = (w: number) => {
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

  // Clamp startIndex when visibleCount changes
  useEffect(() => {
    setStartIndex((prev) => Math.min(prev, Math.max(0, columns.length - visibleCount)));
  }, [visibleCount, columns.length]);

  const showColumnTabs = visibleCount < columns.length && visibleCount > 0;
  const visibleColumns = columns.slice(startIndex, startIndex + visibleCount);

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
      <div className="flex flex-col h-full">
        {/* Column selector tabs — shown when not all columns fit */}
        {showColumnTabs && (
          <div className="flex border-b border-border-default px-2 pt-1 gap-1 overflow-x-auto shrink-0">
            {columns.map((col, idx) => {
              const isVisible = idx >= startIndex && idx < startIndex + visibleCount;
              return (
                <button
                  key={col.status}
                  onClick={() => setStartIndex(Math.min(idx, columns.length - visibleCount))}
                  className={`shrink-0 font-pixel text-[8px] px-2 py-1.5 transition-colors cursor-pointer ${
                    isVisible
                      ? "text-accent border-b border-accent"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {col.label} ({col.tickets.length})
                </button>
              );
            })}
          </div>
        )}
        <div ref={containerRef} className="flex gap-2 flex-1 min-h-0 p-2">
          {visibleColumns.map((col) => (
            <Column
              key={col.status}
              column={col}
              onTicketClick={onTicketClick}
            />
          ))}
        </div>
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
