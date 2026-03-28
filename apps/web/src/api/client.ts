import type {
  Project, CreateProjectInput, UpdateProjectInput,
  Ticket, CreateTicketInput, UpdateTicketInput,
  BoardView, Settings, SettingsResponse, UpdateSettingsInput,
  KanbanCCInfo, TicketCCInfo,
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
    localStorage.removeItem("token");
    window.location.href = `${import.meta.env.BASE_URL}login`;
    throw new Error("Unauthorized");
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
  startKanbanCC: (projectId: string) =>
    request<void>(`/projects/${projectId}/kanban-cc`, { method: "POST" }),
  getKanbanCC: (projectId: string) =>
    request<KanbanCCInfo>(`/projects/${projectId}/kanban-cc`),
  stopKanbanCC: (projectId: string) =>
    request<void>(`/projects/${projectId}/kanban-cc`, { method: "DELETE" }),
  sendKanbanCCMessage: (projectId: string, content: string) =>
    request<void>(`/projects/${projectId}/kanban-cc/messages`, { method: "POST", body: JSON.stringify({ content }) }),

  // Ticket CC
  startTicketCC: (projectId: string, number: number) =>
    request<void>(`/projects/${projectId}/tickets/${number}/cc`, { method: "POST" }),
  getTicketCC: (projectId: string, number: number) =>
    request<TicketCCInfo>(`/projects/${projectId}/tickets/${number}/cc`),
  stopTicketCC: (projectId: string, number: number) =>
    request<void>(`/projects/${projectId}/tickets/${number}/cc`, { method: "DELETE" }),
  sendTicketCCMessage: (projectId: string, number: number, content: string) =>
    request<void>(`/projects/${projectId}/tickets/${number}/cc/messages`, { method: "POST", body: JSON.stringify({ content }) }),

  // Settings
  getSettings: () => request<SettingsResponse>("/settings"),
  updateSettings: (data: UpdateSettingsInput) =>
    request<SettingsResponse>("/settings", { method: "PATCH", body: JSON.stringify(data) }),

  // Auth
  login: (username: string, password: string) =>
    request<{ token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
};
