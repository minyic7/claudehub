import { useEffect, useRef, useCallback, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { buildWsUrl } from "./useWsUrl.js";

const MAX_BACKOFF = 30_000;

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
  const backoffRef = useRef(1000);
  const cleanedUpRef = useRef(false);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!enabled || !projectId || cleanedUpRef.current) return;
    if (type === "ticket" && ticketNumber == null) return;

    const path =
      type === "kanban"
        ? `/ws/terminal/kanban/${projectId}`
        : `/ws/terminal/ticket/${projectId}/${ticketNumber}`;

    const ws = new WebSocket(buildWsUrl(path));
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setConnected(true);
      backoffRef.current = 1000; // reset on success
    };

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
      if (!cleanedUpRef.current) {
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, MAX_BACKOFF);
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => ws.close();
  }, [type, projectId, ticketNumber, enabled]);

  useEffect(() => {
    cleanedUpRef.current = false;
    connect();
    return () => {
      cleanedUpRef.current = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const attach = useCallback((terminal: Terminal) => {
    terminalRef.current = terminal;
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
