import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { authMiddleware } from "./lib/auth.js";
import { auth } from "./routes/auth.js";
import { projects } from "./routes/projects.js";
import { tickets } from "./routes/tickets.js";
import { board } from "./routes/board.js";
import { kanbanCC } from "./routes/kanbanCC.js";
import { ticketCC } from "./routes/ticketCC.js";
import { settings } from "./routes/settings.js";
import { webhooks } from "./routes/webhooks.js";
import { wsRoutes, injectWebSocket } from "./routes/ws.js";
import { recoverOnStartup, shutdownAll } from "./services/cc/manager.js";
import { redis } from "./services/redis.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());
app.use("/api/*", authMiddleware);

// Health check (before auth)
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Auth
app.route("/api/auth", auth);

// REST routes
app.route("/api/projects", projects);
app.route("/api/settings", settings);
app.route("/api/webhooks", webhooks);

// Nested routes (project-scoped)
const projectScoped = new Hono();
projectScoped.route("/:projectId/tickets/:number/cc", ticketCC);
projectScoped.route("/:projectId/tickets", tickets);
projectScoped.route("/:projectId/board", board);
projectScoped.route("/:projectId/kanban-cc", kanbanCC);
app.route("/api/projects", projectScoped);

// WebSocket routes
app.route("/api/ws", wsRoutes);

const port = Number(process.env.PORT) || 7700;
const host = process.env.HOST || "0.0.0.0";

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`Server running on http://${host}:${info.port}`);

  // Recover CC processes after startup
  recoverOnStartup().catch((err) => {
    console.error("Failed to recover CC processes:", err);
  });
});

// Inject WebSocket support into the HTTP server
injectWebSocket(server);

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  shutdownAll();
  redis.disconnect();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
