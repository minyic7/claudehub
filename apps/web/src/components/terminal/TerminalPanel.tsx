import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTerminalStore } from "../../stores/terminalStore.js";
import { useBoardStore } from "../../stores/boardStore.js";
import { api } from "../../api/client.js";
import { getApiKey } from "../../lib/utils.js";
import { toast } from "sonner";
import type { CCSession } from "@claudehub/shared";
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

interface TerminalPanelProps {
  projectId: string;
}

export default function TerminalPanel({ projectId }: TerminalPanelProps) {
  const { activeTab, panelCollapsed } = useTerminalStore();
  const switchTab = useTerminalStore((s) => s.switchTab);
  const kanbanCCStatus = useBoardStore((s) => s.kanbanCCStatus);
  const storePilotActive = useBoardStore((s) => s.pilotActive);
  const columns = useBoardStore((s) => s.columns);

  // Derive running/queued/completed ticket numbers from board state (exclude merged)
  const activeTicketNumbers = useMemo(() => {
    const tickets = columns.flatMap((col) => col.tickets);
    return tickets
      .filter((t) => t.status !== "merged" && (t.ccStatus === "running" || t.ccStatus === "queued" || t.ccStatus === "completed"))
      .sort((a, b) => a.number - b.number)
      .map((t) => t.number);
  }, [columns]);

  // If active tab is a ticket that's no longer running, switch to kanban
  useEffect(() => {
    if (typeof activeTab === "number" && !activeTicketNumbers.includes(activeTab)) {
      switchTab("kanban");
    }
  }, [activeTab, activeTicketNumbers, switchTab]);

  const [width, setWidth] = useState(loadWidth);
  const draggingRef = useRef(false);

  const kanbanRunning = kanbanCCStatus === "running";

  const [ccLoading, setCcLoading] = useState(false);
  const [sessions, setSessions] = useState<CCSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Pilot mode state
  const [pilotActive, setPilotActive] = useState(false);
  const [pilotLoading, setPilotLoading] = useState(false);
  const [showPilotForm, setShowPilotForm] = useState(false);
  const [pilotGoal, setPilotGoal] = useState("");
  const [pilotMin, setPilotMin] = useState(30);
  const [pilotMax, setPilotMax] = useState(120);

  // Fetch pilot status when kanban is running
  useEffect(() => {
    if (!kanbanRunning) { setPilotActive(false); return; }
    api.getPilotStatus(projectId)
      .then((res) => setPilotActive(res.active))
      .catch(() => {});
  }, [projectId, kanbanRunning]);

  // Sync from WS events
  useEffect(() => { setPilotActive(storePilotActive); }, [storePilotActive]);

  const handleStartPilot = async () => {
    if (!pilotGoal.trim()) return;
    setPilotLoading(true);
    try {
      await api.startPilot(projectId, pilotGoal.trim(), pilotMin, pilotMax);
      setPilotActive(true);
      setShowPilotForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start pilot");
    }
    setPilotLoading(false);
  };

  const handleStopPilot = async () => {
    setPilotLoading(true);
    try {
      await api.stopPilot(projectId);
      setPilotActive(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop pilot");
    }
    setPilotLoading(false);
  };

  // Fetch sessions when not running
  useEffect(() => {
    if (kanbanRunning) return;
    let cancelled = false;
    setSessionsLoading(true);
    api.getKanbanCCSessions(projectId)
      .then((res) => { if (!cancelled) setSessions(res.sessions); })
      .catch(() => { if (!cancelled) setSessions([]); })
      .finally(() => { if (!cancelled) setSessionsLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, kanbanRunning]);

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

  const handleStopKanbanCC = async () => {
    setCcLoading(true);
    try {
      await api.stopKanbanCC(projectId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop Kanban CC");
    }
    setCcLoading(false);
  };

  const handleStartKanbanCC = async (sessionId?: string) => {
    setCcLoading(true);
    try {
      await api.startKanbanCC(projectId, { apiKey: getApiKey(), sessionId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start Kanban CC");
    }
    setCcLoading(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await api.deleteKanbanCCSession(projectId, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete session");
    }
  };

  if (panelCollapsed) {
    return (
      <div
        className="w-9 h-full bg-bg-surface border border-border-default rounded flex items-center justify-center cursor-pointer hover:bg-bg-elevated transition-colors"
        onClick={() => {
          useTerminalStore.setState({ panelCollapsed: false });
        }}
      >
        <span className="font-pixel text-[8px] text-text-muted [writing-mode:vertical-lr]">
          TERMINAL
        </span>
      </div>
    );
  }

  const isKanbanTab = activeTab === "kanban";
  const activeTicketTab = typeof activeTab === "number" ? activeTab : null;

  return (
    <div className="h-full bg-bg-surface border border-border-default rounded flex flex-col relative" style={{ width }}>
      {/* Drag handle — extends slightly left beyond the panel border for easier grabbing */}
      <div
        onMouseDown={handleDragStart}
        className="absolute -left-1 top-0 bottom-0 w-3 cursor-col-resize hover:bg-accent/40 transition-colors z-20"
      />
      {/* Tab bar */}
      <div className="flex border-b border-border-default overflow-x-auto">
        <button
          onClick={() => switchTab("kanban")}
          className={`shrink-0 font-pixel text-[8px] px-3 py-2 transition-colors cursor-pointer ${
            isKanbanTab
              ? "text-accent border-b border-accent"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          KANBAN
        </button>
        {activeTicketNumbers.map((num) => (
          <button
            key={num}
            onClick={() => switchTab(num)}
            className={`shrink-0 font-pixel text-[8px] px-3 py-2 transition-colors cursor-pointer ${
              activeTicketTab === num
                ? "text-accent border-b border-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            #{num}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() =>
            useTerminalStore.setState({ panelCollapsed: true })
          }
          className="shrink-0 font-pixel text-[8px] text-text-muted hover:text-text-secondary px-2 cursor-pointer"
        >
          {"<<"}
        </button>
      </div>

      {/* Terminal area */}
      {isKanbanTab && (
        <div className="flex-1 overflow-hidden flex">
          {kanbanRunning ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex flex-col border-b border-border-default">
                <div className="flex items-center justify-end gap-2 px-3 py-1">
                  <button
                    onClick={() => {
                      if (pilotActive) handleStopPilot();
                      else setShowPilotForm((v) => !v);
                    }}
                    disabled={pilotLoading}
                    className={`font-pixel text-[7px] cursor-pointer disabled:opacity-50 ${
                      pilotActive
                        ? "text-accent animate-pulse"
                        : "text-text-muted hover:text-accent"
                    }`}
                  >
                    {pilotActive ? "PILOT ON" : "PILOT"}
                  </button>
                  <button
                    onClick={handleStopKanbanCC}
                    disabled={ccLoading}
                    className="font-pixel text-[7px] text-status-error hover:text-status-error/80 cursor-pointer disabled:opacity-50"
                  >
                    STOP
                  </button>
                </div>
                {showPilotForm && !pilotActive && (
                  <div className="flex flex-col gap-1.5 px-3 py-2 border-t border-border-default">
                    <input
                      type="text"
                      value={pilotGoal}
                      onChange={(e) => setPilotGoal(e.target.value)}
                      placeholder="Goal (e.g. complete the app)"
                      className="font-pixel text-[7px] bg-bg-base border border-border-default rounded px-2 py-1 text-text-primary placeholder:text-text-muted outline-none focus:border-accent/60"
                    />
                    <div className="flex items-center gap-2">
                      <label className="font-pixel text-[6px] text-text-muted">MIN</label>
                      <input
                        type="number"
                        value={pilotMin}
                        onChange={(e) => setPilotMin(Number(e.target.value) || 30)}
                        className="w-12 font-pixel text-[7px] bg-bg-base border border-border-default rounded px-1 py-0.5 text-text-primary outline-none focus:border-accent/60"
                      />
                      <label className="font-pixel text-[6px] text-text-muted">MAX</label>
                      <input
                        type="number"
                        value={pilotMax}
                        onChange={(e) => setPilotMax(Number(e.target.value) || 120)}
                        className="w-12 font-pixel text-[7px] bg-bg-base border border-border-default rounded px-1 py-0.5 text-text-primary outline-none focus:border-accent/60"
                      />
                      <span className="font-pixel text-[6px] text-text-muted">sec</span>
                      <button
                        onClick={handleStartPilot}
                        disabled={pilotLoading || !pilotGoal.trim()}
                        className="ml-auto font-pixel text-[7px] text-accent hover:text-accent/80 cursor-pointer disabled:opacity-50"
                      >
                        START
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-hidden flex">
                <TerminalView type="kanban" projectId={projectId} panelWidth={width} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center gap-3 pt-4 px-3 overflow-y-auto">
              <div className="w-full h-[100px] shrink-0">
                <CatScene />
              </div>
              <span className="font-pixel text-[8px] text-text-muted">
                KANBAN CC {kanbanCCStatus.toUpperCase()}
              </span>

              {/* New session button */}
              <button
                onClick={() => handleStartKanbanCC()}
                disabled={ccLoading}
                className="w-full font-pixel text-[7px] text-accent hover:text-accent/80 border border-accent/30 hover:border-accent/60 rounded px-3 py-2 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {ccLoading ? "STARTING..." : "+ NEW SESSION"}
              </button>

              {/* Session list */}
              {sessionsLoading ? (
                <span className="font-pixel text-[7px] text-text-muted">Loading sessions...</span>
              ) : sessions.length > 0 ? (
                <div className="w-full flex flex-col gap-1">
                  <span className="font-pixel text-[7px] text-text-muted mb-1">RESUME SESSION</span>
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="group flex items-center gap-1 w-full border border-border-default rounded px-2 py-1.5 hover:border-accent/40 transition-colors"
                    >
                      <button
                        onClick={() => handleStartKanbanCC(s.id)}
                        disabled={ccLoading}
                        className="flex-1 text-left font-pixel text-[7px] text-text-secondary hover:text-accent cursor-pointer disabled:opacity-50 truncate"
                        title={s.id}
                      >
                        {s.id.slice(0, 8)}... - {formatTime(s.lastActiveAt)}
                      </button>
                      <button
                        onClick={() => handleDeleteSession(s.id)}
                        className="font-pixel text-[7px] text-text-muted hover:text-status-error cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Delete session"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {activeTicketTab !== null && (() => {
        const ticket = columns.flatMap((c) => c.tickets).find((t) => t.number === activeTicketTab);
        const isReadOnly = ticket?.ccStatus === "completed";
        return (
          <div className="flex-1 overflow-hidden flex">
            <TerminalView
              type="ticket"
              projectId={projectId}
              ticketNumber={activeTicketTab}
              panelWidth={width}
              readOnly={isReadOnly}
            />
          </div>
        );
      })()}
    </div>
  );
}
