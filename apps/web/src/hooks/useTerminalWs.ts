import { useEffect, useRef, useCallback, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { buildWsUrl } from "./useWsUrl.js";
import { getConnectionId } from "../lib/utils.js";

const MAX_BACKOFF = 30_000;

interface UseTerminalWsOptions {
  type: "kanban" | "ticket";
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

  // Keep onExit in a ref so it doesn't cause reconnections when the callback identity changes
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const connect = useCallback(() => {
    if (!enabled || cleanedUpRef.current) return;
    if (!projectId) return;
    if (type === "ticket" && ticketNumber == null) return;

    const path = type === "kanban"
      ? `/ws/terminal/kanban/${projectId}`
      : `/ws/terminal/ticket/${projectId}/${ticketNumber}`;

    const ws = new WebSocket(buildWsUrl(path, { connectionId: getConnectionId() }));
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
        onExitRef.current?.();
        return; // Don't reconnect
      }

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

    // Shift+Enter → newline instead of submit
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.key === "Enter" && e.shiftKey) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send("\n");
        }
        return false; // Prevent default Enter handling
      }
      return true;
    });

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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const json = JSON.stringify({ cols, rows });
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(json);
    const payload = new Uint8Array(1 + jsonBytes.length);
    payload[0] = 0x01;
    payload.set(jsonBytes, 1);
    ws.send(payload);
  }, []);

  return { attach, send, sendResize, connected };
}
