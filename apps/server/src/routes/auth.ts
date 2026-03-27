import { Hono } from "hono";
import { generateToken, validateCredentials } from "../lib/auth.js";

export const auth = new Hono();

// POST /api/auth/login
auth.post("/login", async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();

  if (!body.username || !body.password) {
    return c.json({ error: "Username and password required" }, 400);
  }

  if (!validateCredentials(body.username, body.password)) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = generateToken(body.username);
  return c.json({ token });
});
