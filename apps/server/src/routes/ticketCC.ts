import { Hono } from "hono";
import * as db from "../services/redis.js";
import * as ccManager from "../services/cc/manager.js";
import { buildTicketSystemPrompt } from "../services/cc/ticketCC.js";
import { getPTY } from "../lib/pty.js";

export const ticketCC = new Hono();

// POST /api/projects/:projectId/tickets/:number/cc
ticketCC.post("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);

  const ticket = await db.getTicket(projectId, number);
  if (!ticket) return c.json({ error: "Ticket not found" }, 404);

  if (ticket.status !== "in_progress") {
    return c.json({ error: "Ticket must be in_progress to start CC" }, 400);
  }

  if (ccManager.isTicketCCRunning(projectId, number)) {
    return c.json({ error: "Ticket CC already running" }, 409);
  }

  const project = await db.getProject(projectId);
  const apiBaseUrl = `http://localhost:${process.env.PORT || 7700}`;
  const systemPrompt = buildTicketSystemPrompt(
    projectId, number, ticket.title, ticket.description, ticket.taskBrief,
    apiBaseUrl, project?.baseBranch,
  );

  // Accept apiKey from body (frontend localStorage) and persist to Redis
  const body = await c.req.json().catch(() => ({}));
  if (body.apiKey) {
    await db.updateSettings({ anthropicApiKey: body.apiKey });
  }

  const settings = await db.getSettings();
  const env: Record<string, string> = {};
  const apiKey = body.apiKey || settings.anthropicApiKey;
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;

  try {
    const { pid, queued } = await ccManager.startTicketCC(projectId, ticket, systemPrompt, env);
    return c.json({ ccStatus: queued ? "queued" : "running", pid }, 201);
  } catch (err) {
    return c.json(
      { error: `Failed to start: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }
});

// GET /api/projects/:projectId/tickets/:number/cc
ticketCC.get("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);

  const data = await db.getTicketCCStatus(projectId, number);
  const running = ccManager.isTicketCCRunning(projectId, number);
  const pty = getPTY(`ticket:${projectId}:${number}`);
  const uptime = pty ? Math.floor((Date.now() - pty.startedAt.getTime()) / 1000) : undefined;

  return c.json({
    ccStatus: running ? "running" : (data.ccStatus || "idle"),
    pid: data.pid ? Number(data.pid) : undefined,
    uptime,
    lastActiveAt: data.lastActiveAt,
  });
});

// DELETE /api/projects/:projectId/tickets/:number/cc
ticketCC.delete("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);

  await ccManager.stopTicketCC(projectId, number);
  return c.json({ ccStatus: "idle" });
});

// POST /api/projects/:projectId/tickets/:number/cc/messages
ticketCC.post("/messages", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);
  const { content } = await c.req.json<{ content: string }>();

  if (!content) return c.json({ error: "content required" }, 400);

  if (!ccManager.isTicketCCRunning(projectId, number)) {
    return c.json({ error: "Ticket CC not running" }, 400);
  }

  const sent = ccManager.sendToTicketCC(projectId, number, content);
  if (!sent) return c.json({ error: "Failed to send message" }, 500);

  return c.json({ sent: true });
});
