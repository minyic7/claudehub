import type { TicketStatus } from "../types/ticket.js";

export const TICKET_COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: "todo", label: "TODO" },
  { status: "in_progress", label: "IN PROGRESS" },
  { status: "reviewing", label: "REVIEWING" },
  { status: "merged", label: "MERGED" },
];

export const TICKET_TYPES = [
  "feature",
  "bugfix",
  "refactor",
  "docs",
  "chore",
] as const;

export const MAX_TITLE_LENGTH = 72;
export const TITLE_PATTERN = /^[a-zA-Z0-9 -]+$/;

export const DEFAULT_MAX_CONCURRENT_TICKETS = 3;
