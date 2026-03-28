import { create } from "zustand";

interface TerminalStore {
  activeTab: "kanban" | number; // "kanban" or ticket number
  panelCollapsed: boolean;

  switchTab: (tab: "kanban" | number) => void;
  togglePanel: () => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  activeTab: "kanban",
  panelCollapsed: false,

  switchTab: (tab) => set({ activeTab: tab }),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
}));
