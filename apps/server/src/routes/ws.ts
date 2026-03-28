import { Hono } from "hono";
import { createNodeWebSocket } from "@hono/node-ws";
import { getPTY } from "../lib/pty.js";
import {
  addEventClient,
  removeEventClient,
  addTerminalClient,
  removeTerminalClient,
  isOperator,
} from "../lib/broadcast.js";
import { verifyToken } from "../lib/auth.js";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Event channel: /api/ws/events?projectId=xxx&token=xxx
app.get(
  "/events",
  upgradeWebSocket((c) => {
    const projectId = c.req.query("projectId");
    const token = c.req.query("token");

    return {
      onOpen(_event, ws) {
        // Verify auth
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

        // Replay history
        const history = pty.ringBuffer.getHistory();
        if (history.length > 0) {
          ws.send(new Uint8Array(history));
        }
      },
      onMessage(event, ws) {
        if (!isOperator(projectId, connectionId)) return;

        const key = `kanban:${projectId}`;
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
        if (!isOperator(projectId, connectionId)) return;

        const key = `ticket:${projectId}:${number}`;
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
        const pty = getPTY(key);
        if (pty) {
          const data = typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);
          pty.pty.write(data);
        }
      },
      onClose(_event, ws) {
        removeTerminalClient("login", ws.raw as unknown as import("ws").WebSocket, "__login__");
      },
    };
  }),
);

export { app as wsRoutes, injectWebSocket };
