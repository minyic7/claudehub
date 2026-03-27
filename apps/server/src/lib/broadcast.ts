import type { WebSocket } from "ws";
import type { WSEvent, WSEventType } from "@claudehub/shared";

interface EventClient {
  ws: WebSocket;
  projectId?: string; // If set, only receive events for this project
}

const eventClients = new Set<EventClient>();

export function addEventClient(ws: WebSocket, projectId?: string): void {
  eventClients.add({ ws, projectId });
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

  for (const client of eventClients) {
    if (!client.projectId || client.projectId === projectId) {
      try {
        client.ws.send(message);
      } catch {
        eventClients.delete(client);
      }
    }
  }
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
    }
  }
}

export function isOperator(projectId: string, connectionId: string): boolean {
  return operatorLocks.get(projectId) === connectionId;
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
