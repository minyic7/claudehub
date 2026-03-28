import { useState, useRef, useCallback } from "react";
import { useTerminalStore } from "../../stores/terminalStore.js";
import { useBoardStore } from "../../stores/boardStore.js";
import { api } from "../../api/client.js";
import TerminalView from "./TerminalView.js";
import CatScene from "./CatScene.js";

// Estimate terminal cols/rows from a container element
function estimateTermSize(el: HTMLElement): { cols: number; rows: number } {
  // Menlo at 13px: ~7.8px per char, default line-height ~1.2 = ~15.6px per row
  const charWidth = 7.8;
  const charHeight = 13 * 1.2;
  const rect = el.getBoundingClientRect();
  return {
    cols: Math.max(20, Math.floor(rect.width / charWidth)),
    rows: Math.max(5, Math.floor(rect.height / charHeight)),
  };
}

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

  const [loginRunning, setLoginRunning] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const termAreaRef = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(loadWidth);
  const draggingRef = useRef(false);

  const kanbanRunning = kanbanCCStatus === "running";

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;
    const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      // Dragging left border: moving mouse left = wider panel
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
      // persist
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

  const handleStartLogin = async () => {
    setLoginLoading(true);
    try {
      // Measure the terminal area to pass correct dimensions
      let cols: number | undefined;
      let rows: number | undefined;
      if (termAreaRef.current) {
        const size = estimateTermSize(termAreaRef.current);
        cols = size.cols;
        rows = size.rows;
      }
      await api.startClaudeLogin(cols, rows);
      setLoginRunning(true);
    } catch {
      // 409 = already running
      setLoginRunning(true);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleStopLogin = async () => {
    await api.stopClaudeLogin();
    setLoginRunning(false);
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
        <div ref={termAreaRef} className="flex-1 overflow-hidden flex">
          {kanbanRunning ? (
            <TerminalView type="kanban" projectId={projectId} panelWidth={width} />
          ) : loginRunning ? (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-default">
                <span className="font-pixel text-[7px] text-text-muted">
                  CLAUDE LOGIN SESSION
                </span>
                <button
                  onClick={handleStopLogin}
                  className="font-pixel text-[7px] text-status-error hover:text-status-error/80 cursor-pointer"
                >
                  CLOSE
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex">
                <TerminalView
                  type="login"
                  projectId={projectId}
                  onExit={() => setLoginRunning(false)}
                  panelWidth={width}
                />
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
                onClick={handleStartLogin}
                disabled={loginLoading}
                className="font-pixel text-[7px] text-accent hover:text-accent/80 cursor-pointer disabled:opacity-50"
              >
                {loginLoading ? "STARTING..." : "OPEN CLAUDE LOGIN TERMINAL"}
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
