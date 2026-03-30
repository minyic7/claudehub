import { create } from "zustand";
import type { Project, Ticket, BoardColumn, BoardStats, TicketStatus } from "@claudehub/shared";
import { api } from "../api/client.js";
import { getConnectionId } from "../lib/utils.js";

interface BoardStore {
  // Board data
  project: Omit<Project, "githubToken"> | null;
  columns: BoardColumn[];
  stats: BoardStats;
  kanbanCCStatus: "running" | "stopped" | "error";
  pilotActive: boolean;
  pilotLastResetAt: number | null;
  pilotIdleTimeout: number | null;
  pilotNudging: boolean;
  operatorConnectionId: string | null;
  loading: boolean;

  // Computed
  isOperator: () => boolean;

  // Actions
  fetchBoard: (projectId: string) => Promise<void>;
  moveTicket: (projectId: string, number: number, toStatus: TicketStatus) => Promise<void>;
  reorderTicket: (projectId: string, number: number, newPriority: number) => Promise<void>;

  // WebSocket event handlers
  handleTicketCreated: (ticket: Ticket) => void;
  handleTicketUpdated: (data: { number: number; changes: Partial<Ticket> }) => void;
  handleTicketDeleted: (data: { number: number }) => void;
  handleStatusChanged: (data: { number: number; from?: string; to?: string; ccStatus?: string }) => void;
  handleMergeProgress: (data: { number: number; status: string; error?: string }) => void;
  handleRebaseEvent: (data: { number: number; event: string }) => void;
  handleCICompleted: (data: { number: number; passed: boolean }) => void;
  handleCDEvent: (data: { event: string; passed?: boolean }) => void;
  handleKanbanCCStatus: (data: { status: string }) => void;
  handleOperatorChanged: (data: { operatorConnectionId: string | null }) => void;
  handlePilotStatus: (data: { active: boolean }) => void;
  handlePilotIdleReset: (data: { lastResetAt: number; idleTimeout: number }) => void;
}

function findAndRemoveTicket(columns: BoardColumn[], number: number): { ticket: Ticket | null; columns: BoardColumn[] } {
  let ticket: Ticket | null = null;
  const updated = columns.map((col) => ({
    ...col,
    tickets: col.tickets.filter((t) => {
      if (t.number === number) { ticket = t; return false; }
      return true;
    }),
  }));
  return { ticket, columns: updated };
}

function updateTicketInColumns(columns: BoardColumn[], number: number, changes: Partial<Ticket>): BoardColumn[] {
  return columns.map((col) => ({
    ...col,
    tickets: col.tickets.map((t) =>
      t.number === number ? { ...t, ...changes } : t
    ),
  }));
}

function recalcStats(columns: BoardColumn[]): BoardStats {
  const allTickets = columns.flatMap((c) => c.tickets);
  const byStatus = {} as Record<TicketStatus, number>;
  for (const col of columns) {
    byStatus[col.status] = col.tickets.length;
  }
  return {
    total: allTickets.length,
    byStatus,
    runningCC: allTickets.filter((t) => t.ccStatus === "running").length,
    queuedCC: allTickets.filter((t) => t.ccStatus === "queued").length,
  };
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  project: null,
  columns: [],
  stats: { total: 0, byStatus: {} as Record<TicketStatus, number>, runningCC: 0, queuedCC: 0 },
  kanbanCCStatus: "stopped",
  pilotActive: false,
  pilotLastResetAt: null,
  pilotIdleTimeout: null,
  pilotNudging: false,
  operatorConnectionId: null,
  loading: false,

  isOperator: () => {
    const opId = get().operatorConnectionId;
    // No operator assigned = everyone can operate (single user default)
    return opId === null || opId === getConnectionId();
  },

  fetchBoard: async (projectId) => {
    set({ loading: true });
    try {
      const board = await api.getBoard(projectId);
      set({
        project: board.project,
        columns: board.columns,
        stats: board.stats,
        kanbanCCStatus: board.kanbanCCStatus,
        operatorConnectionId: board.operatorConnectionId,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  moveTicket: async (projectId, number, toStatus) => {
    const { columns } = get();
    const { ticket, columns: withoutTicket } = findAndRemoveTicket(columns, number);
    if (!ticket) return;

    // Optimistic: move card to new column
    const optimistic = withoutTicket.map((col) => {
      if (col.status === toStatus) {
        return { ...col, tickets: [...col.tickets, { ...ticket, status: toStatus }].sort((a, b) => a.priority - b.priority) };
      }
      return col;
    });
    set({ columns: optimistic, stats: recalcStats(optimistic) });

    try {
      await api.updateTicket(projectId, number, { status: toStatus });
    } catch {
      // Revert
      set({ columns, stats: recalcStats(columns) });
      throw new Error("Failed to move ticket");
    }
  },

  reorderTicket: async (projectId, number, newPriority) => {
    const { columns } = get();
    // Optimistic: update priority
    const optimistic = columns.map((col) => ({
      ...col,
      tickets: col.tickets
        .map((t) => t.number === number ? { ...t, priority: newPriority } : t)
        .sort((a, b) => a.priority - b.priority),
    }));
    set({ columns: optimistic });

    try {
      await api.updateTicket(projectId, number, { priority: newPriority });
    } catch {
      set({ columns });
      throw new Error("Failed to reorder ticket");
    }
  },

  handleTicketCreated: (ticket) => {
    set((state) => {
      const columns = state.columns.map((col) => {
        if (col.status === ticket.status) {
          return { ...col, tickets: [...col.tickets, ticket].sort((a, b) => a.priority - b.priority) };
        }
        return col;
      });
      return { columns, stats: recalcStats(columns) };
    });
  },

  handleTicketUpdated: (data) => {
    set((state) => {
      const columns = updateTicketInColumns(state.columns, data.number, data.changes);
      return { columns, stats: recalcStats(columns) };
    });
  },

  handleTicketDeleted: (data) => {
    set((state) => {
      const { columns } = findAndRemoveTicket(state.columns, data.number);
      return { columns, stats: recalcStats(columns) };
    });
  },

  handleStatusChanged: (data) => {
    set((state) => {
      // CC-only status update (no from/to) — just update ccStatus in-place
      if (!data.from || !data.to) {
        const columns = updateTicketInColumns(state.columns, data.number, {
          ...(data.ccStatus ? { ccStatus: data.ccStatus as Ticket["ccStatus"] } : {}),
        });
        return { columns, stats: recalcStats(columns) };
      }
      // Full status transition — move ticket between columns
      const { ticket, columns: withoutTicket } = findAndRemoveTicket(state.columns, data.number);
      if (!ticket) return state;
      const movedTicket = { ...ticket, status: data.to as TicketStatus, ccStatus: (data.ccStatus || ticket.ccStatus) as Ticket["ccStatus"] };
      const columns = withoutTicket.map((col) => {
        if (col.status === data.to) {
          return { ...col, tickets: [...col.tickets, movedTicket].sort((a, b) => a.priority - b.priority) };
        }
        return col;
      });
      return { columns, stats: recalcStats(columns) };
    });
  },

  handleMergeProgress: (data) => {
    set((state) => {
      if (data.status === "merged") {
        // Move ticket from reviewing → merged
        const { ticket, columns: withoutTicket } = findAndRemoveTicket(state.columns, data.number);
        if (!ticket) return state;
        const movedTicket = { ...ticket, status: "merged" as TicketStatus, mergeStep: undefined };
        const columns = withoutTicket.map((col) =>
          col.status === "merged"
            ? { ...col, tickets: [...col.tickets, movedTicket].sort((a, b) => a.priority - b.priority) }
            : col,
        );
        return { columns, stats: recalcStats(columns) };
      }
      if (data.status === "cd_passed") {
        // CD succeeded — clear mergeStep tag
        return {
          columns: updateTicketInColumns(state.columns, data.number, { mergeStep: undefined }),
        };
      }
      return {
        columns: updateTicketInColumns(state.columns, data.number, { mergeStep: data.status }),
      };
    });
  },

  handleRebaseEvent: (_data) => {
    // Rebase events handled via toast in useEventWs, board refetches if needed
  },

  handleCICompleted: (data) => {
    set((state) => ({
      columns: updateTicketInColumns(state.columns, data.number, { ciPassed: data.passed }),
    }));
  },

  handleCDEvent: (_data) => {
    // CD events handled via toast
  },

  handleKanbanCCStatus: (data) => {
    set({ kanbanCCStatus: data.status as "running" | "stopped" | "error" });
  },

  handleOperatorChanged: (data) => {
    set({ operatorConnectionId: data.operatorConnectionId });
  },

  handlePilotStatus: (data) => {
    set({
      pilotActive: data.active,
      ...(!data.active && { pilotLastResetAt: null, pilotIdleTimeout: null, pilotNudging: false }),
    });
  },

  handlePilotIdleReset: (data) => {
    set({
      pilotLastResetAt: data.lastResetAt,
      pilotIdleTimeout: data.idleTimeout,
      pilotNudging: !!(data as Record<string, unknown>).nudging,
    });
  },
}));
