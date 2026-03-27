export type KanbanCCStatus = "running" | "stopped" | "error";

export interface KanbanCCInfo {
  status: KanbanCCStatus;
  pid?: number;
  uptime?: number;
  lastActiveAt?: string;
}

export interface TicketCCInfo {
  ccStatus: "idle" | "queued" | "running" | "completed";
  pid?: number;
  uptime?: number;
  lastActiveAt?: string;
}
