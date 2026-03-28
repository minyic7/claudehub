import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { getPTY, resizePTY } from "../lib/pty.js";
import {
  addEventClient,
  removeEventClient,
  addTerminalClient,
  removeTerminalClient,
  isOperator,
} from "../lib/broadcast.js";
import { verifyToken } from "../lib/auth.js";

const RESIZE_PREFIX = 0x01;

/** Convert any binary data type to Uint8Array */
function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

/** Try to parse a resize message (0x01 + JSON {cols, rows}). Returns null if not a resize. */
function parseResize(data: unknown): { cols: number; rows: number } | null {
  if (typeof data === "string") return null;
  const bytes = toUint8Array(data);
  if (!bytes || bytes.length < 2 || bytes[0] !== RESIZE_PREFIX) return null;
  try {
    const json = new TextDecoder().decode(bytes.slice(1));
    const parsed = JSON.parse(json);
    const { cols, rows } = parsed;
    if (typeof cols === "number" && typeof rows === "number" && cols > 0 && rows > 0) {
      console.log(`[ws] resize: ${cols}x${rows}`);
      return { cols, rows };
    }
  } catch { /* ignore */ }
  return null;
}

export function createWsRoutes(upgradeWebSocket: UpgradeWebSocket) {
  const app = new Hono();

  // Event channel: /api/ws/events?projectId=xxx&token=xxx
  app.get(
    "/events",
    upgradeWebSocket((c) => {
      const projectId = c.req.query("projectId");
      const token = c.req.query("token");

      return {
        onOpen(_event, ws) {
          if (!token || !verifyToken(token)) {
            ws.close(1008, "Unauthorized");
            return;
          }
          addEventClient(ws.raw as unknown as import("ws").WebSocket, projectId);
        },
        onClose(_event, ws) {
          removeEventClient(ws.raw as unknown as import("ws").WebSocket);
        },
      };
    }),
  );

  // Terminal channel: /api/ws/terminal/kanban/:projectId?token=xxx&connectionId=xxx
  app.get(
    "/terminal/kanban/:projectId",
    upgradeWebSocket((c) => {
      const projectId = c.req.param("projectId")!;
      const token = c.req.query("token");
      const connectionId = c.req.query("connectionId") || crypto.randomUUID();

      return {
        onOpen(_event, ws) {
          if (!token || !verifyToken(token)) {
            ws.close(1008, "Unauthorized");
            return;
          }

          const key = `kanban:${projectId}`;
          const pty = getPTY(key);
          if (!pty) {
            ws.close(1011, "Kanban CC not running");
            return;
          }

          const rawWs = ws.raw as unknown as import("ws").WebSocket;
          addTerminalClient(key, rawWs, connectionId, projectId);

          const history = pty.ringBuffer.getHistory();
          if (history.length > 0) {
            ws.send(new Uint8Array(history));
          }
        },
        onMessage(event, ws) {
          const key = `kanban:${projectId}`;
          // Resize bypasses operator check — it's a display concern
          const resize = parseResize(event.data);
          if (resize) {
            resizePTY(key, resize.cols, resize.rows);
            return;
          }
          if (!isOperator(projectId, connectionId)) return;
          const pty = getPTY(key);
          if (pty) {
            const data = typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
            pty.pty.write(data);
          }
        },
        onClose(_event, ws) {
          const key = `kanban:${projectId}`;
          removeTerminalClient(key, ws.raw as unknown as import("ws").WebSocket, projectId);
        },
      };
    }),
  );

  // Terminal channel: /api/ws/terminal/ticket/:projectId/:number?token=xxx&connectionId=xxx
  app.get(
    "/terminal/ticket/:projectId/:number",
    upgradeWebSocket((c) => {
      const projectId = c.req.param("projectId")!;
      const number = c.req.param("number")!;
      const token = c.req.query("token");
      const connectionId = c.req.query("connectionId") || crypto.randomUUID();

      return {
        onOpen(_event, ws) {
          if (!token || !verifyToken(token)) {
            ws.close(1008, "Unauthorized");
            return;
          }

          const key = `ticket:${projectId}:${number}`;
          const pty = getPTY(key);
          if (!pty) {
            ws.close(1011, "Ticket CC not running");
            return;
          }

          const rawWs = ws.raw as unknown as import("ws").WebSocket;
          addTerminalClient(key, rawWs, connectionId, projectId);

          const history = pty.ringBuffer.getHistory();
          if (history.length > 0) {
            ws.send(new Uint8Array(history));
          }
        },
        onMessage(event, ws) {
          const key = `ticket:${projectId}:${number}`;
          // Resize bypasses operator check — it's a display concern
          const resize = parseResize(event.data);
          if (resize) {
            resizePTY(key, resize.cols, resize.rows);
            return;
          }
          if (!isOperator(projectId, connectionId)) return;
          const pty = getPTY(key);
          if (pty) {
            const data = typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
            pty.pty.write(data);
          }
        },
        onClose(_event, ws) {
          const key = `ticket:${projectId}:${number}`;
          removeTerminalClient(key, ws.raw as unknown as import("ws").WebSocket, projectId);
        },
      };
    }),
  );

  // Terminal channel: /api/ws/terminal/login?token=xxx
  app.get(
    "/terminal/login",
    upgradeWebSocket((c) => {
      const token = c.req.query("token");

      return {
        onOpen(_event, ws) {
          if (!token || !verifyToken(token)) {
            ws.close(1008, "Unauthorized");
            return;
          }

          const key = "login";
          const pty = getPTY(key);
          if (!pty) {
            ws.close(1011, "Login session not running");
            return;
          }

          const rawWs = ws.raw as unknown as import("ws").WebSocket;
          addTerminalClient(key, rawWs, "login", "__login__");

          const history = pty.ringBuffer.getHistory();
          if (history.length > 0) {
            ws.send(new Uint8Array(history));
          }
        },
        onMessage(event, ws) {
          const key = "login";
          // Debug: log incoming message type
          const d = event.data;
          const isStr = typeof d === "string";
          console.log(`[ws:login] msg type=${isStr ? "string" : d?.constructor?.name} len=${isStr ? d.length : (d as ArrayBuffer)?.byteLength}`);
          const resize = parseResize(d);
          if (resize) {
            resizePTY(key, resize.cols, resize.rows);
            return;
          }
          const pty = getPTY(key);
          if (pty) {
            const data = isStr
              ? d
              : new TextDecoder().decode(d as ArrayBuffer);
            pty.pty.write(data);
          }
        },
        onClose(_event, ws) {
          removeTerminalClient("login", ws.raw as unknown as import("ws").WebSocket, "__login__");
        },
      };
    }),
  );

  return app;
}
