export type TicketStatus = "todo" | "in_progress" | "awaiting_merge" | "merged";

export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TicketStatus;
  branch: string;
  worktreePath: string;
  plugins: string[];
  mcpServers: string[];
  createdAt: string;
  updatedAt: string;
}
