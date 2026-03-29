import { useEffect, useRef } from "react";
import type { WSEvent } from "@claudehub/shared";
import { buildWsUrl } from "./useWsUrl.js";
import { useBoardStore } from "../stores/boardStore.js";
import { toast } from "sonner";

const MAX_BACKOFF = 30_000;

export function useEventWs(projectId: string | undefined) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const backoffRef = useRef(1000);

  useEffect(() => {
    if (!projectId) return;

    function connect() {
      const url = buildWsUrl("/ws/events", { projectId: projectId! });
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Re-fetch board on reconnect to catch events missed while disconnected
        if (backoffRef.current > 1000) {
          useBoardStore.getState().fetchBoard(projectId!);
        }
        backoffRef.current = 1000;
      };

      ws.onmessage = (e) => {
        try {
          const event: WSEvent = JSON.parse(e.data);
          const store = useBoardStore.getState();

          const d = event.data;
          switch (event.type) {
            case "ticket:created":
              store.handleTicketCreated(d.ticket as Parameters<typeof store.handleTicketCreated>[0]);
              break;
            case "ticket:updated":
              store.handleTicketUpdated(d as Parameters<typeof store.handleTicketUpdated>[0]);
              break;
            case "ticket:deleted":
              store.handleTicketDeleted(d as Parameters<typeof store.handleTicketDeleted>[0]);
              break;
            case "ticket:status_changed":
              store.handleStatusChanged(d as Parameters<typeof store.handleStatusChanged>[0]);
              break;
            case "merge:progress":
              store.handleMergeProgress(d as Parameters<typeof store.handleMergeProgress>[0]);
              if (d.status === "merged") toast.success(`Ticket #${d.number} merged`);
              else if (d.status === "failed") toast.error(`Merge failed: ${d.error || "unknown error"}`);
              else if (d.status === "cd_failed") toast.error(`CD failed for ticket #${d.number} — urgent fix ticket will be created`);
              else if (d.status === "cd_timeout") toast.warning(`CD timed out for ticket #${d.number}`);
              break;
            case "rebase:started":
              toast.info(`Rebase started for ticket #${d.number}`);
              break;
            case "rebase:completed":
              toast.success(`Rebase completed for ticket #${d.number}`);
              break;
            case "rebase:conflict":
              toast.error(`Rebase conflict on ticket #${d.number}`);
              break;
            case "ci:completed":
              store.handleCICompleted(d as Parameters<typeof store.handleCICompleted>[0]);
              if (d.passed) toast.success(`CI passed for ticket #${d.number}`);
              else toast.error(`CI failed for ticket #${d.number}`);
              break;
            case "cd:completed":
              toast.success("CD completed");
              break;
            case "cd:failed":
              toast.error("CD failed — urgent fix ticket may be auto-created");
              break;
            case "kanban_cc:status_changed":
              store.handleKanbanCCStatus(d as Parameters<typeof store.handleKanbanCCStatus>[0]);
              break;
            case "operator:changed":
              store.handleOperatorChanged(d as Parameters<typeof store.handleOperatorChanged>[0]);
              break;
            case "pilot:status_changed":
              store.handlePilotStatus(d as { active: boolean });
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, MAX_BACKOFF);
        reconnectTimer.current = setTimeout(connect, delay);
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
