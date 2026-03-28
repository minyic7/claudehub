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
