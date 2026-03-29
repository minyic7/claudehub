import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalWs } from "../../hooks/useTerminalWs.js";

interface TerminalViewProps {
  type: "kanban" | "ticket";
  projectId: string;
  ticketNumber?: number;
  onExit?: () => void;
  /** If true, terminal is read-only (CC exited, showing history) */
  readOnly?: boolean;
}

const FIT_DEBOUNCE_MS = 80;

export default function TerminalView({
  type,
  projectId,
  ticketNumber,
  onExit,
  readOnly,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const fitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { attach, sendResize, connected } = useTerminalWs({
    type,
    projectId,
    ticketNumber,
    onExit,
  });

  // Debounced fit: waits for resize to settle before fitting
  const debouncedFit = useCallback(() => {
    clearTimeout(fitTimerRef.current);
    fitTimerRef.current = setTimeout(() => {
      const fitAddon = fitAddonRef.current;
      const terminal = terminalRef.current;
      if (!fitAddon || !terminal) return;
      try {
        fitAddon.fit();
      } catch {
        // fit() can throw at very small sizes — still send resize with current dims
      }
      sendResize(terminal.cols, terminal.rows);
    }, FIT_DEBOUNCE_MS);
  }, [sendResize]);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: "#0a0a0f",
        foreground: "#c8c8d4",
        cursor: "#a855f7",
        selectionBackground: "#a855f740",
        black: "#0a0a0f",
        brightBlack: "#3a3a4a",
        white: "#c8c8d4",
        brightWhite: "#e8e8f0",
      },
      cursorBlink: true,
      cursorStyle: "block",
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    attach(terminal);

    // Send initial size
    sendResize(terminal.cols, terminal.rows);

    // Use ResizeObserver on actual container for accurate resize detection
    const ro = new ResizeObserver(() => debouncedFit());
    ro.observe(containerRef.current);

    // Also listen to visualViewport for mobile keyboard changes
    const onVVResize = () => debouncedFit();
    window.visualViewport?.addEventListener("resize", onVVResize);

    return () => {
      clearTimeout(fitTimerRef.current);
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", onVVResize);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [attach, sendResize, debouncedFit]);

  return (
    <div className="flex-1 relative">
      {!connected && !readOnly && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base/80 z-10">
          <span className="font-pixel text-[8px] text-text-secondary">
            Connecting...
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
