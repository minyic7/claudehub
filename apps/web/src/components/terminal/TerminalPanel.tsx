import { useState } from "react";
import { useTerminalStore } from "../../stores/terminalStore.js";
import { useBoardStore } from "../../stores/boardStore.js";
import { api } from "../../api/client.js";
import TerminalView from "./TerminalView.js";
import CatScene from "./CatScene.js";

interface TerminalPanelProps {
  projectId: string;
}

export default function TerminalPanel({ projectId }: TerminalPanelProps) {
  const { activeTab, activeTicketNumber, panelCollapsed } = useTerminalStore();
  const switchTab = useTerminalStore((s) => s.switchTab);
  const kanbanCCStatus = useBoardStore((s) => s.kanbanCCStatus);

  const [loginRunning, setLoginRunning] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const kanbanRunning = kanbanCCStatus === "running";

  const handleStartLogin = async () => {
    setLoginLoading(true);
    try {
      await api.startClaudeLogin();
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
    <div className="w-[420px] shrink-0 bg-bg-surface border-l border-border-default flex flex-col">
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

      {/* Terminal views — only connect when CC is running */}
      {activeTab === "kanban" && (
        <div className="flex-1 overflow-hidden flex">
          {kanbanRunning ? (
            <TerminalView type="kanban" projectId={projectId} />
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
                <TerminalView type="login" projectId={projectId} />
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
          />
        </div>
      )}
    </div>
  );
}
