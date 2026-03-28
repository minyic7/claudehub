import { useEffect } from "react";
import { api } from "../api/client.js";
import { useBoardStore } from "../stores/boardStore.js";
import { getApiKey } from "../lib/utils.js";

export function useAutoStartKanbanCC(projectId: string | undefined) {
  useEffect(() => {
    if (!projectId) return;

    async function check() {
      try {
        const info = await api.getKanbanCC(projectId!);
        useBoardStore.setState({ kanbanCCStatus: info.status });
        if (info.status === "stopped") {
          try {
            await api.startKanbanCC(projectId!, getApiKey());
            useBoardStore.setState({ kanbanCCStatus: "running" });
          } catch {
            // 409 = already running, silently ignore
          }
        }
      } catch {
        // Kanban CC endpoint may not exist yet
      }
    }

    check();
  }, [projectId]);
}
