export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// Anthropic API key — stored in localStorage, sent to server on CC start
const API_KEY_STORAGE = "claudehub:apiKey";
export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}
export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}
export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

// Check if current user is admin by decoding JWT payload
export function isAdmin(): boolean {
  const token = localStorage.getItem("token");
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.username === "admin";
  } catch {
    return false;
  }
}

// Generate a stable connection ID per browser tab for operator lock
const CONNECTION_ID_KEY = "claudehub:connectionId";
export function getConnectionId(): string {
  let id = sessionStorage.getItem(CONNECTION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(CONNECTION_ID_KEY, id);
  }
  return id;
}
