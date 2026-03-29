import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRingBuffer } from "../../lib/pty.js";
import { sendToKanbanCC, isKanbanCCRunning } from "./manager.js";
import { broadcastEvent } from "../../lib/broadcast.js";

const exec = promisify(execFile);

interface PilotState {
  projectId: string;
  goal: string;
  minInterval: number; // seconds
  maxInterval: number; // seconds
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  lastNudge: string | null;
}

const pilots = new Map<string, PilotState>();

function randomInterval(min: number, max: number): number {
  return (min + Math.random() * (max - min)) * 1000;
}

/** Extract last N lines of text from ring buffer */
function getRecentOutput(projectId: string, maxChars = 4000): string {
  const key = `kanban:${projectId}`;
  const ringBuffer = getRingBuffer(key);
  if (!ringBuffer) return "(no terminal output available)";
  const history = ringBuffer.getHistory().toString("utf-8");
  // Take last maxChars to stay within prompt limits
  if (history.length > maxChars) {
    return history.slice(-maxChars);
  }
  return history || "(terminal is empty)";
}

async function nudge(state: PilotState): Promise<void> {
  if (!state.running) return;

  if (!isKanbanCCRunning(state.projectId)) {
    console.log(`[pilot] Kanban CC not running for ${state.projectId}, skipping nudge`);
    scheduleNext(state);
    return;
  }

  const recentOutput = getRecentOutput(state.projectId);

  const prompt = `You are an autopilot assistant monitoring a Kanban CC (project manager AI) that manages a software project.

## Project Goal
${state.goal}

## Recent Kanban CC Terminal Output (last ~4000 chars)
\`\`\`
${recentOutput}
\`\`\`

## Your Task
Based on the terminal output, decide what to say to nudge the Kanban CC. Consider:
- Is it idle/waiting? → Remind it of the goal and tell it to check the board and start working
- Is it actively working? → Just say "keep going" or provide brief encouragement
- Is it asking a question? → Answer it based on the project goal
- Is it stuck or erroring? → Suggest a fix or alternative approach
- Did it just finish something? → Tell it to check what's next on the board

Respond with ONLY the message to send to the Kanban CC. Keep it concise (1-3 sentences). If it's actively busy and doesn't need intervention, respond with exactly "SKIP" (nothing else).`;

  try {
    const { stdout } = await exec("claude", ["-p", prompt], {
      timeout: 30_000,
      env: { ...process.env },
    });

    const message = stdout.trim();
    if (!message || message === "SKIP") {
      console.log(`[pilot] Kanban CC is busy, skipping nudge for ${state.projectId}`);
    } else {
      console.log(`[pilot] Nudging Kanban CC for ${state.projectId}: ${message.slice(0, 80)}...`);
      sendToKanbanCC(state.projectId, message);
      state.lastNudge = new Date().toISOString();
    }
  } catch (err) {
    console.warn(`[pilot] claude -p failed for ${state.projectId}:`, err);
  }

  scheduleNext(state);
}

function scheduleNext(state: PilotState): void {
  if (!state.running) return;
  const delay = randomInterval(state.minInterval, state.maxInterval);
  console.log(`[pilot] Next check for ${state.projectId} in ${Math.round(delay / 1000)}s`);
  state.timer = setTimeout(() => nudge(state), delay);
}

export function startPilot(
  projectId: string,
  goal: string,
  minInterval = 30,
  maxInterval = 120,
): void {
  // Stop existing pilot if any
  stopPilot(projectId);

  const state: PilotState = {
    projectId,
    goal,
    minInterval,
    maxInterval,
    timer: null,
    running: true,
    lastNudge: null,
  };

  pilots.set(projectId, state);
  broadcastEvent("pilot:status_changed", projectId, { active: true, goal });

  // First nudge immediately
  nudge(state);
}

export function stopPilot(projectId: string): void {
  const state = pilots.get(projectId);
  if (state) {
    state.running = false;
    if (state.timer) clearTimeout(state.timer);
    pilots.delete(projectId);
    broadcastEvent("pilot:status_changed", projectId, { active: false });
  }
}

export function getPilotStatus(projectId: string): {
  active: boolean;
  goal?: string;
  minInterval?: number;
  maxInterval?: number;
  lastNudge?: string | null;
} {
  const state = pilots.get(projectId);
  if (!state) return { active: false };
  return {
    active: true,
    goal: state.goal,
    minInterval: state.minInterval,
    maxInterval: state.maxInterval,
    lastNudge: state.lastNudge,
  };
}

/** Stop all pilots (for graceful shutdown) */
export function stopAllPilots(): void {
  for (const [projectId] of pilots) {
    stopPilot(projectId);
  }
}
