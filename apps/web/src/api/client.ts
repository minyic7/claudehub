import type {
  Project, CreateProjectInput, UpdateProjectInput,
  Ticket, CreateTicketInput, UpdateTicketInput,
  BoardView, Settings, SettingsResponse, UpdateSettingsInput,
  KanbanCCInfo, TicketCCInfo, CCSession,
} from "@claudehub/shared";

const BASE = import.meta.env.VITE_API_BASE || "/claudehub/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    // Only redirect if not already on login page (prevent redirect loops during in-flight requests)
    const onLoginPage = window.location.pathname.endsWith("/login");
    localStorage.removeItem("token");
    if (!onLoginPage) {
      window.location.href = `${import.meta.env.BASE_URL}login`;
    }
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export const api = {
  // Projects
  getProjects: () => request<Project[]>("/projects"),
  createProject: (data: CreateProjectInput) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  updateProject: (id: string, data: UpdateProjectInput) =>
    request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<void>(`/projects/${id}`, { method: "DELETE" }),
  syncProject: (id: string) =>
    request<void>(`/projects/${id}/sync`, { method: "POST" }),

  // Board
  getBoard: (projectId: string) =>
    request<BoardView>(`/projects/${projectId}/board`),

  // Tickets
  getTickets: (projectId: string) =>
    request<Ticket[]>(`/projects/${projectId}/tickets`),
  createTicket: (projectId: string, data: CreateTicketInput) =>
    request<Ticket>(`/projects/${projectId}/tickets`, { method: "POST", body: JSON.stringify(data) }),
  updateTicket: (projectId: string, number: number, data: UpdateTicketInput) =>
    request<Ticket>(`/projects/${projectId}/tickets/${number}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTicket: (projectId: string, number: number, cascade?: boolean) =>
    request<void>(`/projects/${projectId}/tickets/${number}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" }),
  mergeTicket: (projectId: string, number: number) =>
    request<void>(`/projects/${projectId}/tickets/${number}/merge`, { method: "POST" }),
  cancelMerge: (projectId: string, number: number) =>
    request<void>(`/projects/${projectId}/tickets/${number}/merge`, { method: "DELETE" }),

  // Kanban CC
  startKanbanCC: (projectId: string, opts?: { apiKey?: string | null; sessionId?: string }) =>
    request<void>(`/projects/${projectId}/kanban-cc`, {
      method: "POST",
      body: JSON.stringify({
        ...(opts?.apiKey ? { apiKey: opts.apiKey } : {}),
        ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
      }),
    }),
  getKanbanCC: (projectId: string) =>
    request<KanbanCCInfo>(`/projects/${projectId}/kanban-cc`),
  stopKanbanCC: (projectId: string) =>
    request<void>(`/projects/${projectId}/kanban-cc`, { method: "DELETE" }),
  sendKanbanCCMessage: (projectId: string, content: string) =>
    request<void>(`/projects/${projectId}/kanban-cc/messages`, { method: "POST", body: JSON.stringify({ content }) }),
  getKanbanCCSessions: (projectId: string) =>
    request<{ sessions: CCSession[] }>(`/projects/${projectId}/kanban-cc/sessions`),
  deleteKanbanCCSession: (projectId: string, sessionId: string) =>
    request<void>(`/projects/${projectId}/kanban-cc/sessions/${sessionId}`, { method: "DELETE" }),

  // Pilot Mode
  startPilot: (projectId: string, goal: string, idleTimeout?: number) =>
    request<{ active: boolean }>(`/projects/${projectId}/kanban-cc/pilot`, {
      method: "POST",
      body: JSON.stringify({ goal, idleTimeout }),
    }),
  stopPilot: (projectId: string) =>
    request<{ active: boolean }>(`/projects/${projectId}/kanban-cc/pilot`, { method: "DELETE" }),
  getPilotStatus: (projectId: string) =>
    request<{ active: boolean; goal?: string; idleTimeout?: number }>(`/projects/${projectId}/kanban-cc/pilot`),

  // Ticket CC
  startTicketCC: (projectId: string, number: number, opts?: { apiKey?: string | null; sessionId?: string }) =>
    request<void>(`/projects/${projectId}/tickets/${number}/cc`, {
      method: "POST",
      body: JSON.stringify({
        ...(opts?.apiKey ? { apiKey: opts.apiKey } : {}),
        ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
      }),
    }),
  getTicketCC: (projectId: string, number: number) =>
    request<TicketCCInfo>(`/projects/${projectId}/tickets/${number}/cc`),
  stopTicketCC: (projectId: string, number: number) =>
    request<void>(`/projects/${projectId}/tickets/${number}/cc`, { method: "DELETE" }),
  sendTicketCCMessage: (projectId: string, number: number, content: string) =>
    request<void>(`/projects/${projectId}/tickets/${number}/cc/messages`, { method: "POST", body: JSON.stringify({ content }) }),
  getTicketCCSessions: (projectId: string, number: number) =>
    request<{ sessions: CCSession[] }>(`/projects/${projectId}/tickets/${number}/cc/sessions`),
  deleteTicketCCSession: (projectId: string, number: number, sessionId: string) =>
    request<void>(`/projects/${projectId}/tickets/${number}/cc/sessions/${sessionId}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request<SettingsResponse>("/settings"),
  updateSettings: (data: UpdateSettingsInput) =>
    request<SettingsResponse>("/settings", { method: "PATCH", body: JSON.stringify(data) }),

  // Auth
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
};
