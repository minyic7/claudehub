import { Hono } from "hono";
import * as db from "../services/redis.js";
import * as ccManager from "../services/cc/manager.js";
import { buildKanbanSystemPrompt } from "../services/cc/kanbanCC.js";
import * as git from "../services/git/worktree.js";
import { getPTY } from "../lib/pty.js";

export const kanbanCC = new Hono();

// POST /api/projects/:projectId/kanban-cc
kanbanCC.post("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  if (ccManager.isKanbanCCRunning(projectId)) {
    return c.json({ error: "Kanban CC already running" }, 409);
  }

  // Ensure kanban worktree exists
  let worktreePath: string;
  try {
    worktreePath = await git.addKanbanWorktree(
      project.owner, project.repo, project.baseBranch,
    );
  } catch (err) {
    return c.json(
      { error: `Failed to prepare worktree: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }

  const apiBaseUrl = `http://localhost:${process.env.PORT || 7700}`;
  const systemPrompt = buildKanbanSystemPrompt(projectId, project.name, apiBaseUrl);

  const settings = await db.getSettings();
  const env: Record<string, string> = {};
  if (settings.anthropicApiKey) env.ANTHROPIC_API_KEY = settings.anthropicApiKey;

  try {
    const { pid } = await ccManager.startKanbanCC(projectId, worktreePath, systemPrompt, env);
    return c.json({ status: "running", pid }, 201);
  } catch (err) {
    return c.json(
      { error: `Failed to start: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }
});

// GET /api/projects/:projectId/kanban-cc
kanbanCC.get("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const data = await db.getKanbanCCStatus(projectId);
  const running = ccManager.isKanbanCCRunning(projectId);
  const pty = getPTY(`kanban:${projectId}`);
  const uptime = pty ? Math.floor((Date.now() - pty.startedAt.getTime()) / 1000) : undefined;

  return c.json({
    status: running ? "running" : (data.status || "stopped"),
    pid: data.pid ? Number(data.pid) : undefined,
    uptime,
    lastActiveAt: data.lastActiveAt,
  });
});

// DELETE /api/projects/:projectId/kanban-cc
kanbanCC.delete("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  await ccManager.stopKanbanCC(projectId);
  return c.json({ status: "stopped" });
});

// POST /api/projects/:projectId/kanban-cc/messages
kanbanCC.post("/messages", async (c) => {
  const projectId = c.req.param("projectId")!;
  const { content } = await c.req.json<{ content: string }>();

  if (!content) return c.json({ error: "content required" }, 400);

  if (!ccManager.isKanbanCCRunning(projectId)) {
    return c.json({ error: "Kanban CC not running" }, 400);
  }

  const sent = ccManager.sendToKanbanCC(projectId, content);
  if (!sent) return c.json({ error: "Failed to send message" }, 500);

  return c.json({ sent: true });
});
