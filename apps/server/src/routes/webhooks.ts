import { Hono } from "hono";
import * as db from "../services/redis.js";
import * as github from "../services/git/github.js";
import * as git from "../services/git/worktree.js";
import { broadcastEvent } from "../lib/broadcast.js";
import type { Ticket } from "@claudehub/shared";

export const webhooks = new Hono();

// Simple in-memory deduplication for webhook deliveries (TTL-based)
const recentDeliveries = new Map<string, number>();

const DEDUP_TTL_MS = 300_000; // 5 minutes

function isDuplicate(deliveryId: string): boolean {
  // Prune expired entries periodically (every 100 checks)
  if (recentDeliveries.size > 100) {
    const now = Date.now();
    for (const [id, ts] of recentDeliveries) {
      if (now - ts > DEDUP_TTL_MS) recentDeliveries.delete(id);
    }
  }
  if (recentDeliveries.has(deliveryId)) return true;
  recentDeliveries.set(deliveryId, Date.now());
  return false;
}

// POST /api/webhooks/github
webhooks.post("/github", async (c) => {
  const event = c.req.header("X-GitHub-Event");
  const signature = c.req.header("X-Hub-Signature-256");
  const deliveryId = c.req.header("X-GitHub-Delivery");
  const rawBody = await c.req.text();

  if (!event || !signature) {
    return c.json({ error: "Missing headers" }, 400);
  }

  // Deduplicate retried deliveries
  if (deliveryId && isDuplicate(deliveryId)) {
    return c.json({ received: true, deduplicated: true });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Find project by repo
  const repoFullName = (payload.repository as Record<string, unknown>)?.full_name as string | undefined;
  if (!repoFullName) {
    return c.json({ error: "No repository in payload" }, 400);
  }

  const [owner, repo] = repoFullName.split("/");
  const project = await db.getProjectByRepo(owner, repo);
  if (!project) {
    // Verify signature before revealing project existence
    // Since we have no project secret, just acknowledge
    return c.json({ received: true });
  }

  // Verify signature
  if (!github.verifyWebhookSignature(rawBody, signature, project.webhookSecret)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  try {
    switch (event) {
      case "issues":
        await handleIssueEvent(project, payload);
        break;
      case "push":
        await handlePushEvent(project, payload);
        break;
      case "check_run":
        await handleCheckRunEvent(project, payload);
        break;
      case "workflow_run":
        await handleWorkflowRunEvent(project, payload);
        break;
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event}:`, err);
  }

  return c.json({ received: true });
});

async function handleIssueEvent(
  project: { id: string; owner: string; repo: string; githubToken: string },
  payload: Record<string, unknown>,
): Promise<void> {
  const action = payload.action as string;
  const issue = payload.issue as { number: number; title: string; body: string };

  const ticket = await db.getTicketByIssue(project.id, issue.number);
  if (!ticket) return; // Not our issue

  if (action === "closed") {
    // Only delete non-merged tickets (merged tickets close via PR)
    // Also skip if a merge is in progress — the issue was closed by the PR merge
    const mergeProgress = await db.getMergeProgress(project.id);
    const isMerging = mergeProgress && (mergeProgress.number as number) === ticket.number;
    if (ticket.status !== "merged" && !isMerging) {
      await deleteTicketWithCascade(project, ticket);
    }
  }

  if (action === "edited") {
    const changes = payload.changes as { title?: { from: string }; body?: { from: string } } | undefined;

    if (changes?.title) {
      // Title changed — delete ticket (title immutable)
      await deleteTicketWithCascade(project, ticket);
    }

    if (changes?.body) {
      // Description changed — sync back
      await db.updateTicket(project.id, ticket.number, {
        description: issue.body,
      });
      broadcastEvent("ticket:updated", project.id, {
        number: ticket.number,
        field: "description",
      });
    }
  }
}

async function handlePushEvent(
  project: { id: string; owner: string; repo: string; githubToken: string; baseBranch: string },
  payload: Record<string, unknown>,
): Promise<void> {
  const ref = payload.ref as string;
  const baseBranchRef = `refs/heads/${project.baseBranch}`;

  if (ref !== baseBranchRef) {
    // Feature branch push — check if repo has CI, notify Ticket CC if not
    const branchName = ref.replace("refs/heads/", "");
    const ticket = await db.getTicketByBranch(project.id, branchName);
    if (ticket) {
      const hasCi = await github.hasWorkflows(
        project.githubToken, project.owner, project.repo, branchName,
      );
      if (!hasCi) {
        const { sendToTicketCC, isTicketCCRunning } = await import("../services/cc/manager.js");
        if (isTicketCCRunning(project.id, ticket.number)) {
          sendToTicketCC(
            project.id, ticket.number,
            '[SYSTEM] No CI workflows configured for this repository. CI check is skipped — you may proceed to self-assessment and set status to reviewing.',
          );
        }
      }
    }
    return;
  }

  console.log(`Base branch push detected for ${project.id}`);

  // Update kanban worktree
  try {
    await git.updateKanbanWorktree(
      project.owner, project.repo, project.baseBranch, project.githubToken,
    );
  } catch (err) {
    console.warn("Failed to update kanban worktree:", err);
  }

  // Notify Kanban CC
  const { sendToKanbanCC, isKanbanCCRunning, sendToTicketCC, isTicketCCRunning } =
    await import("../services/cc/manager.js");
  if (isKanbanCCRunning(project.id)) {
    sendToKanbanCC(project.id, "[SYSTEM] Base branch updated. Review pending tickets.");
  }

  // Rebase all non-merged tickets (skip ticket currently being merged)
  const mergeProgress = await db.getMergeProgress(project.id);
  const mergingNumber = mergeProgress ? (mergeProgress.number as number) : null;
  const tickets = await db.getProjectTickets(project.id);
  for (const ticket of tickets) {
    if (ticket.status === "merged") continue;
    if (ticket.number === mergingNumber) continue;

    broadcastEvent("rebase:started", project.id, { number: ticket.number });

    if (ticket.status === "todo") {
      // Server direct rebase (no CC running)
      try {
        await git.resetWorktreeToBase(
          project.owner, project.repo, ticket.branchName,
          project.baseBranch, project.githubToken,
        );
        broadcastEvent("rebase:completed", project.id, { number: ticket.number });
      } catch (err) {
        console.warn(`Rebase failed for todo ticket #${ticket.number}:`, err);
      }
    } else if (ticket.status === "in_progress") {
      // Notify Ticket CC to rebase
      if (isTicketCCRunning(project.id, ticket.number)) {
        sendToTicketCC(
          project.id, ticket.number,
          "[SYSTEM] Base branch updated. Please run: git fetch origin && git rebase origin/" +
          project.baseBranch + " and resolve any conflicts.",
        );
      }
    } else if (ticket.status === "reviewing") {
      // Server tries rebase; on conflict → back to in_progress
      let result: { success: boolean; conflict: boolean };
      try {
        result = await git.rebaseWorktree(
          project.owner, project.repo, ticket.branchName,
          project.baseBranch, project.githubToken,
        );
      } catch (err) {
        // Non-conflict error (auth, network, etc.) — log and skip
        console.warn(`Rebase failed for reviewing ticket #${ticket.number} (non-conflict):`, err);
        continue;
      }

      if (result.success) {
        broadcastEvent("rebase:completed", project.id, { number: ticket.number });
      } else {
        // Conflict — send back to in_progress and auto-restart CC
        await db.updateTicket(project.id, ticket.number, {
          status: "in_progress",
          returnReason: "conflict",
          ccStatus: "idle",
        });
        broadcastEvent("rebase:conflict", project.id, { number: ticket.number });
        broadcastEvent("ticket:status_changed", project.id, {
          number: ticket.number,
          from: "reviewing",
          to: "in_progress",
          reason: "conflict",
        });

        // Auto-restart Ticket CC with --resume to handle conflict
        const { startTicketCC } = await import("../services/cc/manager.js");
        const freshTicket = await db.getTicket(project.id, ticket.number);
        if (freshTicket) {
          const systemPrompt = freshTicket.taskBrief ||
            `Work on ticket #${freshTicket.number}: ${freshTicket.title}\n\n${freshTicket.description}`;
          const settings = await db.getSettings();
          const env: Record<string, string> = {};
          if (settings.anthropicApiKey) env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
          try {
            await startTicketCC(project.id, freshTicket, systemPrompt, env);
            // Notify CC about the conflict
            const { sendToTicketCC } = await import("../services/cc/manager.js");
            sendToTicketCC(
              project.id, ticket.number,
              "[SYSTEM] Rebase conflict detected. Please resolve the merge conflict with the base branch and push.",
            );
          } catch (err) {
            console.warn("Failed to restart Ticket CC for conflict:", err);
          }
        }
      }
    }
  }
}

async function handleCheckRunEvent(
  project: { id: string; owner: string; repo: string },
  payload: Record<string, unknown>,
): Promise<void> {
  const checkRun = payload.check_run as {
    conclusion: string;
    head_sha: string;
    name: string;
    check_suite?: { head_branch: string };
  };
  if (payload.action !== "completed") return;

  const branch = checkRun.check_suite?.head_branch;
  if (!branch || branch === (await db.getProject(project.id))?.baseBranch) return;

  const ticket = await db.getTicketByBranch(project.id, branch);
  if (!ticket) return;

  const passed = checkRun.conclusion === "success";

  // Notify Ticket CC
  const { sendToTicketCC, isTicketCCRunning } = await import("../services/cc/manager.js");
  if (isTicketCCRunning(project.id, ticket.number)) {
    sendToTicketCC(
      project.id, ticket.number,
      `[SYSTEM] CI check "${checkRun.name}" ${passed ? "PASSED" : "FAILED"}.` +
      (passed ? "" : " Please investigate and fix the issue."),
    );
  }

  broadcastEvent("ci:completed", project.id, {
    number: ticket.number,
    passed,
    checkName: checkRun.name,
  });
}

async function handleWorkflowRunEvent(
  project: { id: string; owner: string; repo: string; githubToken: string; baseBranch: string },
  payload: Record<string, unknown>,
): Promise<void> {
  if (payload.action !== "completed") return;

  const workflowRun = payload.workflow_run as {
    conclusion: string;
    head_branch: string;
    name: string;
    html_url: string;
  };

  if (workflowRun.head_branch === project.baseBranch) {
    // CD result on base branch
    if (workflowRun.conclusion === "success") {
      broadcastEvent("cd:completed", project.id, { workflow: workflowRun.name });
      // Notify Kanban CC
      const { sendToKanbanCC, isKanbanCCRunning } = await import("../services/cc/manager.js");
      if (isKanbanCCRunning(project.id)) {
        sendToKanbanCC(project.id, `[SYSTEM] CD "${workflowRun.name}" completed successfully.`);
      }
    } else {
      broadcastEvent("cd:failed", project.id, {
        workflow: workflowRun.name,
        url: workflowRun.html_url,
      });

      // Auto-create urgent bugfix ticket
      const number = await db.getNextTicketNumber(project.id);
      // Sanitize title to match TITLE_PATTERN (letters, numbers, spaces, hyphens only)
      const rawTitle = `Fix CD failure - ${workflowRun.name}`;
      const title = rawTitle.replace(/[^a-zA-Z0-9 -]/g, "").slice(0, 72);
      const description = `CD workflow "${workflowRun.name}" failed.\n\nRun URL: ${workflowRun.html_url}\n\nPlease investigate and fix the deployment issue.`;
      const branch = `bugfix/ticket-${number}-fix-cd-failure`;

      try {
        await git.gitFetch(project.owner, project.repo, project.githubToken);
        await git.addWorktree(project.owner, project.repo, branch, project.baseBranch);
      } catch (err) {
        console.error("Failed to create worktree for CD fix ticket:", err);
        return;
      }

      let issueNumber: number;
      try {
        issueNumber = await github.createIssue(
          project.githubToken, project.owner, project.repo,
          title, description, ["in-progress"],
        );
      } catch (err) {
        console.error("Failed to create GitHub issue for CD fix:", err);
        return;
      }

      const reposDir = process.env.REPOS_DIR || "/repos";
      const ticket: Ticket = {
        id: `${project.id}:${number}`,
        projectId: project.id,
        number,
        title,
        description,
        type: "bugfix",
        status: "in_progress",
        ccStatus: "idle",
        priority: 0,
        branchName: branch,
        worktreePath: `${reposDir}/${project.owner}/${project.repo}.git/worktrees-data/${branch.replace(/\//g, "-")}`,
        dependencies: [],
        githubIssueNumber: issueNumber,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Store taskBrief so crash recovery uses the same prompt
      const systemPrompt = `URGENT: CD Deployment Failure Fix\n\nWorkflow: ${workflowRun.name}\nRun URL: ${workflowRun.html_url}\n\nInvestigate the CD failure, identify the root cause, and fix it. Push your fix to trigger a new deployment.`;
      ticket.taskBrief = systemPrompt;

      await db.saveTicket(ticket);
      broadcastEvent("ticket:created", project.id, { ticket });

      // Auto-start Ticket CC with CD failure context
      const { startTicketCC } = await import("../services/cc/manager.js");
      const settings = await db.getSettings();
      const env: Record<string, string> = {};
      if (settings.anthropicApiKey) env.ANTHROPIC_API_KEY = settings.anthropicApiKey;

      try {
        await startTicketCC(project.id, ticket, systemPrompt, env);
      } catch (err) {
        console.error("Failed to start Ticket CC for CD fix:", err);
      }
    }
  } else {
    // CI result on feature branch — same as check_run
    const ticket = await db.getTicketByBranch(project.id, workflowRun.head_branch);
    if (!ticket) return;

    const passed = workflowRun.conclusion === "success";
    const { sendToTicketCC, isTicketCCRunning } = await import("../services/cc/manager.js");
    if (isTicketCCRunning(project.id, ticket.number)) {
      sendToTicketCC(
        project.id, ticket.number,
        `[SYSTEM] CI workflow "${workflowRun.name}" ${passed ? "PASSED" : "FAILED"}.` +
        (passed ? "" : ` See: ${workflowRun.html_url}`),
      );
    }

    broadcastEvent("ci:completed", project.id, {
      number: ticket.number,
      passed,
      workflow: workflowRun.name,
    });
  }
}

/** Delete a ticket and cascade to any dependents (for webhook-triggered deletes) */
async function deleteTicketWithCascade(
  project: { id: string; owner: string; repo: string; githubToken: string },
  ticket: import("@claudehub/shared").Ticket,
): Promise<void> {
  const { stopTicketCC, scheduleNext } = await import("../services/cc/manager.js");

  // Find dependents
  const allTickets = await db.getProjectTickets(project.id);
  const dependents = allTickets.filter(
    (t) => t.dependencies.includes(ticket.number) && t.status !== "merged",
  );

  const toDelete = [...dependents, ticket];

  // Phase 1: Stop all CCs
  for (const t of toDelete) {
    await stopTicketCC(project.id, t.number);
  }

  // Phase 2: Clean up resources
  for (const t of toDelete) {
    try {
      if (t.githubPrNumber) {
        await github.closePullRequest(
          project.githubToken, project.owner, project.repo, t.githubPrNumber,
        );
      }
      await github.closeIssue(
        project.githubToken, project.owner, project.repo, t.githubIssueNumber,
      );
      await git.removeWorktree(project.owner, project.repo, t.branchName);
      await github.deleteBranch(project.githubToken, project.owner, project.repo, t.branchName);
    } catch { /* ignore */ }

    await db.deleteTicket(project.id, t.number);
    broadcastEvent("ticket:deleted", project.id, { number: t.number });
  }

  // Phase 3: Schedule queued tickets into freed slots
  scheduleNext();
}
