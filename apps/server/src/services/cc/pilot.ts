import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRingBuffer, onPTYOutput } from "../../lib/pty.js";
import { sendToKanbanCC, isKanbanCCRunning } from "./manager.js";
import { broadcastEvent } from "../../lib/broadcast.js";
import * as db from "../redis.js";

const exec = promisify(execFile);

interface PilotState {
  projectId: string;
  goal: string;
  idleTimeout: number; // seconds
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  lastNudge: string | null;
  lastNudgeMessage: string | null; // track last sent message to avoid repeats
  consecutiveSkips: number; // track how many times we skipped in a row
  lastResetAt: number; // Date.now() — when idle timer was last reset
  unsubscribe: (() => void) | null; // PTY output listener cleanup
  nudging: boolean; // prevent concurrent nudges
  broadcastTimer: ReturnType<typeof setTimeout> | null; // debounce for WS broadcast
}

const pilots = new Map<string, PilotState>();

const BROADCAST_DEBOUNCE_MS = 1000;

/** Extract last N chars of text from ring buffer */
function getRecentOutput(projectId: string, maxChars = 4000): string {
  const key = `kanban:${projectId}`;
  const ringBuffer = getRingBuffer(key);
  if (!ringBuffer) return "(no terminal output available)";
  const history = ringBuffer.getHistory().toString("utf-8");
  if (history.length > maxChars) {
    return history.slice(-maxChars);
  }
  return history || "(terminal is empty)";
}

/** Reset the idle timer — called on every PTY output */
function resetIdleTimer(state: PilotState): void {
  if (!state.running) return;
  if (state.timer) clearTimeout(state.timer);
  state.lastResetAt = Date.now();
  state.consecutiveSkips = 0; // CC produced output, reset backoff
  state.timer = setTimeout(() => nudge(state), state.idleTimeout * 1000);

  // Debounced broadcast so frontend can reset its countdown
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
    return; // Don't reset timer — PTY output listener will restart it when CC is back
  }

  state.nudging = true;
  const recentOutput = getRecentOutput(state.projectId);

  const lastMsgContext = state.lastNudgeMessage
    ? `\n## Last Message You Sent\n"${state.lastNudgeMessage}"\n(Avoid repeating the same message. If the situation hasn't changed, respond with SKIP.)`
    : "";

  const prompt = `You are an autopilot assistant monitoring a Kanban CC (project manager AI) that manages a software project.

## Project Goal
${state.goal}

## Recent Kanban CC Terminal Output (last ~4000 chars)
\`\`\`
${recentOutput}
\`\`\`
${lastMsgContext}
## Your Task
The Kanban CC has been idle (no terminal output) for ${state.idleTimeout} seconds.
Decide whether to nudge it or leave it alone.

Respond with "SKIP" (exactly, nothing else) if ANY of these are true:
- The CC is clearly waiting for the HUMAN USER to provide input/requirements/decisions
- The CC just asked the user a question and is waiting for an answer
- All tasks are done and there's nothing actionable without new user direction
- You already sent a similar message and the situation hasn't changed

Otherwise, send a concise nudge (1-3 sentences). Consider:
- Is it idle with pending work? → Remind it of the goal and tell it to check the board
- Is it asking a question you can answer? → Answer it based on the project goal
- Is it stuck or erroring? → Suggest a fix or alternative approach
- Did it just finish something? → Tell it to check what's next on the board`;

  try {
    const { stdout } = await exec("claude", ["-p", prompt], {
      timeout: 30_000,
      env: { ...process.env },
    });

    const message = stdout.trim();
    if (!message || message === "SKIP") {
      state.consecutiveSkips++;
      console.log(`[pilot] Skipping nudge for ${state.projectId} (${state.consecutiveSkips} consecutive skips)`);
    } else {
      console.log(`[pilot] Nudging Kanban CC for ${state.projectId}: ${message.slice(0, 80)}...`);
      sendToKanbanCC(state.projectId, message);
      state.lastNudge = new Date().toISOString();
      state.lastNudgeMessage = message;
      state.consecutiveSkips = 0;
    }
  } catch (err) {
    console.warn(`[pilot] claude -p failed for ${state.projectId}:`, err);
  }

  state.nudging = false;

  // Exponential backoff on consecutive skips: idle timeout * 2^skips (capped at 5 min)
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
  // Stop existing pilot if any
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

  // Listen to PTY output — reset idle timer on every output
  const key = `kanban:${projectId}`;
  state.unsubscribe = onPTYOutput(key, () => resetIdleTimer(state));

  pilots.set(projectId, state);
  await db.savePilotState(projectId, { goal, idleTimeout });
  broadcastEvent("pilot:status_changed", projectId, { active: true, goal });

  // Start the idle timer
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
      // Keep in Redis — will be restored when Kanban CC starts
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
