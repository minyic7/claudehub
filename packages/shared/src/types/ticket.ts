export type TicketStatus = "todo" | "in_progress" | "reviewing" | "merged";

export type TicketCCStatus = "idle" | "queued" | "running" | "completed";

export type TicketType = "feature" | "bugfix" | "refactor" | "docs" | "chore";

export type ReturnReason = "conflict" | "rejected";

export interface Ticket {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  ccStatus: TicketCCStatus;
  priority: number;
  branchName: string;
  worktreePath: string;
  dependencies: number[];
  githubIssueNumber: number;
  githubPrNumber?: number;
  taskBrief?: string;
  returnReason?: ReturnReason;
  mergeStep?: string;
  ciPassed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  type: TicketType;
  priority?: number;
  dependencies?: number[];
}

export interface UpdateTicketInput {
  description?: string;
  status?: TicketStatus;
  priority?: number;
  dependencies?: number[];
  taskBrief?: string;
}
