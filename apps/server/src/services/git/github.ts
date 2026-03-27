import { Octokit } from "@octokit/rest";
import crypto from "node:crypto";

function getClient(token: string) {
  return new Octokit({ auth: token });
}

// ── Token Validation ──

export async function validateToken(
  token: string,
  owner: string,
  repo: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const octokit = getClient(token);

    // Check repo access
    await octokit.repos.get({ owner, repo });

    // Check token scopes (repo + admin:repo_hook)
    const { headers } = await octokit.request("GET /rate_limit");
    const scopes = (headers["x-oauth-scopes"] || "").split(",").map((s: string) => s.trim());
    if (!scopes.includes("repo")) {
      return { valid: false, error: "Token missing 'repo' scope" };
    }
    if (!scopes.includes("admin:repo_hook")) {
      return { valid: false, error: "Token missing 'admin:repo_hook' scope (needed for webhooks)" };
    }

    return { valid: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Invalid token or repo access";
    return { valid: false, error: message };
  }
}

// ── CI Status ──

export async function getCIStatus(
  token: string,
  owner: string,
  repo: string,
  ref: string,
): Promise<{ passed: boolean; pending: boolean; details: string }> {
  const octokit = getClient(token);

  // Check combined status (commit statuses)
  const { data: status } = await octokit.repos.getCombinedStatusForRef({
    owner,
    repo,
    ref,
  });

  // Check check runs
  const { data: checkRuns } = await octokit.checks.listForRef({
    owner,
    repo,
    ref,
  });

  const hasChecks = status.statuses.length > 0 || checkRuns.total_count > 0;
  if (!hasChecks) {
    // No CI configured — consider it passed
    return { passed: true, pending: false, details: "No CI checks configured" };
  }

  const allChecksPassed = checkRuns.check_runs.every(
    (cr) => cr.conclusion === "success" || cr.conclusion === "skipped",
  );
  const allStatusesPassed = status.state === "success" || status.statuses.length === 0;
  const anyPending =
    status.state === "pending" ||
    checkRuns.check_runs.some((cr) => cr.status !== "completed");

  if (anyPending) {
    return { passed: false, pending: true, details: "CI checks still running" };
  }

  const passed = allChecksPassed && allStatusesPassed;
  return {
    passed,
    pending: false,
    details: passed ? "All CI checks passed" : "Some CI checks failed",
  };
}

// ── Webhooks ──

export async function registerWebhook(
  token: string,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string,
): Promise<string> {
  const octokit = getClient(token);
  const { data } = await octokit.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret,
      insecure_ssl: "0",
    },
    events: [
      "issues",
      "push",
      "check_run",
      "workflow_run",
    ],
    active: true,
  });
  return String(data.id);
}

export async function deleteWebhook(
  token: string,
  owner: string,
  repo: string,
  hookId: string,
): Promise<void> {
  const octokit = getClient(token);
  try {
    await octokit.repos.deleteWebhook({
      owner,
      repo,
      hook_id: Number(hookId),
    });
  } catch {
    // Webhook may already be deleted
  }
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// ── Issues ──

export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels?: string[],
): Promise<number> {
  const octokit = getClient(token);
  const { data } = await octokit.issues.create({
    owner,
    repo,
    title,
    body,
    labels,
  });
  return data.number;
}

export async function updateIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  updates: { body?: string; labels?: string[]; state?: "open" | "closed" },
): Promise<void> {
  const octokit = getClient(token);
  await octokit.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    ...updates,
  });
}

export async function closeIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<void> {
  await updateIssue(token, owner, repo, issueNumber, { state: "closed" });
}

// ── Pull Requests ──

export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<number> {
  const octokit = getClient(token);
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });
  return data.number;
}

export async function mergePullRequest(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  const octokit = getClient(token);
  await octokit.pulls.merge({
    owner,
    repo,
    pull_number: prNumber,
    merge_method: "squash",
  });
}

export async function closePullRequest(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  const octokit = getClient(token);
  await octokit.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    state: "closed",
  });
}

// ── Branches ──

export async function deleteBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
): Promise<void> {
  const octokit = getClient(token);
  try {
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
  } catch {
    // Branch may not exist
  }
}

// ── Status Labels ──

const STATUS_LABELS = ["todo", "in-progress", "reviewing"] as const;

export async function setStatusLabel(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  status: string,
): Promise<void> {
  const octokit = getClient(token);

  // Ensure labels exist
  for (const label of STATUS_LABELS) {
    try {
      await octokit.issues.getLabel({ owner, repo, name: label });
    } catch {
      const colors: Record<string, string> = {
        todo: "e4e669",
        "in-progress": "0075ca",
        reviewing: "d876e3",
      };
      await octokit.issues.createLabel({
        owner,
        repo,
        name: label,
        color: colors[label] || "ededed",
      });
    }
  }

  // Map status to label
  const labelMap: Record<string, string> = {
    todo: "todo",
    in_progress: "in-progress",
    reviewing: "reviewing",
  };
  const newLabel = labelMap[status];
  if (!newLabel) return;

  // Remove old status labels
  const { data: currentLabels } = await octokit.issues.listLabelsOnIssue({
    owner,
    repo,
    issue_number: issueNumber,
  });
  for (const label of currentLabels) {
    if (
      STATUS_LABELS.includes(label.name as (typeof STATUS_LABELS)[number]) &&
      label.name !== newLabel
    ) {
      await octokit.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label.name,
      });
    }
  }

  // Add new label
  await octokit.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [newLabel],
  });
}
