import jwt from "jsonwebtoken";
import type { Context, Next } from "hono";

const JWT_SECRET = process.env.JWT_SECRET || "claudehub-dev-secret";
const TOKEN_EXPIRY = "7d";

// V1: hardcoded admin/admin
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin";

export function generateToken(username: string): string {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { username: string };
  } catch {
    return null;
  }
}

export function validateCredentials(
  username: string,
  password: string,
): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export async function authMiddleware(c: Context, next: Next) {
  // Skip auth for login, health, and webhooks (webhooks use their own signature verification)
  const path = c.req.path;
  if (
    path === "/api/auth/login" ||
    path === "/api/health" ||
    path === "/api/webhooks/github"
  ) {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : // WebSocket token from query
      (c.req.query("token") ?? null);

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = verifyToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("username", payload.username);
  return next();
}
