import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router";
import type { Ticket } from "@claudehub/shared";
import { toast } from "sonner";
import { api } from "../api/client.js";
import { useBoardStore } from "../stores/boardStore.js";
import { useTerminalStore } from "../stores/terminalStore.js";
import { useEventWs } from "../hooks/useEventWs.js";
import { useAutoStartKanbanCC } from "../hooks/useAutoStartKanbanCC.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import BoardHeader from "../components/board/BoardHeader.js";
import KanbanBoard from "../components/board/KanbanBoard.js";
import TerminalPanel from "../components/terminal/TerminalPanel.js";
import TicketDetailModal from "../components/board/TicketDetailModal.js";
import CreateTicketModal from "../components/board/CreateTicketModal.js";
import Spinner from "../components/ui/Spinner.js";

export default function BoardPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { columns, stats, kanbanCCStatus, loading, fetchBoard, isOperator } =
    useBoardStore();
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<Set<number>>(new Set());

  const isMobile = useIsMobile();

  const toggleTicketSelect = useCallback((num: number) => {
    setSelectedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  }, []);

  const toggleColumnSelect = useCallback((status: string) => {
    const col = columns.find((c) => c.status === status);
    if (!col) return;
    const colNums = col.tickets.map((t) => t.number);
    setSelectedTickets((prev) => {
      const allSelected = colNums.every((n) => prev.has(n));
      const next = new Set(prev);
      if (allSelected) colNums.forEach((n) => next.delete(n));
      else colNums.forEach((n) => next.add(n));
      return next;
    });
  }, [columns]);

  const toggleSelectAll = useCallback(() => {
    const allNums = columns.flatMap((c) => c.tickets.map((t) => t.number));
    setSelectedTickets((prev) => {
      if (prev.size === allNums.length) return new Set();
      return new Set(allNums);
    });
  }, [columns]);

  const handleBatchDelete = useCallback(async () => {
    if (!projectId || selectedTickets.size === 0) return;
    const nums = Array.from(selectedTickets);
    if (!confirm(`Delete ${nums.length} ticket(s)? This cannot be undone.`)) return;
    const results = await Promise.allSettled(
      nums.map((num) => api.deleteTicket(projectId, num)),
    );
    const deleted = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (deleted > 0) toast.success(`Deleted ${deleted} ticket(s)`);
    if (failed > 0) toast.error(`Failed to delete ${failed} ticket(s)`);
    setSelectedTickets(new Set());
    setManageMode(false);
    refreshBoard();
  }, [projectId, selectedTickets]);

  useEventWs(projectId);
  useAutoStartKanbanCC(projectId);

  useEffect(() => {
    if (projectId) fetchBoard(projectId);
  }, [projectId, fetchBoard]);

  const handleTicketClick = (number: number) => {
    const ticket = columns
      .flatMap((c) => c.tickets)
      .find((t) => t.number === number);
    if (ticket) {
      setSelectedTicket(ticket);
      const store = useTerminalStore.getState();
      store.switchTab(number);
      if (store.panelCollapsed) {
        useTerminalStore.setState({ panelCollapsed: false });
      }
    }
  };

  const handleTicketClose = () => {
    setSelectedTicket(null);
  };

  const refreshBoard = () => {
    if (projectId) fetchBoard(projectId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!projectId) return null;

  return (
    <div className="flex flex-col h-full">
      <BoardHeader
        kanbanCCStatus={kanbanCCStatus}
        stats={stats}
        isOperator={isOperator()}
        onNewTicket={() => setShowCreateTicket(true)}
        manageMode={manageMode}
        selectedCount={selectedTickets.size}
        onToggleManage={() => { setManageMode((v) => !v); setSelectedTickets(new Set()); }}
        onSelectAll={toggleSelectAll}
        onBatchDelete={handleBatchDelete}
      />

      {/* Main area: side-by-side on desktop, stacked on mobile */}
      <div data-board-layout className={`flex flex-1 min-h-0 ${isMobile ? "flex-col" : "flex-row"}`}>
        <div className={`${isMobile ? "flex-1" : "flex-1 min-w-0"} overflow-hidden`}>
          <KanbanBoard
            columns={columns}
            projectId={projectId}
            onTicketClick={handleTicketClick}
            manageMode={manageMode}
            selectedTickets={selectedTickets}
            onToggleTicket={toggleTicketSelect}
            onToggleColumn={toggleColumnSelect}
          />
        </div>
        <TerminalPanel projectId={projectId} isMobile={isMobile} />
      </div>

      {/* Modals */}
      <CreateTicketModal
        open={showCreateTicket}
        projectId={projectId}
        onClose={() => setShowCreateTicket(false)}
        onCreated={() => {
          setShowCreateTicket(false);
          refreshBoard();
        }}
      />

      <TicketDetailModal
        ticket={selectedTicket}
        projectId={projectId}
        onClose={handleTicketClose}
        onUpdated={refreshBoard}
      />
    </div>
  );
}
