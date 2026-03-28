import type { Ticket, TicketStatus } from "./ticket.js";
import type { Project } from "./project.js";

export interface BoardColumn {
  status: TicketStatus;
  label: string;
  tickets: Ticket[];
}

export interface BoardStats {
  total: number;
  byStatus: Record<TicketStatus, number>;
  runningCC: number;
  queuedCC: number;
}

export interface BoardView {
  project: Omit<Project, "githubToken">;
  kanbanCCStatus: "running" | "stopped" | "error";
  columns: BoardColumn[];
  stats: BoardStats;
  operatorConnectionId: string | null;
}
