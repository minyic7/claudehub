// WebSocket event types (server → frontend via event channel)

export type WSEventType =
  | "ticket:created"
  | "ticket:updated"
  | "ticket:deleted"
  | "ticket:status_changed"
  | "merge:progress"
  | "rebase:started"
  | "rebase:completed"
  | "rebase:conflict"
  | "ci:completed"
  | "cd:completed"
  | "cd:failed"
  | "kanban_cc:status_changed";

export interface WSEvent {
  type: WSEventType;
  projectId: string;
  data: Record<string, unknown>;
  timestamp: string;
}
