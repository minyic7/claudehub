import { create } from "zustand";

interface TerminalStore {
  activeTab: "kanban" | "ticket";
  activeTicketNumber: number | null;
  kanbanConnected: boolean;
  ticketConnected: boolean;
  panelCollapsed: boolean;

  switchTab: (tab: "kanban" | "ticket") => void;
  openTicketTerminal: (number: number) => void;
  closeTicketTerminal: () => void;
  setKanbanConnected: (connected: boolean) => void;
  setTicketConnected: (connected: boolean) => void;
  togglePanel: () => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  activeTab: "kanban",
  activeTicketNumber: null,
  kanbanConnected: false,
  ticketConnected: false,
  panelCollapsed: false,

  switchTab: (tab) => set({ activeTab: tab }),

  openTicketTerminal: (number) => set({
    activeTicketNumber: number,
    activeTab: "ticket",
    ticketConnected: false,
  }),

  closeTicketTerminal: () => set({
    activeTicketNumber: null,
    activeTab: "kanban",
    ticketConnected: false,
  }),

  setKanbanConnected: (connected) => set({ kanbanConnected: connected }),
  setTicketConnected: (connected) => set({ ticketConnected: connected }),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
}));
