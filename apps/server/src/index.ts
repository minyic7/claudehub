import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { projects } from "./routes/projects.js";
import { tickets } from "./routes/tickets.js";
import { webhooks } from "./routes/webhooks.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Routes
app.route("/api/projects", projects);
app.route("/api/tickets", tickets);
app.route("/api/webhooks", webhooks);

// TODO: WebSocket upgrade route

const port = Number(process.env.PORT) || 7700;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
