import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalWs } from "../../hooks/useTerminalWs.js";

interface TerminalViewProps {
  type: "kanban" | "ticket" | "login";
  projectId: string;
  ticketNumber?: number;
  onExit?: () => void;
}

export default function TerminalView({
  type,
  projectId,
  ticketNumber,
  onExit,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [fontReady, setFontReady] = useState(false);

  const { attach, sendResize, connected } = useTerminalWs({
    type,
    projectId,
    ticketNumber,
    onExit,
  });

  // Font readiness check
  useEffect(() => {
    // System fonts are always ready
    setFontReady(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !fontReady) return;

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

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize(terminal.cols, terminal.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [attach, sendResize, fontReady]);

  return (
    <div className="flex-1 relative">
      {(!connected || !fontReady) && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base/80 z-10">
          <span className="font-pixel text-[8px] text-text-secondary">
            {fontReady ? "Connecting..." : "Loading font..."}
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
