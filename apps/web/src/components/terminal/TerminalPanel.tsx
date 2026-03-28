import { useState, useRef, useCallback, useEffect } from "react";
import { useTerminalStore } from "../../stores/terminalStore.js";
import { useBoardStore } from "../../stores/boardStore.js";
import { api } from "../../api/client.js";
import { getApiKey } from "../../lib/utils.js";
import { toast } from "sonner";
import TerminalView from "./TerminalView.js";
import CatScene from "./CatScene.js";

const MIN_WIDTH = 300;
const MAX_WIDTH_RATIO = 0.7;
const DEFAULT_WIDTH = 420;
const STORAGE_KEY = "claudehub:terminal-width";

function loadWidth(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) {
      const n = Number(v);
      if (n >= MIN_WIDTH) return n;
    }
  } catch {}
  return DEFAULT_WIDTH;
}

interface TerminalPanelProps {
  projectId: string;
}

export default function TerminalPanel({ projectId }: TerminalPanelProps) {
  const { activeTab, activeTicketNumber, panelCollapsed } = useTerminalStore();
  const switchTab = useTerminalStore((s) => s.switchTab);
  const kanbanCCStatus = useBoardStore((s) => s.kanbanCCStatus);

  const [width, setWidth] = useState(loadWidth);
  const draggingRef = useRef(false);

  const kanbanRunning = kanbanCCStatus === "running";

  // Clean up drag state if component unmounts mid-drag
  useEffect(() => {
    return () => {
      if (draggingRef.current) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        draggingRef.current = false;
      }
    };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;
    const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startX - ev.clientX;
      const next = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + delta));
      setWidth(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => {
        localStorage.setItem(STORAGE_KEY, String(Math.round(w)));
        return w;
      });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  const [ccLoading, setCcLoading] = useState(false);

  const handleStopKanbanCC = async () => {
    setCcLoading(true);
    try {
      await api.stopKanbanCC(projectId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop Kanban CC");
    }
    setCcLoading(false);
  };

  const handleStartKanbanCC = async () => {
    setCcLoading(true);
    try {
      await api.startKanbanCC(projectId, getApiKey());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start Kanban CC");
    }
    setCcLoading(false);
  };

  const handleRestartKanbanCC = async () => {
    setCcLoading(true);
    try {
      await api.stopKanbanCC(projectId);
      await new Promise((r) => setTimeout(r, 500));
      await api.startKanbanCC(projectId, getApiKey());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restart Kanban CC");
    }
    setCcLoading(false);
  };

  if (panelCollapsed) {
    return (
      <div
        className="w-9 shrink-0 bg-bg-surface border-l border-border-default flex items-center justify-center cursor-pointer hover:bg-bg-elevated transition-colors"
        onClick={() => {
          useTerminalStore.setState({ panelCollapsed: false });
        }}
      >
        <span className="font-pixel text-[8px] text-text-muted [writing-mode:vertical-lr]">
          {">>"}
        </span>
      </div>
    );
  }

  return (
    <div className="shrink-0 bg-bg-surface border-l border-border-default flex flex-col relative" style={{ width }}>
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/40 transition-colors z-20"
      />
      {/* Tab bar */}
      <div className="flex border-b border-border-default">
        <button
          onClick={() => switchTab("kanban")}
          className={`flex-1 font-pixel text-[8px] px-3 py-2 transition-colors cursor-pointer ${
            activeTab === "kanban"
              ? "text-accent border-b border-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          KANBAN CC
        </button>
        {activeTicketNumber !== null && (
          <button
            onClick={() => switchTab("ticket")}
            className={`flex-1 font-pixel text-[8px] px-3 py-2 transition-colors cursor-pointer ${
              activeTab === "ticket"
                ? "text-accent border-b border-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            TICKET #{activeTicketNumber}
          </button>
        )}
        <button
          onClick={() =>
            useTerminalStore.setState({ panelCollapsed: true })
          }
          className="font-pixel text-[8px] text-text-muted hover:text-text-secondary px-2 cursor-pointer"
        >
          {"<<"}
        </button>
      </div>

      {/* Terminal area */}
      {activeTab === "kanban" && (
        <div className="flex-1 overflow-hidden flex">
          {kanbanRunning ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-end gap-2 px-3 py-1 border-b border-border-default">
                <button
                  onClick={handleRestartKanbanCC}
                  disabled={ccLoading}
                  className="font-pixel text-[7px] text-text-muted hover:text-accent cursor-pointer disabled:opacity-50"
                >
                  RESTART
                </button>
                <button
                  onClick={handleStopKanbanCC}
                  disabled={ccLoading}
                  className="font-pixel text-[7px] text-status-error hover:text-status-error/80 cursor-pointer disabled:opacity-50"
                >
                  STOP
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex">
                <TerminalView type="kanban" projectId={projectId} panelWidth={width} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-full h-[120px]">
                <CatScene />
              </div>
              <span className="font-pixel text-[8px] text-text-muted">
                KANBAN CC {kanbanCCStatus.toUpperCase()}
              </span>
              <button
                onClick={handleStartKanbanCC}
                disabled={ccLoading}
                className="font-pixel text-[7px] text-accent hover:text-accent/80 cursor-pointer disabled:opacity-50"
              >
                {ccLoading ? "STARTING..." : "START KANBAN CC"}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "ticket" && activeTicketNumber !== null && (
        <div className="flex-1 overflow-hidden flex">
          <TerminalView
            type="ticket"
            projectId={projectId}
            ticketNumber={activeTicketNumber}
            panelWidth={width}
          />
        </div>
      )}
    </div>
  );
}
