import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const exec = promisify(execFile);
const REPOS_DIR = process.env.REPOS_DIR || "/repos";

function bareRepoPath(owner: string, repo: string): string {
  return path.join(REPOS_DIR, owner, `${repo}.git`);
}

function worktreesDir(owner: string, repo: string): string {
  return path.join(bareRepoPath(owner, repo), "worktrees-data");
}

/** git clone --bare */
export async function cloneBare(
  owner: string,
  repo: string,
  token: string,
): Promise<string> {
  const repoPath = bareRepoPath(owner, repo);
  await fs.mkdir(path.dirname(repoPath), { recursive: true });

  try {
    await fs.access(repoPath);
    // Already cloned, just fetch
    await gitFetch(owner, repo, token);
    return repoPath;
  } catch {
    // Clone fresh
  }

  const url = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  await exec("git", ["clone", "--bare", url, repoPath]);

  // Create worktrees directory
  await fs.mkdir(worktreesDir(owner, repo), { recursive: true });

  return repoPath;
}

/** git fetch in bare repo */
export async function gitFetch(
  owner: string,
  repo: string,
  token: string,
): Promise<void> {
  const repoPath = bareRepoPath(owner, repo);
  const url = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  await exec("git", ["fetch", url, "+refs/heads/*:refs/heads/*", "--prune"], {
    cwd: repoPath,
  });
}

/** Create worktree for a ticket branch */
export async function addWorktree(
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string,
): Promise<string> {
  const repoPath = bareRepoPath(owner, repo);
  const wtDir = worktreesDir(owner, repo);
  const wtPath = path.join(wtDir, branchName.replace(/\//g, "-"));

  await exec("git", ["worktree", "add", "-b", branchName, wtPath, baseBranch], {
    cwd: repoPath,
  });

  return wtPath;
}

/** Create kanban worktree (checkout base branch) */
export async function addKanbanWorktree(
  owner: string,
  repo: string,
  baseBranch: string,
): Promise<string> {
  const repoPath = bareRepoPath(owner, repo);
  const wtDir = worktreesDir(owner, repo);
  const wtPath = path.join(wtDir, "kanban");

  try {
    await fs.access(wtPath);
    // Already exists — bare repos have no "origin" remote, use fetch + reset
    const repoPath = bareRepoPath(owner, repo);
    await exec("git", ["fetch", repoPath, baseBranch], { cwd: wtPath });
    await exec("git", ["reset", "--hard", "FETCH_HEAD"], { cwd: wtPath });
    return wtPath;
  } catch {
    // Create fresh
  }

  await exec(
    "git",
    ["worktree", "add", "--detach", wtPath, baseBranch],
    { cwd: repoPath },
  );

  return wtPath;
}

/** Remove worktree */
export async function removeWorktree(
  owner: string,
  repo: string,
  branchName: string,
): Promise<void> {
  const repoPath = bareRepoPath(owner, repo);
  const wtDir = worktreesDir(owner, repo);
  const wtPath = path.join(wtDir, branchName.replace(/\//g, "-"));

  try {
    await exec("git", ["worktree", "remove", "--force", wtPath], {
      cwd: repoPath,
    });
  } catch {
    // Worktree may not exist
  }
}

/** Delete local branch in bare repo */
export async function deleteLocalBranch(
  owner: string,
  repo: string,
  branchName: string,
): Promise<void> {
  const repoPath = bareRepoPath(owner, repo);
  try {
    await exec("git", ["branch", "-D", branchName], { cwd: repoPath });
  } catch {
    // Branch may not exist
  }
}

/** Rebase a worktree onto base branch */
export async function rebaseWorktree(
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string,
  token: string,
): Promise<{ success: boolean; conflict: boolean }> {
  const wtDir = worktreesDir(owner, repo);
  const wtPath = path.join(wtDir, branchName.replace(/\//g, "-"));

  try {
    // Fetch latest
    await gitFetch(owner, repo, token);

    // Rebase
    await exec("git", ["rebase", baseBranch], { cwd: wtPath });

    // Force push
    const url = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    await exec("git", ["push", url, branchName, "--force"], { cwd: wtPath });

    return { success: true, conflict: false };
  } catch (err) {
    // Check if rebase is in progress (indicates actual conflict)
    let isConflict = false;
    try {
      // If rebase --abort succeeds, a rebase was in progress → conflict
      await exec("git", ["rebase", "--abort"], { cwd: wtPath });
      isConflict = true;
    } catch {
      // rebase --abort failed → rebase wasn't in progress → other error (auth, network, etc.)
      isConflict = false;
    }

    if (!isConflict) {
      // Re-throw non-conflict errors so callers can distinguish
      throw err;
    }
    return { success: false, conflict: true };
  }
}

/** Reset worktree to base branch (discard all changes) */
export async function resetWorktreeToBase(
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string,
  token: string,
): Promise<void> {
  const wtDir = worktreesDir(owner, repo);
  const wtPath = path.join(wtDir, branchName.replace(/\//g, "-"));

  await gitFetch(owner, repo, token);
  await exec("git", ["reset", "--hard", baseBranch], { cwd: wtPath });
  const url = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  await exec("git", ["push", url, branchName, "--force"], { cwd: wtPath });
}

/** Update kanban worktree (git pull) */
export async function updateKanbanWorktree(
  owner: string,
  repo: string,
  baseBranch: string,
  token: string,
): Promise<void> {
  const wtDir = worktreesDir(owner, repo);
  const wtPath = path.join(wtDir, "kanban");

  await gitFetch(owner, repo, token);
  try {
    await exec("git", ["checkout", baseBranch], { cwd: wtPath });
    await exec("git", ["reset", "--hard", baseBranch], { cwd: wtPath });
  } catch {
    // Detached head, just reset
    await exec("git", ["reset", "--hard", baseBranch], { cwd: wtPath });
  }
}

/** Remove entire bare repo */
export async function removeBareRepo(
  owner: string,
  repo: string,
): Promise<void> {
  const repoPath = bareRepoPath(owner, repo);
  await fs.rm(repoPath, { recursive: true, force: true });
}
