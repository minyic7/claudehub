import type { TicketStatus } from "../types/ticket.js";

export const TICKET_COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: "todo", label: "TODO" },
  { status: "in_progress", label: "IN PROGRESS" },
  { status: "awaiting_merge", label: "AWAITING MERGE" },
  { status: "merged", label: "MERGED" },
];
