import { useEffect, useRef, useCallback, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { buildWsUrl } from "./useWsUrl.js";

interface UseTerminalWsOptions {
  type: "kanban" | "ticket";
  projectId: string;
  ticketNumber?: number;
  enabled?: boolean;
}

export function useTerminalWs({
  type,
  projectId,
  ticketNumber,
  enabled = true,
}: UseTerminalWsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!enabled || !projectId) return;
    if (type === "ticket" && ticketNumber == null) return;

    const path =
      type === "kanban"
        ? `/ws/terminal/kanban/${projectId}`
        : `/ws/terminal/ticket/${projectId}/${ticketNumber}`;

    const ws = new WebSocket(buildWsUrl(path));
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      if (terminalRef.current) {
        if (e.data instanceof ArrayBuffer) {
          terminalRef.current.write(new Uint8Array(e.data));
        } else {
          terminalRef.current.write(e.data);
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [type, projectId, ticketNumber, enabled]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const attach = useCallback((terminal: Terminal) => {
    terminalRef.current = terminal;
    // Send terminal input to WebSocket
    terminal.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });
  }, []);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return { attach, send, connected };
}
