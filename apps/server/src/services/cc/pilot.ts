import { spawn as cpSpawn } from "node:child_process";
import path from "node:path";
import { getRingBuffer, onPTYOutput } from "../../lib/pty.js";
import { sendToKanbanCC, isKanbanCCRunning } from "./manager.js";
import { broadcastEvent } from "../../lib/broadcast.js";
import * as db from "../redis.js";

const REPOS_DIR = process.env.REPOS_DIR || "/repos";

/** Run claude -p with prompt via stdin (no timeout, checks process is alive) */
function claudePrompt(prompt: string, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = cpSpawn("claude", ["-p"], {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    // Periodic liveness check — if process died without firing 'close', clean up
    const livenessCheck = setInterval(() => {
      try {
        process.kill(proc.pid!, 0); // signal 0 = check if alive
      } catch {
        clearInterval(livenessCheck);
        if (!settled) {
          settled = true;
          reject(new Error("claude -p process died unexpectedly"));
        }
      }
    }, 10_000);

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      clearInterval(livenessCheck);
      if (settled) return;
      settled = true;
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`claude -p exited ${code}: ${stderr.slice(0, 200)}`));
    });
    proc.on("error", (err) => {
      clearInterval(livenessCheck);
      if (settled) return;
      settled = true;
      reject(err);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

interface PilotState {
  projectId: string;
  goal: string;
  idleTimeout: number; // seconds
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  lastNudge: string | null;
  lastNudgeMessage: string | null;
  consecutiveSkips: number;
  lastResetAt: number;
  unsubscribe: (() => void) | null;
  nudging: boolean;
  broadcastTimer: ReturnType<typeof setTimeout> | null;
}

const pilots = new Map<string, PilotState>();

const BROADCAST_DEBOUNCE_MS = 1000;

/** Get kanban worktree path for a project */
async function getKanbanWorktreePath(projectId: string): Promise<string | null> {
  const project = await db.getProject(projectId);
  if (!project) return null;
  return path.join(REPOS_DIR, project.owner, `${project.repo}.git`, "worktrees-data", "kanban");
}

/** Extract last N chars of terminal output from ring buffer */
function getRecentOutput(projectId: string, maxChars = 2000): string {
  const key = `kanban:${projectId}`;
  const ringBuffer = getRingBuffer(key);
  if (!ringBuffer) return "(no terminal output)";
  const history = ringBuffer.getHistory().toString("utf-8");
  if (history.length > maxChars) return history.slice(-maxChars);
  return history || "(empty)";
}

/** Reset the idle timer — called on every PTY output */
function resetIdleTimer(state: PilotState): void {
  if (!state.running) return;
  if (state.timer) clearTimeout(state.timer);
  state.lastResetAt = Date.now();
  state.consecutiveSkips = 0;
  state.timer = setTimeout(() => nudge(state), state.idleTimeout * 1000);

  if (!state.broadcastTimer) {
    state.broadcastTimer = setTimeout(() => {
      state.broadcastTimer = null;
      if (state.running) {
        broadcastEvent("pilot:idle_reset", state.projectId, {
          lastResetAt: state.lastResetAt,
          idleTimeout: state.idleTimeout,
        });
      }
    }, BROADCAST_DEBOUNCE_MS);
  }
}

async function nudge(state: PilotState): Promise<void> {
  if (!state.running || state.nudging) return;

  if (!isKanbanCCRunning(state.projectId)) {
    console.log(`[pilot] Kanban CC not running for ${state.projectId}, waiting for output`);
    return;
  }

  state.nudging = true;

  const worktreePath = await getKanbanWorktreePath(state.projectId);
  const recentOutput = getRecentOutput(state.projectId);

  const lastMsgContext = state.lastNudgeMessage
    ? `\n## Your Last Message to the Dev Team\n"${state.lastNudgeMessage}"\n(Don't repeat yourself. If the situation hasn't changed, respond with SKIP.)`
    : "";

  const prompt = `You are the product owner / technical lead for a software project. You have full access to the codebase in the current working directory. The dev team (called "Kanban CC") works autonomously — you are their stakeholder, decision-maker, and collaborator.

## Project Goal
${state.goal}

## Recent Dev Team Activity (terminal output, last ~2000 chars)
\`\`\`
${recentOutput}
\`\`\`
${lastMsgContext}
## How To Respond

First, read the recent terminal output carefully. Determine what the dev team is doing:

**If they asked a question or need a decision** → Answer it decisively. You are the product owner — make the call on:
- Feature scope ("yes do that" / "no, skip that for now")
- Design choices ("go with option A because...")
- Priority decisions ("fix the bug first, then the feature")
- Technical trade-offs ("use the simpler approach, we can optimize later")
- UX questions ("the user would expect X behavior")
Don't say "it's up to you" — that's your job to decide.

**If they're idle with no pending questions** → Browse the codebase (read key files, git log/diff) and proactively:
- Point out bugs, missing features, or UX issues in the code
- Challenge architectural decisions that seem wrong
- Suggest the next feature based on the project goal
- Flag code quality concerns (reference specific files/functions)
- Ask "why did you do X instead of Y?"

**Respond with "SKIP" (exactly) only if:**
- They're actively working and don't need input
- You already answered and they're implementing your feedback
- Everything is on track with no questions pending

Be specific and decisive. Reference actual files and code. Act like a demanding but fair product owner who unblocks the team fast.`;

  try {
    const message = await claudePrompt(prompt, worktreePath ?? undefined);
    if (!message || message === "SKIP") {
      state.consecutiveSkips++;
      console.log(`[pilot] Skipping nudge for ${state.projectId} (${state.consecutiveSkips} consecutive skips)`);
    } else {
      console.log(`[pilot] Nudging Kanban CC for ${state.projectId}: ${message.slice(0, 100)}...`);
      sendToKanbanCC(state.projectId, `[PILOT] ${message}`);
      state.lastNudge = new Date().toISOString();
      state.lastNudgeMessage = message;
      state.consecutiveSkips = 0;
    }
  } catch (err) {
    console.warn(`[pilot] claude -p failed for ${state.projectId}:`, err);
  }

  state.nudging = false;

  // Exponential backoff on consecutive skips (capped at 5 min)
  if (state.consecutiveSkips > 0) {
    const backoffMs = Math.min(
      state.idleTimeout * 1000 * Math.pow(2, state.consecutiveSkips),
      300_000,
    );
    console.log(`[pilot] Backoff: next check in ${Math.round(backoffMs / 1000)}s`);
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => nudge(state), backoffMs);
  } else {
    resetIdleTimer(state);
  }
}

export async function startPilot(
  projectId: string,
  goal: string,
  idleTimeout = 5,
): Promise<void> {
  await stopPilot(projectId);

  const state: PilotState = {
    projectId,
    goal,
    idleTimeout,
    timer: null,
    running: true,
    lastNudge: null,
    lastNudgeMessage: null,
    consecutiveSkips: 0,
    lastResetAt: Date.now(),
    unsubscribe: null,
    nudging: false,
    broadcastTimer: null,
  };

  const key = `kanban:${projectId}`;
  state.unsubscribe = onPTYOutput(key, () => resetIdleTimer(state));

  pilots.set(projectId, state);
  await db.savePilotState(projectId, { goal, idleTimeout });
  broadcastEvent("pilot:status_changed", projectId, { active: true, goal });

  resetIdleTimer(state);
  console.log(`[pilot] Started for ${projectId}, idle timeout: ${idleTimeout}s`);
}

export async function stopPilot(projectId: string): Promise<void> {
  const state = pilots.get(projectId);
  if (state) {
    state.running = false;
    if (state.timer) clearTimeout(state.timer);
    if (state.broadcastTimer) clearTimeout(state.broadcastTimer);
    if (state.unsubscribe) state.unsubscribe();
    pilots.delete(projectId);
    broadcastEvent("pilot:status_changed", projectId, { active: false });
  }
  await db.deletePilotState(projectId);
}

/** Restore pilots from Redis after server restart */
export async function restorePilots(): Promise<void> {
  const saved = await db.getAllPilotStates();
  for (const { projectId, goal, idleTimeout } of saved) {
    if (isKanbanCCRunning(projectId)) {
      console.log(`[pilot] Restoring pilot for ${projectId}`);
      await startPilot(projectId, goal, idleTimeout);
    } else {
      console.log(`[pilot] Kanban CC not running for ${projectId}, deferring pilot restore`);
    }
  }
}

export function getPilotStatus(projectId: string): {
  active: boolean;
  goal?: string;
  idleTimeout?: number;
  lastNudge?: string | null;
  lastResetAt?: number;
} {
  const state = pilots.get(projectId);
  if (!state) return { active: false };
  return {
    active: true,
    goal: state.goal,
    idleTimeout: state.idleTimeout,
    lastNudge: state.lastNudge,
    lastResetAt: state.lastResetAt,
  };
}

/** Stop all in-memory pilots (for graceful shutdown — keeps Redis state for restore) */
export function stopAllPilots(): void {
  for (const [, state] of pilots) {
    state.running = false;
    if (state.timer) clearTimeout(state.timer);
    if (state.broadcastTimer) clearTimeout(state.broadcastTimer);
    if (state.unsubscribe) state.unsubscribe();
  }
  pilots.clear();
}
