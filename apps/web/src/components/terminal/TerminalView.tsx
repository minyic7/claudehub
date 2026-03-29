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
  /** Pass the panel's current pixel width so we can re-fit on drag resize */
  panelWidth?: number;
  /** If true, terminal is read-only (CC exited, showing history) */
  readOnly?: boolean;
}

const FIT_DEBOUNCE_MS = 80;

export default function TerminalView({
  type,
  projectId,
  ticketNumber,
  onExit,
  panelWidth,
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

    return () => {
      clearTimeout(fitTimerRef.current);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [attach, sendResize]);

  // Re-fit terminal when panel width changes (drag resize) or window resizes
  useEffect(() => {
    if (panelWidth == null) return;
    debouncedFit();
  }, [panelWidth, debouncedFit]);

  // Handle window resize and visualViewport resize (mobile keyboard)
  useEffect(() => {
    const onResize = () => debouncedFit();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [debouncedFit]);

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
