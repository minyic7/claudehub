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
  | "kanban_cc:status_changed"
  | "operator:changed"
  | "pilot:status_changed";

export type MergeProgressStep =
  | "creating_pr"
  | "merging"
  | "waiting_cd"
  | "cd_failed"
  | "cd_timeout"
  | "merged";

export interface WSEvent {
  type: WSEventType;
  projectId: string;
  data: Record<string, unknown>;
  timestamp: string;
}
