import { useAuthStore } from "../stores/authStore.js";

export function buildWsUrl(
  path: string,
  params?: Record<string, string>,
): string {
  const base = import.meta.env.VITE_API_BASE || "/claudehub/api";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const token = useAuthStore.getState().token || "";
  const query = new URLSearchParams({
    ...params,
    token,
  }).toString();
  return `${protocol}//${host}${base}${path}?${query}`;
}
