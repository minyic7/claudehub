import { Hono } from "hono";
import * as ccManager from "../services/cc/manager.js";

export const claudeLogin = new Hono();

// POST /api/claude-login — Start a bare claude PTY for OAuth login
claudeLogin.post("/", (c) => {
  if (ccManager.isLoginPTYRunning()) {
    return c.json({ error: "Login session already running" }, 409);
  }

  try {
    const { pid } = ccManager.startLoginPTY();
    return c.json({ status: "running", pid }, 201);
  } catch (err) {
    return c.json(
      { error: `Failed to start: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }
});

// GET /api/claude-login — Check status
claudeLogin.get("/", (c) => {
  return c.json({ running: ccManager.isLoginPTYRunning() });
});

// DELETE /api/claude-login — Stop login PTY
claudeLogin.delete("/", (c) => {
  ccManager.stopLoginPTY();
  return c.json({ status: "stopped" });
});
