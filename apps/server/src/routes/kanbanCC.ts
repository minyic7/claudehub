import { Hono } from "hono";
import * as db from "../services/redis.js";
import * as ccManager from "../services/cc/manager.js";
import { buildKanbanSystemPrompt } from "../services/cc/kanbanCC.js";
import { startPilot, stopPilot, getPilotStatus } from "../services/cc/pilot.js";
import * as git from "../services/git/worktree.js";
import { getPTY } from "../lib/pty.js";

export const kanbanCC = new Hono<{ Variables: { username: string } }>();

/** Get the kanban worktree path for a project (without creating it) */
function kanbanWorktreePath(owner: string, repo: string): string {
  const reposDir = process.env.REPOS_DIR || "/repos";
  return `${reposDir}/${owner}/${repo}.git/worktrees-data/kanban`;
}

// POST /api/projects/:projectId/kanban-cc
kanbanCC.post("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const username = c.get("username") as string;
  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  if (ccManager.isKanbanCCRunning(projectId)) {
    return c.json({ error: "Kanban CC already running" }, 409);
  }

  // Accept apiKey and sessionId from body
  const body = await c.req.json().catch(() => ({}));
  if (body.apiKey) {
    await db.updateSettings({ anthropicApiKey: body.apiKey });
  }

  // Non-admin users must provide an API key
  const settings = await db.getSettings();
  const apiKey = body.apiKey || settings.anthropicApiKey;
  if (username !== "admin" && !apiKey) {
    return c.json({ error: "API key required for non-admin users" }, 403);
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
  const systemPrompt = buildKanbanSystemPrompt(projectId, project.name, apiBaseUrl, project.owner, project.repo);

  // Admin uses mounted credential; non-admin uses API key
  const env: Record<string, string> = {};
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;

  try {
    const { pid } = await ccManager.startKanbanCC(
      projectId, worktreePath, systemPrompt, env,
      body.sessionId ? { sessionId: body.sessionId } : undefined,
    );
    return c.json({ status: "running", pid }, 201);
  } catch (err) {
    return c.json(
      { error: `Failed to start: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }
});

// GET /api/projects/:projectId/kanban-cc/sessions
kanbanCC.get("/sessions", async (c) => {
  const projectId = c.req.param("projectId")!;
  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const sessions = ccManager.listSessions(kanbanWorktreePath(project.owner, project.repo));
  return c.json({ sessions });
});

// DELETE /api/projects/:projectId/kanban-cc/sessions/:sessionId
kanbanCC.delete("/sessions/:sessionId", async (c) => {
  const projectId = c.req.param("projectId")!;
  const sessionId = c.req.param("sessionId")!;
  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const deleted = ccManager.deleteSession(
    kanbanWorktreePath(project.owner, project.repo), sessionId,
  );
  return deleted
    ? c.json({ deleted: true })
    : c.json({ error: "Session not found" }, 404);
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

// POST /api/projects/:projectId/kanban-cc/pilot
kanbanCC.post("/pilot", async (c) => {
  const projectId = c.req.param("projectId")!;
  const body = await c.req.json<{ goal: string; idleTimeout?: number }>();

  if (!body.goal) return c.json({ error: "goal required" }, 400);
  if (!ccManager.isKanbanCCRunning(projectId)) {
    return c.json({ error: "Kanban CC not running" }, 400);
  }

  startPilot(projectId, body.goal, body.idleTimeout ?? 5);

  return c.json({ active: true }, 201);
});

// DELETE /api/projects/:projectId/kanban-cc/pilot
kanbanCC.delete("/pilot", async (c) => {
  const projectId = c.req.param("projectId")!;
  stopPilot(projectId);
  return c.json({ active: false });
});

// GET /api/projects/:projectId/kanban-cc/pilot
kanbanCC.get("/pilot", async (c) => {
  const projectId = c.req.param("projectId")!;
  return c.json(getPilotStatus(projectId));
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
