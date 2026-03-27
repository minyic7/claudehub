import { Hono } from "hono";
import type { CreateProjectInput, UpdateProjectInput } from "@claudehub/shared";
import * as db from "../services/redis.js";
import * as git from "../services/git/worktree.js";
import * as github from "../services/git/github.js";

export const projects = new Hono();

// GET /api/projects
projects.get("/", async (c) => {
  const all = await db.getAllProjects();
  // Strip tokens from list response
  const safe = all.map(({ githubToken, ...rest }) => rest);
  return c.json(safe);
});

// POST /api/projects
projects.post("/", async (c) => {
  const body = await c.req.json<CreateProjectInput>();

  if (!body.githubUrl || !body.githubToken || !body.baseBranch) {
    return c.json({ error: "githubUrl, githubToken, and baseBranch are required" }, 400);
  }

  // Parse owner/repo from URL
  const match = body.githubUrl.match(
    /github\.com\/([^/]+)\/([^/.]+)/,
  );
  if (!match) {
    return c.json({ error: "Invalid GitHub URL" }, 400);
  }
  const [, owner, repo] = match;

  // Check if repo already registered
  const existing = await db.getProjectByRepo(owner, repo);
  if (existing) {
    return c.json({ error: "Repository already registered as a project" }, 409);
  }

  // Validate token
  const validation = await github.validateToken(body.githubToken, owner, repo);
  if (!validation.valid) {
    return c.json({ error: `Token validation failed: ${validation.error}` }, 400);
  }

  const id = await db.getNextProjectId();
  const webhookSecret = github.generateWebhookSecret();

  // Clone bare repo
  try {
    await git.cloneBare(owner, repo, body.githubToken);
  } catch (err) {
    return c.json(
      { error: `Failed to clone repo: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }

  // Register webhook
  const webhookUrl = `${process.env.WEBHOOK_BASE_URL || "https://minyis-mac-mini.tail564b26.ts.net/claudehub"}/api/webhooks/github`;
  let webhookId: string | undefined;
  try {
    webhookId = await github.registerWebhook(
      body.githubToken,
      owner,
      repo,
      webhookUrl,
      webhookSecret,
    );
  } catch (err) {
    console.warn("Failed to register webhook:", err);
    // Continue without webhook — can retry later
  }

  // Create kanban worktree
  try {
    await git.addKanbanWorktree(owner, repo, body.baseBranch);
  } catch (err) {
    console.warn("Failed to create kanban worktree:", err);
  }

  const project = {
    id,
    name: body.name || repo,
    githubUrl: body.githubUrl,
    owner,
    repo,
    githubToken: body.githubToken,
    baseBranch: body.baseBranch,
    webhookId,
    webhookSecret,
    createdAt: new Date().toISOString(),
  };

  await db.saveProject(project);

  // Return without token
  const { githubToken, ...safe } = project;
  return c.json(safe, 201);
});

// GET /api/projects/:id
projects.get("/:id", async (c) => {
  const project = await db.getProject(c.req.param("id")!);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }
  const { githubToken, ...safe } = project;
  return c.json(safe);
});

// PATCH /api/projects/:id
projects.patch("/:id", async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json<UpdateProjectInput>();

  if (!(await db.acquireProjectLock(id))) {
    return c.json({ error: "Project is being modified by another operation" }, 409);
  }

  try {
    const project = await db.getProject(id);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const updates: Partial<typeof project> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.githubToken !== undefined) {
      // Validate new token
      const validation = await github.validateToken(
        body.githubToken,
        project.owner,
        project.repo,
      );
      if (!validation.valid) {
        return c.json({ error: `Token validation failed: ${validation.error}` }, 400);
      }
      updates.githubToken = body.githubToken;
    }

    const updated = await db.updateProject(id, updates);
    if (!updated) {
      return c.json({ error: "Update failed" }, 500);
    }
    const { githubToken, ...safe } = updated;
    return c.json(safe);
  } finally {
    await db.releaseProjectLock(id);
  }
});

// DELETE /api/projects/:id
projects.delete("/:id", async (c) => {
  const id = c.req.param("id")!;
  const project = await db.getProject(id);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  // Check for active merge
  if (await db.hasMergeLock(id)) {
    return c.json({ error: "Cannot delete project with active merge" }, 409);
  }

  if (!(await db.acquireProjectLock(id, 120))) {
    return c.json({ error: "Project is being modified by another operation" }, 409);
  }

  // Stop all CCs (imported lazily to avoid circular deps)
  const { stopKanbanCC, stopTicketCC } = await import("../services/cc/manager.js");
  await stopKanbanCC(id);

  const tickets = await db.getProjectTickets(id);
  for (const ticket of tickets) {
    await stopTicketCC(id, ticket.number);

    // Clean up GitHub resources
    try {
      if (ticket.githubPrNumber) {
        await github.closePullRequest(
          project.githubToken, project.owner, project.repo, ticket.githubPrNumber,
        );
      }
      await github.closeIssue(
        project.githubToken, project.owner, project.repo, ticket.githubIssueNumber,
      );
      await github.deleteBranch(
        project.githubToken, project.owner, project.repo, ticket.branchName,
      );
    } catch (err) {
      console.warn(`Failed to clean up GitHub resources for ticket #${ticket.number}:`, err);
    }

    // Remove worktree
    try {
      await git.removeWorktree(project.owner, project.repo, ticket.branchName);
    } catch {
      // ignore
    }
  }

  // Delete webhook
  if (project.webhookId) {
    try {
      await github.deleteWebhook(
        project.githubToken, project.owner, project.repo, project.webhookId,
      );
    } catch {
      // ignore
    }
  }

  // Remove bare repo
  try {
    await git.removeBareRepo(project.owner, project.repo);
  } catch {
    // ignore
  }

  await db.deleteProject(id);
  // Lock auto-expires, but release explicitly for cleanliness
  await db.releaseProjectLock(id);
  return c.json({ deleted: true });
});

// POST /api/projects/:id/sync
projects.post("/:id/sync", async (c) => {
  const project = await db.getProject(c.req.param("id")!);
  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  try {
    await git.gitFetch(project.owner, project.repo, project.githubToken);
    return c.json({ synced: true });
  } catch (err) {
    return c.json(
      { error: `Sync failed: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }
});
