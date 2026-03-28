import { Hono } from "hono";
import type {
  CreateTicketInput,
  UpdateTicketInput,
  Ticket,
  TicketStatus,
} from "@claudehub/shared";
import { MAX_TITLE_LENGTH, TITLE_PATTERN, TICKET_TYPES } from "@claudehub/shared";
import * as db from "../services/redis.js";
import * as git from "../services/git/worktree.js";
import * as github from "../services/git/github.js";
import { broadcastEvent } from "../lib/broadcast.js";

export const tickets = new Hono();

// ── Helpers ──

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

function branchName(type: string, number: number, title: string): string {
  return `${type}/ticket-${number}-${slugify(title)}`;
}

async function checkDependenciesMerged(
  projectId: string,
  deps: number[],
): Promise<{ ok: boolean; blocking: number[] }> {
  const blocking: number[] = [];
  for (const dep of deps) {
    const t = await db.getTicket(projectId, dep);
    if (!t || t.status !== "merged") {
      blocking.push(dep);
    }
  }
  return { ok: blocking.length === 0, blocking };
}

async function detectCycle(
  projectId: string,
  number: number,
  deps: number[],
): Promise<boolean> {
  const visited = new Set<number>();
  const stack = [...deps];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === number) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const t = await db.getTicket(projectId, current);
    if (t) {
      stack.push(...t.dependencies);
    }
  }
  return false;
}

// GET /api/projects/:projectId/tickets
tickets.get("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const status = c.req.query("status") as TicketStatus | undefined;
  const priorityRaw = c.req.query("priority");
  const priority = priorityRaw !== undefined ? Number(priorityRaw) : undefined;
  const tickets = await db.getProjectTickets(projectId, { status, priority });
  return c.json(tickets);
});

// POST /api/projects/:projectId/tickets
tickets.post("/", async (c) => {
  const projectId = c.req.param("projectId")!;
  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const body = await c.req.json<CreateTicketInput>();

  // Validate title
  if (!body.title || body.title.length > MAX_TITLE_LENGTH) {
    return c.json({ error: `Title required, max ${MAX_TITLE_LENGTH} chars` }, 400);
  }
  if (!TITLE_PATTERN.test(body.title)) {
    return c.json({ error: "Title can only contain letters, numbers, spaces, and hyphens" }, 400);
  }

  // Validate type
  if (!TICKET_TYPES.includes(body.type as (typeof TICKET_TYPES)[number])) {
    return c.json({ error: `Invalid type. Must be one of: ${TICKET_TYPES.join(", ")}` }, 400);
  }

  if (!body.description) {
    return c.json({ error: "Description required" }, 400);
  }

  // Validate dependencies exist and check for duplicates
  if (body.dependencies?.length) {
    const seen = new Set<number>();
    for (const dep of body.dependencies) {
      if (seen.has(dep)) {
        return c.json({ error: `Duplicate dependency #${dep}` }, 400);
      }
      seen.add(dep);
      const t = await db.getTicket(projectId, dep);
      if (!t) return c.json({ error: `Dependency #${dep} not found` }, 400);
    }
  }

  // Calculate priority
  let priority = body.priority;
  if (priority === undefined) {
    const existing = await db.getProjectTickets(projectId);
    const maxPriority = existing
      .filter((t) => t.priority > 0)
      .reduce((max, t) => Math.max(max, t.priority), 0);
    priority = maxPriority + 1;
  }
  if (priority === 0) {
    return c.json({ error: "Priority 0 is reserved for system use" }, 400);
  }

  // Check priority uniqueness
  const existing = await db.getProjectTickets(projectId);
  if (existing.some((t) => t.priority === priority && t.status !== "merged")) {
    return c.json({ error: `Priority ${priority} already in use` }, 409);
  }

  const number = await db.getNextTicketNumber(projectId);
  const branch = branchName(body.type, number, body.title);

  // Git: fetch + worktree add
  try {
    await git.gitFetch(project.owner, project.repo, project.githubToken);
    await git.addWorktree(project.owner, project.repo, branch, project.baseBranch);
    await git.pushBranch(project.owner, project.repo, branch, project.githubToken);
  } catch (err) {
    return c.json(
      { error: `Git setup failed: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }

  // Create GitHub Issue
  let issueNumber: number;
  try {
    issueNumber = await github.createIssue(
      project.githubToken,
      project.owner,
      project.repo,
      body.title,
      body.description,
      ["todo"],
    );
  } catch (err) {
    // Clean up worktree on failure
    await git.removeWorktree(project.owner, project.repo, branch);
    return c.json(
      { error: `GitHub Issue creation failed: ${err instanceof Error ? err.message : err}` },
      500,
    );
  }

  const reposDir = process.env.REPOS_DIR || "/repos";
  const ticket: Ticket = {
    id: `${projectId}:${number}`,
    projectId,
    number,
    title: body.title,
    description: body.description,
    type: body.type,
    status: "todo",
    ccStatus: "idle",
    priority,
    branchName: branch,
    worktreePath: `${reposDir}/${project.owner}/${project.repo}.git/worktrees-data/${branch.replace(/\//g, "-")}`,
    dependencies: body.dependencies || [],
    githubIssueNumber: issueNumber,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.saveTicket(ticket);
  broadcastEvent("ticket:created", projectId, { ticket });

  return c.json(ticket, 201);
});

// GET /api/projects/:projectId/tickets/:number
tickets.get("/:number", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);
  const ticket = await db.getTicket(projectId, number);
  if (!ticket) return c.json({ error: "Ticket not found" }, 404);
  return c.json(ticket);
});

// PATCH /api/projects/:projectId/tickets/:number
tickets.patch("/:number", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);
  const body = await c.req.json<UpdateTicketInput>();

  const ticket = await db.getTicket(projectId, number);
  if (!ticket) return c.json({ error: "Ticket not found" }, 404);

  if (ticket.status === "merged") {
    return c.json({ error: "Cannot modify merged ticket" }, 400);
  }

  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  const updates: Partial<Ticket> = {};

  // Description sync
  if (body.description !== undefined) {
    updates.description = body.description;
    // Sync to GitHub Issue
    try {
      await github.updateIssue(
        project.githubToken, project.owner, project.repo,
        ticket.githubIssueNumber, { body: body.description },
      );
    } catch (err) {
      console.warn("Failed to sync description to GitHub:", err);
    }
  }

  // Priority
  if (body.priority !== undefined) {
    if (body.priority === 0) {
      return c.json({ error: "Priority 0 is reserved for system use" }, 400);
    }
    const all = await db.getProjectTickets(projectId);
    const nonMerged = all.filter((t) => t.status !== "merged" && t.number !== number);

    // Shift other tickets to make room for the new priority
    const conflicting = nonMerged.filter((t) => t.priority >= body.priority!);
    if (conflicting.length > 0) {
      // Sort ascending so we shift from the target position outward
      conflicting.sort((a, b) => a.priority - b.priority);
      let nextPriority = body.priority!;
      for (const t of conflicting) {
        if (t.priority === nextPriority) {
          await db.updateTicket(projectId, t.number, { priority: t.priority + 1 });
          broadcastEvent("ticket:updated", projectId, { number: t.number, changes: { priority: t.priority + 1 } });
          nextPriority = t.priority + 1;
        } else {
          break; // No more conflicts
        }
      }
    }
    updates.priority = body.priority;

    // Notify Kanban CC of priority change
    const { sendToKanbanCC, isKanbanCCRunning } = await import("../services/cc/manager.js");
    if (isKanbanCCRunning(projectId)) {
      sendToKanbanCC(
        projectId,
        `[SYSTEM] Ticket #${number} priority changed to ${body.priority}.`,
      );
    }
  }

  // Dependencies
  if (body.dependencies !== undefined) {
    if (body.dependencies.includes(number)) {
      return c.json({ error: "Ticket cannot depend on itself" }, 400);
    }
    for (const dep of body.dependencies) {
      const t = await db.getTicket(projectId, dep);
      if (!t) return c.json({ error: `Dependency #${dep} not found` }, 400);
    }
    if (await detectCycle(projectId, number, body.dependencies)) {
      return c.json({ error: "Circular dependency detected" }, 400);
    }
    updates.dependencies = body.dependencies;
  }

  // Task brief
  if (body.taskBrief !== undefined) {
    updates.taskBrief = body.taskBrief;
  }

  // Status transition
  if (body.status !== undefined && body.status !== ticket.status) {
    if (body.status === "merged") {
      return c.json({ error: "Use POST /merge to merge tickets" }, 400);
    }

    const from = ticket.status;
    const to = body.status;

    // Validate transitions
    const validTransitions: Record<TicketStatus, TicketStatus[]> = {
      todo: ["in_progress"],
      in_progress: ["todo", "reviewing"],
      reviewing: ["in_progress", "todo"],
      merged: [],
    };

    if (!validTransitions[from].includes(to)) {
      return c.json({ error: `Invalid transition: ${from} → ${to}` }, 400);
    }

    // Transition-specific logic
    if (to === "in_progress") {
      // Check dependencies
      const deps = body.dependencies ?? ticket.dependencies;
      if (deps.length > 0) {
        const { ok, blocking } = await checkDependenciesMerged(projectId, deps);
        if (!ok) {
          return c.json({
            error: `Blocking dependencies not merged: ${blocking.map((n) => `#${n}`).join(", ")}`,
          }, 400);
        }
      }

      updates.status = "in_progress";
      updates.returnReason = undefined;

      // Auto-start CC
      const { startTicketCC } = await import("../services/cc/manager.js");
      const { buildTicketSystemPrompt } = await import("../services/cc/ticketCC.js");
      const apiBaseUrl = `http://localhost:${process.env.PORT || 7700}`;
      const systemPrompt = buildTicketSystemPrompt(
        projectId,
        number,
        ticket.title,
        body.description ?? ticket.description,
        body.taskBrief ?? ticket.taskBrief,
        apiBaseUrl,
        project.baseBranch,
      );
      const settings = await db.getSettings();
      const env: Record<string, string> = {};
      if (settings.anthropicApiKey) env.ANTHROPIC_API_KEY = settings.anthropicApiKey;

      const updatedTicket = { ...ticket, ...updates };
      try {
        const result = await startTicketCC(projectId, updatedTicket, systemPrompt, env, { silent: true });
        updates.ccStatus = result.queued ? "queued" : "running";
      } catch (err) {
        console.warn("Failed to start Ticket CC:", err);
      }
    }

    if (to === "todo") {
      updates.status = "todo";
      updates.ccStatus = "idle";
      updates.returnReason = undefined;

      // Stop CC + release slot
      const { stopTicketCC, scheduleNext } = await import("../services/cc/manager.js");
      await stopTicketCC(projectId, number);

      // Discard changes + rebase to base
      try {
        await git.resetWorktreeToBase(
          project.owner, project.repo, ticket.branchName,
          project.baseBranch, project.githubToken,
        );
      } catch (err) {
        console.warn("Failed to reset worktree:", err);
      }

      // Schedule queued tickets into freed slot
      scheduleNext();
    }

    if (to === "reviewing") {
      // Check CI status before allowing reviewing
      try {
        const ci = await github.getCIStatus(
          project.githubToken, project.owner, project.repo, ticket.branchName,
        );
        if (!ci.passed) {
          return c.json({
            error: ci.pending
              ? "CI checks still running. Wait for CI to complete."
              : `CI checks failed: ${ci.details}`,
          }, 400);
        }
      } catch (err) {
        // If GitHub API is unreachable, block the transition (fail safe)
        // If the repo simply has no CI configured, getCIStatus returns passed=true
        console.warn("Failed to check CI status:", err);
        return c.json({
          error: "Unable to verify CI status. Please try again.",
        }, 503);
      }

      updates.status = "reviewing";
      updates.ccStatus = "completed";
      updates.returnReason = undefined;

      // Stop CC + release slot
      const { stopTicketCC } = await import("../services/cc/manager.js");
      await stopTicketCC(projectId, number);
    }

    if (from === "reviewing" && to === "in_progress") {
      // Rejected — mark reason
      updates.returnReason = "rejected";
    }

    // Update GitHub Issue label
    try {
      await github.setStatusLabel(
        project.githubToken, project.owner, project.repo,
        ticket.githubIssueNumber, to,
      );
    } catch (err) {
      console.warn("Failed to update GitHub label:", err);
    }

    updates.status = to;
    broadcastEvent("ticket:status_changed", projectId, {
      number,
      from,
      to,
      ccStatus: updates.ccStatus,
    });
  }

  const updated = await db.updateTicket(projectId, number, updates);
  broadcastEvent("ticket:updated", projectId, { ticket: updated });

  return c.json(updated);
});

// DELETE /api/projects/:projectId/tickets/:number
tickets.delete("/:number", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);

  const ticket = await db.getTicket(projectId, number);
  if (!ticket) return c.json({ error: "Ticket not found" }, 404);

  if (ticket.status === "merged") {
    return c.json({ error: "Cannot delete merged ticket" }, 400);
  }

  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  // Check dependents
  const allTickets = await db.getProjectTickets(projectId);
  const dependents = allTickets.filter((t) =>
    t.dependencies.includes(number) && t.status !== "merged",
  );

  // If dependents exist and no ?cascade=true, warn
  if (dependents.length > 0 && c.req.query("cascade") !== "true") {
    return c.json({
      error: "Other tickets depend on this one",
      dependents: dependents.map((t) => ({ number: t.number, title: t.title })),
      hint: "Add ?cascade=true to delete dependent tickets too",
    }, 409);
  }

  // Batch: stop all CCs first, then clean up, then schedule once
  const toDelete = dependents.length > 0 ? [...dependents, ticket] : [ticket];

  // Phase 1: Stop all CCs (releases slots but don't schedule yet)
  const { stopTicketCC } = await import("../services/cc/manager.js");
  for (const t of toDelete) {
    await stopTicketCC(t.projectId, t.number);
  }

  // Phase 2: Clean up all resources
  for (const t of toDelete) {
    await cleanupTicketResources(project, t);
    broadcastEvent("ticket:deleted", projectId, { number: t.number });
  }

  // Phase 3: Schedule queued tickets into freed slots
  const { scheduleNext } = await import("../services/cc/manager.js");
  scheduleNext();

  return c.json({ deleted: true });
});

/** Clean up ticket resources (git, GitHub, Redis) without stopping CC */
async function cleanupTicketResources(
  project: { id: string; owner: string; repo: string; githubToken: string },
  ticket: Ticket,
): Promise<void> {
  // Remove worktree
  try {
    await git.removeWorktree(project.owner, project.repo, ticket.branchName);
    await git.deleteLocalBranch(project.owner, project.repo, ticket.branchName);
  } catch {
    // ignore
  }

  // Close GitHub PR if exists
  if (ticket.githubPrNumber) {
    try {
      await github.closePullRequest(
        project.githubToken, project.owner, project.repo, ticket.githubPrNumber,
      );
    } catch {
      // ignore
    }
  }

  // Close GitHub Issue
  try {
    await github.closeIssue(
      project.githubToken, project.owner, project.repo, ticket.githubIssueNumber,
    );
  } catch {
    // ignore
  }

  // Delete remote branch
  try {
    await github.deleteBranch(
      project.githubToken, project.owner, project.repo, ticket.branchName,
    );
  } catch {
    // ignore
  }

  await db.deleteTicket(ticket.projectId, ticket.number);
}

// POST /api/projects/:projectId/tickets/:number/merge
tickets.post("/:number/merge", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);

  const ticket = await db.getTicket(projectId, number);
  if (!ticket) return c.json({ error: "Ticket not found" }, 404);

  if (ticket.status !== "reviewing") {
    return c.json({ error: "Only reviewing tickets can be merged" }, 400);
  }

  const project = await db.getProject(projectId);
  if (!project) return c.json({ error: "Project not found" }, 404);

  // Check CI
  try {
    const ci = await github.getCIStatus(
      project.githubToken, project.owner, project.repo, ticket.branchName,
    );
    if (!ci.passed) {
      return c.json({
        error: ci.pending
          ? "CI checks still running"
          : `CI checks failed: ${ci.details}`,
      }, 400);
    }
  } catch (err) {
    console.warn("Failed to check CI status before merge:", err);
  }

  // Check dependencies
  if (ticket.dependencies.length > 0) {
    const { ok, blocking } = await checkDependenciesMerged(projectId, ticket.dependencies);
    if (!ok) {
      return c.json({
        error: `Blocking dependencies: ${blocking.map((n) => `#${n}`).join(", ")}`,
      }, 400);
    }
  }

  // Acquire merge lock
  if (!(await db.acquireMergeLock(projectId))) {
    return c.json({ error: "Another merge is in progress" }, 409);
  }

  // Return 202 — async merge
  // Run merge in background
  doMerge(project, ticket).catch(async (err) => {
    console.error(`Merge failed for ${projectId}#${number}:`, err);

    // Clean up partial PR if it was created
    const freshTicket = await db.getTicket(projectId, number);
    if (freshTicket?.githubPrNumber) {
      try {
        await github.closePullRequest(
          project.githubToken, project.owner, project.repo, freshTicket.githubPrNumber,
        );
      } catch { /* ignore */ }
      await db.updateTicket(projectId, number, { githubPrNumber: undefined });
    }

    await db.releaseMergeLock(projectId);
    await db.setMergeProgress(projectId, number, "failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    broadcastEvent("merge:progress", projectId, {
      number,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return c.json({ accepted: true, message: "Merge started" }, 202);
});

async function doMerge(
  project: { id: string; owner: string; repo: string; githubToken: string; baseBranch: string },
  ticket: Ticket,
): Promise<void> {
  const { projectId, number } = { projectId: project.id, number: ticket.number };

  broadcastEvent("merge:progress", projectId, { number, status: "creating_pr" });
  await db.setMergeProgress(projectId, number, "creating_pr");

  // Create PR
  const prNumber = await github.createPullRequest(
    project.githubToken,
    project.owner,
    project.repo,
    ticket.branchName,
    project.baseBranch,
    ticket.title,
    `${ticket.description}\n\nCloses #${ticket.githubIssueNumber}`,
  );

  await db.updateTicket(projectId, number, { githubPrNumber: prNumber });
  broadcastEvent("merge:progress", projectId, { number, status: "merging", prNumber });
  await db.setMergeProgress(projectId, number, "merging", { prNumber });

  // Merge PR
  await github.mergePullRequest(
    project.githubToken,
    project.owner,
    project.repo,
    prNumber,
  );

  // Wait for CD on base branch — only if repo has workflows configured
  const hasCd = await github.hasWorkflows(project.githubToken, project.owner, project.repo);
  if (hasCd) {
    broadcastEvent("merge:progress", projectId, { number, status: "waiting_cd" });
    await db.setMergeProgress(projectId, number, "waiting_cd");
    // Renew merge lock TTL since CD wait can be long
    const lockRenewed = await db.renewMergeLock(projectId);
    if (!lockRenewed) {
      throw new Error("Merge lock expired during merge — another merge may have started");
    }
    try {
      const cd = await waitForCD(project, 300_000);
      if (!cd.passed) {
        broadcastEvent("merge:progress", projectId, {
          number,
          status: "cd_failed",
          message: "CD failed on base branch — ticket is merged but deployment may need attention",
        });
      }
    } catch (err) {
      console.warn(`CD wait timed out or failed for ${projectId}#${number}:`, err);
      broadcastEvent("merge:progress", projectId, {
        number,
        status: "cd_timeout",
        message: "CD did not complete in time, proceeding",
      });
    }
  }

  // Update ticket status
  await db.updateTicket(projectId, number, { status: "merged", ccStatus: "completed" });

  // Clean up
  try {
    await git.removeWorktree(project.owner, project.repo, ticket.branchName);
    await github.deleteBranch(
      project.githubToken, project.owner, project.repo, ticket.branchName,
    );
  } catch {
    // ignore cleanup errors
  }

  await db.releaseMergeLock(projectId);

  await db.clearMergeProgress(projectId);
  broadcastEvent("merge:progress", projectId, { number, status: "merged" });
  broadcastEvent("ticket:status_changed", projectId, {
    number,
    from: "reviewing",
    to: "merged",
  });

  // Update kanban worktree to include the merge, then notify Kanban CC
  try {
    await git.updateKanbanWorktree(project.owner, project.repo, project.baseBranch, project.githubToken);
  } catch (err) {
    console.warn("Failed to update kanban worktree after merge:", err);
  }
  const { sendToKanbanCC, isKanbanCCRunning } = await import("../services/cc/manager.js");
  if (isKanbanCCRunning(projectId)) {
    sendToKanbanCC(
      projectId,
      `[SYSTEM] Ticket #${number} "${ticket.title}" has been merged. Your worktree has been updated to the latest base branch. Please review remaining tickets and proceed.`,
    );
  }
}

async function waitForCD(
  project: { owner: string; repo: string; githubToken: string; baseBranch: string },
  timeoutMs: number,
): Promise<{ passed: boolean }> {
  const start = Date.now();
  const pollInterval = 10_000; // 10s

  // Wait a bit for GitHub to register the workflow run
  await new Promise((r) => setTimeout(r, 5000));

  while (Date.now() - start < timeoutMs) {
    try {
      const ci = await github.getCIStatus(
        project.githubToken, project.owner, project.repo, project.baseBranch,
      );
      if (!ci.pending) {
        return { passed: ci.passed };
      }
    } catch {
      // API error — continue polling
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error("CD wait timeout");
}

// GET /api/projects/:projectId/tickets/:number/merge
tickets.get("/:number/merge", async (c) => {
  const projectId = c.req.param("projectId")!;
  const progress = await db.getMergeProgress(projectId);
  if (!progress) {
    return c.json({ status: "idle" });
  }
  return c.json(progress);
});

// DELETE /api/projects/:projectId/tickets/:number/merge
tickets.delete("/:number/merge", async (c) => {
  const projectId = c.req.param("projectId")!;
  const number = Number(c.req.param("number")!);

  const ticket = await db.getTicket(projectId, number);
  if (!ticket) return c.json({ error: "Ticket not found" }, 404);

  // Only cancel if this ticket has an active PR (is actually being merged)
  if (!ticket.githubPrNumber) {
    return c.json({ error: "No active merge for this ticket" }, 400);
  }

  // Close PR
  const project = await db.getProject(projectId);
  if (project) {
    try {
      await github.closePullRequest(
        project.githubToken, project.owner, project.repo, ticket.githubPrNumber,
      );
    } catch {
      // ignore
    }
  }
  await db.updateTicket(projectId, number, { githubPrNumber: undefined });
  await db.releaseMergeLock(projectId);

  return c.json({ cancelled: true });
});
