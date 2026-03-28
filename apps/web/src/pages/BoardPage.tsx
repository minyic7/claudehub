import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Ticket } from "@claudehub/shared";
import { useBoardStore } from "../stores/boardStore.js";
import { useTerminalStore } from "../stores/terminalStore.js";
import { useEventWs } from "../hooks/useEventWs.js";
import { useAutoStartKanbanCC } from "../hooks/useAutoStartKanbanCC.js";
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
      useTerminalStore.getState().openTicketTerminal(number);
    }
  };

  const handleTicketClose = () => {
    setSelectedTicket(null);
    useTerminalStore.getState().closeTicketTerminal();
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

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Kanban Board */}
        <div className="flex-1 overflow-hidden">
          <KanbanBoard columns={columns} projectId={projectId} onTicketClick={handleTicketClick} />
        </div>

        {/* Right: Terminal Panel */}
        <TerminalPanel projectId={projectId} />
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
