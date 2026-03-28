import { useEffect, useRef, useCallback, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { buildWsUrl } from "./useWsUrl.js";

const MAX_BACKOFF = 30_000;

interface UseTerminalWsOptions {
  type: "kanban" | "ticket" | "login";
  projectId: string;
  ticketNumber?: number;
  enabled?: boolean;
  onExit?: () => void;
}

export function useTerminalWs({
  type,
  projectId,
  ticketNumber,
  enabled = true,
  onExit,
}: UseTerminalWsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const backoffRef = useRef(1000);
  const cleanedUpRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    if (!enabled || cleanedUpRef.current) return;
    if (type !== "login" && !projectId) return;
    if (type === "ticket" && ticketNumber == null) return;

    const path =
      type === "login"
        ? "/ws/terminal/login"
        : type === "kanban"
          ? `/ws/terminal/kanban/${projectId}`
          : `/ws/terminal/ticket/${projectId}/${ticketNumber}`;

    const ws = new WebSocket(buildWsUrl(path));
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setConnected(true);
      wasConnectedRef.current = true;
      backoffRef.current = 1000;
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

    ws.onclose = (e) => {
      setConnected(false);
      wsRef.current = null;

      // 1011 = PTY not running. If we were previously connected, the process exited.
      if (e.code === 1011 && wasConnectedRef.current) {
        onExit?.();
        return; // Don't reconnect
      }

      if (!cleanedUpRef.current) {
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, MAX_BACKOFF);
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => ws.close();
  }, [type, projectId, ticketNumber, enabled, onExit]);

  useEffect(() => {
    cleanedUpRef.current = false;
    wasConnectedRef.current = false;
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

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const json = JSON.stringify({ cols, rows });
      const payload = new Uint8Array(1 + json.length);
      payload[0] = 0x01;
      for (let i = 0; i < json.length; i++) {
        payload[i + 1] = json.charCodeAt(i);
      }
      ws.send(payload.buffer);
    }
  }, []);

  return { attach, send, sendResize, connected };
}
