import { useEffect, useRef } from "react";
import type { WSEvent } from "@claudehub/shared";
import { buildWsUrl } from "./useWsUrl.js";
import { useBoardStore } from "../stores/boardStore.js";

export function useEventWs(projectId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!projectId) return;

    function connect() {
      const url = buildWsUrl("/ws/events", { projectId: projectId! });
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const event: WSEvent = JSON.parse(e.data);
          const store = useBoardStore.getState();

          switch (event.type) {
            case "ticket:created":
              store.handleTicketCreated(event.data as never);
              break;
            case "ticket:updated":
              store.handleTicketUpdated(event.data as never);
              break;
            case "ticket:deleted":
              store.handleTicketDeleted(event.data as never);
              break;
            case "ticket:status_changed":
              store.handleStatusChanged(event.data as never);
              break;
            case "merge:progress":
              store.handleMergeProgress(event.data as never);
              break;
            case "rebase:started":
            case "rebase:completed":
            case "rebase:conflict":
              store.handleRebaseEvent(event.data as never);
              break;
            case "ci:completed":
              store.handleCICompleted(event.data as never);
              break;
            case "cd:completed":
            case "cd:failed":
              store.handleCDEvent(event.data as never);
              break;
            case "kanban_cc:status_changed":
              store.handleKanbanCCStatus(event.data as never);
              break;
            case "operator:changed":
              store.handleOperatorChanged(event.data as never);
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [projectId]);
}
