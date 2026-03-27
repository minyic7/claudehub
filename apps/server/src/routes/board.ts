import { Hono } from "hono";
import type { BoardView, BoardColumn, BoardStats, TicketStatus } from "@claudehub/shared";
import { TICKET_COLUMNS } from "@claudehub/shared";
import * as db from "../services/redis.js";
import * as ccManager from "../services/cc/manager.js";
import { buildKanbanSystemPrompt } from "../services/cc/kanbanCC.js";
import * as git from "../services/git/worktree.js";

export const board = new Hono();

// GET /api/projects/:projectId/board
board.get("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  // Auto-start Kanban CC if not running
  if (!ccManager.isKanbanCCRunning(projectId)) {
    try {
      const worktreePath = await git.addKanbanWorktree(
        project.owner, project.repo, project.baseBranch,
      );
      const apiBaseUrl = `http://localhost:${process.env.PORT || 7700}`;
      const systemPrompt = buildKanbanSystemPrompt(projectId, project.name, apiBaseUrl);
      const settings = await db.getSettings();
      const env: Record<string, string> = {};
      if (settings.anthropicApiKey) env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
      await ccManager.startKanbanCC(projectId, worktreePath, systemPrompt, env);
    } catch (err) {
      console.warn(`Failed to auto-start Kanban CC for ${projectId}:`, err);
    }
  }

  const tickets = await db.getProjectTickets(projectId);

  const columns: BoardColumn[] = TICKET_COLUMNS.map((col) => ({
    status: col.status,
    label: col.label,
    tickets: tickets
      .filter((t) => t.status === col.status)
      .sort((a, b) => a.priority - b.priority),
  }));

  const byStatus = {} as Record<TicketStatus, number>;
  for (const col of TICKET_COLUMNS) {
    byStatus[col.status] = tickets.filter((t) => t.status === col.status).length;
  }

  const stats: BoardStats = {
    total: tickets.length,
    byStatus,
    runningCC: tickets.filter((t) => t.ccStatus === "running").length,
    queuedCC: tickets.filter((t) => t.ccStatus === "queued").length,
  };

  const kanbanStatus = ccManager.isKanbanCCRunning(projectId) ? "running" : "stopped";

  const { githubToken, ...safeProject } = project;
  const view: BoardView = {
    project: safeProject,
    kanbanCCStatus: kanbanStatus,
    columns,
    stats,
  };

  return c.json(view);
});
