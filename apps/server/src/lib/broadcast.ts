import type { WebSocket } from "ws";
import type { WSEvent, WSEventType } from "@claudehub/shared";

interface EventClient {
  ws: WebSocket;
  projectId?: string; // If set, only receive events for this project
}

const eventClients = new Set<EventClient>();

// Ping interval to keep event WS alive through nginx/proxy timeouts
const PING_INTERVAL_MS = 25_000;

export function addEventClient(ws: WebSocket, projectId?: string): void {
  const client: EventClient = { ws, projectId };
  eventClients.add(client);

  // Start ping/pong keepalive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, PING_INTERVAL_MS);

  ws.on("close", () => clearInterval(pingInterval));
}

export function removeEventClient(ws: WebSocket): void {
  for (const client of eventClients) {
    if (client.ws === ws) {
      eventClients.delete(client);
      break;
    }
  }
}

export function broadcastEvent(
  type: WSEventType,
  projectId: string,
  data: Record<string, unknown>,
): void {
  const event: WSEvent = {
    type,
    projectId,
    data,
    timestamp: new Date().toISOString(),
  };
  const message = JSON.stringify(event);

  let sent = 0;
  for (const client of eventClients) {
    if (!client.projectId || client.projectId === projectId) {
      try {
        client.ws.send(message);
        sent++;
      } catch {
        eventClients.delete(client);
      }
    }
  }
  console.log(`[broadcast] ${type} → ${sent}/${eventClients.size} clients (project=${projectId})`);
}

// ── Terminal WebSocket connections ──

interface TerminalClient {
  ws: WebSocket;
  connectionId: string;
}

// key: "kanban:{projectId}" or "ticket:{projectId}:{number}"
const terminalClients = new Map<string, Set<TerminalClient>>();

// per-project operator lock
const operatorLocks = new Map<string, string>(); // projectId → connectionId

export function addTerminalClient(
  key: string,
  ws: WebSocket,
  connectionId: string,
  projectId: string,
): void {
  if (!terminalClients.has(key)) {
    terminalClients.set(key, new Set());
  }
  terminalClients.get(key)!.add({ ws, connectionId });

  // Auto-acquire lock if no current operator for this project
  if (!operatorLocks.has(projectId)) {
    // Only assign if no other terminal clients exist for this project yet
    const existing = getAllTerminalClientsForProject(projectId);
    // existing includes the one we just added, so if size === 1, we're the first
    if (existing.length <= 1) {
      operatorLocks.set(projectId, connectionId);
      broadcastEvent("operator:changed", projectId, { operatorConnectionId: connectionId });
    }
  }
}

export function removeTerminalClient(
  key: string,
  ws: WebSocket,
  projectId: string,
): void {
  const clients = terminalClients.get(key);
  if (!clients) return;

  let removedId: string | undefined;
  for (const client of clients) {
    if (client.ws === ws) {
      removedId = client.connectionId;
      clients.delete(client);
      break;
    }
  }

  if (clients.size === 0) {
    terminalClients.delete(key);
  }

  // Release lock if operator disconnected
  if (removedId && operatorLocks.get(projectId) === removedId) {
    operatorLocks.delete(projectId);
    // Auto-assign to remaining client if only one left
    const remaining = getAllTerminalClientsForProject(projectId);
    if (remaining.length === 1) {
      operatorLocks.set(projectId, remaining[0].connectionId);
      broadcastEvent("operator:changed", projectId, { operatorConnectionId: remaining[0].connectionId });
    } else if (remaining.length === 0) {
      broadcastEvent("operator:changed", projectId, { operatorConnectionId: null });
    } else {
      broadcastEvent("operator:changed", projectId, { operatorConnectionId: null });
    }
  }
}

export function isOperator(projectId: string, connectionId: string): boolean {
  return operatorLocks.get(projectId) === connectionId;
}

export function getOperatorConnectionId(projectId: string): string | null {
  return operatorLocks.get(projectId) ?? null;
}

export function broadcastTerminalOutput(key: string, data: Buffer): void {
  const clients = terminalClients.get(key);
  if (!clients) return;
  const dead: TerminalClient[] = [];
  for (const client of clients) {
    try {
      client.ws.send(data);
    } catch {
      dead.push(client);
    }
  }
  // Clean up dead clients after iteration (avoids modifying Set during iteration)
  for (const client of dead) {
    clients.delete(client);
    // Release operator lock if this was the operator
    for (const [projectId, holderId] of operatorLocks) {
      if (holderId === client.connectionId) {
        operatorLocks.delete(projectId);
        const remaining = getAllTerminalClientsForProject(projectId);
        if (remaining.length === 1) {
          operatorLocks.set(projectId, remaining[0].connectionId);
          broadcastEvent("operator:changed", projectId, { operatorConnectionId: remaining[0].connectionId });
        } else {
          broadcastEvent("operator:changed", projectId, { operatorConnectionId: null });
        }
        break;
      }
    }
  }
  if (clients.size === 0) {
    terminalClients.delete(key);
  }
}

function getAllTerminalClientsForProject(
  projectId: string,
): TerminalClient[] {
  const result: TerminalClient[] = [];
  for (const [key, clients] of terminalClients) {
    if (
      key === `kanban:${projectId}` ||
      key.startsWith(`ticket:${projectId}:`)
    ) {
      result.push(...clients);
    }
  }
  return result;
}
