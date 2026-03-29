import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Ticket } from "@claudehub/shared";
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

  const isMobile = useIsMobile();

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
      />

      {/* Main area: side-by-side on desktop, stacked on mobile */}
      <div data-board-layout className={`flex flex-1 min-h-0 ${isMobile ? "flex-col" : "flex-row"}`}>
        <div className={`${isMobile ? "flex-1" : "flex-1 min-w-0"} overflow-hidden`}>
          <KanbanBoard columns={columns} projectId={projectId} onTicketClick={handleTicketClick} />
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
