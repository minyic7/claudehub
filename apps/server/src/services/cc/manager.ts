import {
  spawnPTY,
  getPTY,
  killPTY,
  writeToPTY,
  getAllPTYKeys,
} from "../../lib/pty.js";
import { broadcastTerminalOutput, broadcastEvent } from "../../lib/broadcast.js";
import * as db from "../redis.js";
import type { Ticket } from "@claudehub/shared";
import {
  assembleKanbanPluginDir,
  assembleTicketPluginDir,
  cleanupPluginDir,
} from "../plugin/assembler.js";
import os from "node:os";

const CLAUDE_BIN = "claude";
const API_BASE = `http://localhost:${process.env.PORT || 7700}`;

const MAX_RESTART_ATTEMPTS = 5;
const INITIAL_RESTART_DELAY_MS = 2000;

// Track restart attempts per CC key
const restartAttempts = new Map<string, number>();
// Track manually stopped CCs to prevent auto-restart after kill
const manuallyStopped = new Set<string>();
// Single-project CC limit: only one project can have running CCs at a time
let activeProjectId: string | null = null;

function getRestartDelay(key: string): number | null {
  const attempts = (restartAttempts.get(key) || 0) + 1;
  if (attempts > MAX_RESTART_ATTEMPTS) {
    restartAttempts.delete(key);
    return null; // Give up
  }
  restartAttempts.set(key, attempts);
  // Exponential backoff: 2s, 4s, 8s, 16s, 32s
  return INITIAL_RESTART_DELAY_MS * Math.pow(2, attempts - 1);
}

function resetRestartAttempts(key: string): void {
  restartAttempts.delete(key);
}

// Serialize scheduleNext() calls to prevent double-starts
let scheduling = false;
const schedulePending = { value: false };

/** Kill all CC processes (for graceful shutdown) */
export function shutdownAll(): void {
  const keys = getAllPTYKeys();
  for (const key of keys) {
    killPTY(key);
  }
  activeProjectId = null;
  console.log(`Shut down ${keys.length} CC processes`);
}

/** Stop all CCs (kanban + tickets) for a given project */
async function stopAllProjectCCs(projectId: string): Promise<void> {
  // Stop kanban CC
  if (isKanbanCCRunning(projectId)) {
    await stopKanbanCC(projectId);
  }

  // Stop all ticket CCs for this project
  const keys = getAllPTYKeys();
  const prefix = `ticket:${projectId}:`;
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      const number = Number(key.slice(prefix.length));
      await stopTicketCC(projectId, number);
    }
  }

  // Clear queued tickets for this project
  const queued = await db.getQueuedItems();
  for (const item of queued) {
    const [qProjectId, numStr] = item.split(":");
    if (qProjectId === projectId) {
      const num = Number(numStr);
      await db.removeFromQueue(projectId, num);
      await db.updateTicket(projectId, num, { ccStatus: "idle" });
      await db.setTicketCCStatus(projectId, num, {
        ccStatus: "idle",
        lastActiveAt: new Date().toISOString(),
      });
    }
  }
}

/** Ensure single-project limit: stop previous project's CCs if switching */
async function ensureSingleProject(projectId: string): Promise<void> {
  if (activeProjectId && activeProjectId !== projectId) {
    console.log(`Switching active project from ${activeProjectId} to ${projectId}, stopping previous CCs...`);
    await stopAllProjectCCs(activeProjectId);
  }
  activeProjectId = projectId;
}

export function getActiveProjectId(): string | null {
  return activeProjectId;
}

// ── Kanban CC ──

export async function startKanbanCC(
  projectId: string,
  worktreePath: string,
  systemPrompt: string,
  env?: Record<string, string>,
  options?: { pluginDir?: string; mcpConfig?: string; resume?: boolean },
): Promise<{ pid: number }> {
  // Single-project limit: stop previous project's CCs if different
  await ensureSingleProject(projectId);

  const key = `kanban:${projectId}`;
  manuallyStopped.delete(key);
  const existing = getPTY(key);
  if (existing) {
    throw new Error("Kanban CC already running");
  }

  // Assemble kanban plugin directory
  let pluginDir: string | undefined;
  try {
    pluginDir = await assembleKanbanPluginDir(projectId);
  } catch (err) {
    console.warn("Failed to assemble kanban plugin dir:", err);
  }

  const args = [
    "--append-system-prompt",
    systemPrompt,
    "--setting-sources",
    "project,local",
    "--dangerously-skip-permissions",
    "--continue",
  ];
  if (pluginDir) args.push("--plugin-dir", pluginDir);
  if (options?.mcpConfig) args.push("--mcp-config", options.mcpConfig);

  // Inject env vars for plugin skills
  const project = await db.getProject(projectId);
  const ccEnv: Record<string, string> = {
    ...env,
    API_BASE,
    PROJECT_ID: projectId,
    BASE_BRANCH: project?.baseBranch || "main",
    WORKTREE_PATH: worktreePath,
  };

  const instance = spawnPTY(
    key,
    CLAUDE_BIN,
    args,
    worktreePath,
    ccEnv,
    (data) => {
      broadcastTerminalOutput(key, data);
    },
    async (code) => {
      console.log(`Kanban CC for ${projectId} exited with code ${code}`);
      // Clean up assembled plugin dir
      if (pluginDir) await cleanupPluginDir(pluginDir);
      // Skip status update if manually stopped (stopKanbanCC handles it)
      if (!manuallyStopped.has(key)) {
        await db.setKanbanCCStatus(projectId, {
          status: code === 0 ? "stopped" : "error",
          lastActiveAt: new Date().toISOString(),
        });
        broadcastEvent("kanban_cc:status_changed", projectId, {
          status: code === 0 ? "stopped" : "error",
        });
      }
      // Auto-restart on crash with backoff (skip if manually stopped)
      if (code !== 0 && !manuallyStopped.has(key)) {
        const delay = getRestartDelay(key);
        if (delay === null) {
          console.error(`Kanban CC for ${projectId} exceeded max restart attempts, giving up`);
          await db.setKanbanCCStatus(projectId, {
            status: "error",
            lastActiveAt: new Date().toISOString(),
          });
        } else {
          console.log(`Auto-restarting Kanban CC for ${projectId} in ${delay}ms (attempt ${restartAttempts.get(key)})...`);
          setTimeout(() => {
            startKanbanCC(projectId, worktreePath, systemPrompt, env, { resume: true }).catch(
              (err) => console.error("Failed to restart Kanban CC:", err),
            );
          }, delay);
        }
      } else {
        resetRestartAttempts(key);
      }
    },
  );

  // Only reset restart attempts on manual (non-resume) starts
  if (!options?.resume) resetRestartAttempts(key);

  await db.setKanbanCCStatus(projectId, {
    status: "running",
    pid: String(instance.pid),
    lastActiveAt: new Date().toISOString(),
  });

  broadcastEvent("kanban_cc:status_changed", projectId, {
    status: "running",
    pid: instance.pid,
  });

  return { pid: instance.pid };
}

export async function stopKanbanCC(projectId: string): Promise<void> {
  const key = `kanban:${projectId}`;
  manuallyStopped.add(key);
  resetRestartAttempts(key);
  killPTY(key);
  cleanupPluginDir(`${os.tmpdir()}/claudehub-kanban-${projectId}`);
  await db.setKanbanCCStatus(projectId, {
    status: "stopped",
    lastActiveAt: new Date().toISOString(),
  });
  broadcastEvent("kanban_cc:status_changed", projectId, {
    status: "stopped",
  });
}

export function sendToKanbanCC(projectId: string, message: string): boolean {
  return writeToPTY(`kanban:${projectId}`, message + "\n");
}

export function isKanbanCCRunning(projectId: string): boolean {
  return !!getPTY(`kanban:${projectId}`);
}

// ── Ticket CC ──

export async function startTicketCC(
  projectId: string,
  ticket: Ticket,
  systemPrompt: string,
  env?: Record<string, string>,
): Promise<{ pid: number; queued: boolean }> {
  // Single-project limit: stop previous project's CCs if different
  await ensureSingleProject(projectId);

  const settings = await db.getSettings();
  const runningCount = await db.getRunningCount();

  if (runningCount >= settings.maxConcurrentTickets) {
    // Queue it
    await db.addToQueue(projectId, ticket.number, ticket.priority);
    await db.updateTicket(projectId, ticket.number, { ccStatus: "queued" });
    await db.setTicketCCStatus(projectId, ticket.number, {
      ccStatus: "queued",
      lastActiveAt: new Date().toISOString(),
    });
    broadcastEvent("ticket:status_changed", projectId, {
      number: ticket.number,
      ccStatus: "queued",
    });
    return { pid: 0, queued: true };
  }

  return doStartTicketCC(projectId, ticket, systemPrompt, env);
}

async function doStartTicketCC(
  projectId: string,
  ticket: Ticket,
  systemPrompt: string,
  env?: Record<string, string>,
  options?: { pluginDir?: string; mcpConfig?: string; resume?: boolean },
): Promise<{ pid: number; queued: boolean }> {
  const key = `ticket:${projectId}:${ticket.number}`;
  manuallyStopped.delete(key);
  const existing = getPTY(key);
  if (existing) {
    throw new Error("Ticket CC already running");
  }

  // Assemble ticket plugin directory
  let pluginDir: string | undefined;
  try {
    pluginDir = await assembleTicketPluginDir(projectId, ticket.number);
  } catch (err) {
    console.warn(`Failed to assemble ticket plugin dir for #${ticket.number}:`, err);
  }

  const args = [
    "--append-system-prompt",
    systemPrompt,
    "--setting-sources",
    "project,local",
    "--dangerously-skip-permissions",
    "--continue",
  ];
  if (pluginDir) args.push("--plugin-dir", pluginDir);
  if (options?.mcpConfig) args.push("--mcp-config", options.mcpConfig);

  // Inject env vars for plugin skills and hooks
  const project = await db.getProject(projectId);
  const ccEnv: Record<string, string> = {
    ...env,
    API_BASE,
    PROJECT_ID: projectId,
    TICKET_NUMBER: String(ticket.number),
    BASE_BRANCH: project?.baseBranch || "main",
    WORKTREE_PATH: ticket.worktreePath,
  };

  const instance = spawnPTY(
    key,
    CLAUDE_BIN,
    args,
    ticket.worktreePath,
    ccEnv,
    (data) => {
      broadcastTerminalOutput(key, data);
    },
    async (code) => {
      console.log(
        `Ticket CC for ${projectId}#${ticket.number} exited with code ${code}`,
      );
      // Clean up assembled plugin dir
      if (pluginDir) await cleanupPluginDir(pluginDir);
      // Skip state updates if manually stopped (stopTicketCC handles it)
      if (manuallyStopped.has(key)) {
        scheduleNext();
        return;
      }
      await db.removeFromRunning(projectId, ticket.number);

      if (code !== 0) {
        // Crash — auto-restart with --resume, backoff, re-read fresh ticket data
        const delay = getRestartDelay(key);
        if (delay === null) {
          console.error(`Ticket CC for ${projectId}#${ticket.number} exceeded max restart attempts, giving up`);
          await db.setTicketCCStatus(projectId, ticket.number, {
            ccStatus: "idle",
            lastActiveAt: new Date().toISOString(),
          });
        } else {
          console.log(
            `Auto-restarting Ticket CC for ${projectId}#${ticket.number} in ${delay}ms (attempt ${restartAttempts.get(key)})...`,
          );
          setTimeout(async () => {
            const freshTicket = await db.getTicket(projectId, ticket.number);
            if (!freshTicket || freshTicket.status !== "in_progress") {
              resetRestartAttempts(key);
              return;
            }
            const freshPrompt = freshTicket.taskBrief ||
              `Work on ticket #${freshTicket.number}: ${freshTicket.title}\n\n${freshTicket.description}`;
            const settings = await db.getSettings();
            const freshEnv: Record<string, string> = {};
            if (settings.anthropicApiKey) freshEnv.ANTHROPIC_API_KEY = settings.anthropicApiKey;
            doStartTicketCC(projectId, freshTicket, freshPrompt, freshEnv, { resume: true }).catch((err) =>
              console.error("Failed to restart Ticket CC:", err),
            );
          }, delay);
        }
      } else {
        await db.setTicketCCStatus(projectId, ticket.number, {
          ccStatus: "idle",
          lastActiveAt: new Date().toISOString(),
        });
      }

      // Try to start next queued ticket
      scheduleNext();
    },
  );

  // Only reset restart attempts on non-resume starts
  if (!options?.resume) resetRestartAttempts(key);

  await db.addToRunning(projectId, ticket.number);
  await db.removeFromQueue(projectId, ticket.number);
  await db.updateTicket(projectId, ticket.number, { ccStatus: "running" });
  await db.setTicketCCStatus(projectId, ticket.number, {
    ccStatus: "running",
    pid: String(instance.pid),
    lastActiveAt: new Date().toISOString(),
  });

  broadcastEvent("ticket:status_changed", projectId, {
    number: ticket.number,
    ccStatus: "running",
  });

  return { pid: instance.pid, queued: false };
}

export async function stopTicketCC(projectId: string, number: number): Promise<void> {
  const key = `ticket:${projectId}:${number}`;
  manuallyStopped.add(key);
  resetRestartAttempts(key);
  killPTY(key);
  cleanupPluginDir(`${os.tmpdir()}/claudehub-ticket-${projectId}-${number}`);
  await db.removeFromRunning(projectId, number);
  await db.removeFromQueue(projectId, number);
  await db.updateTicket(projectId, number, { ccStatus: "idle" });
  await db.setTicketCCStatus(projectId, number, {
    ccStatus: "idle",
    lastActiveAt: new Date().toISOString(),
  });
}

export function sendToTicketCC(
  projectId: string,
  number: number,
  message: string,
): boolean {
  return writeToPTY(`ticket:${projectId}:${number}`, message + "\n");
}

export function isTicketCCRunning(
  projectId: string,
  number: number,
): boolean {
  return !!getPTY(`ticket:${projectId}:${number}`);
}

// ── Scheduling ──

export async function scheduleNext(): Promise<void> {
  // Serialize: if already scheduling, mark pending and return
  if (scheduling) {
    schedulePending.value = true;
    return;
  }
  scheduling = true;

  try {
    await doScheduleNext();
  } finally {
    scheduling = false;
    // If another call came in while we were scheduling, run again
    if (schedulePending.value) {
      schedulePending.value = false;
      await scheduleNext();
    }
  }
}

async function doScheduleNext(): Promise<void> {
  // Use iteration instead of recursion to avoid stack overflow with many invalid queue items
  const MAX_SKIP = 100;
  for (let i = 0; i < MAX_SKIP; i++) {
    const settings = await db.getSettings();
    const runningCount = await db.getRunningCount();

    if (runningCount >= settings.maxConcurrentTickets) return;

    const queued = await db.getQueuedItems();
    if (queued.length === 0) return;

    // First item has lowest priority score (highest priority)
    const next = queued[0];
    const [projectId, numStr] = next.split(":");
    const number = Number(numStr);

    const ticket = await db.getTicket(projectId, number);
    if (!ticket || ticket.status !== "in_progress") {
      await db.removeFromQueue(projectId, number);
      continue; // Try next one
    }

    const systemPrompt =
      ticket.taskBrief || `Work on ticket #${ticket.number}: ${ticket.title}\n\n${ticket.description}`;

    const env: Record<string, string> = {};
    if (settings.anthropicApiKey) {
      env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
    }

    try {
      await doStartTicketCC(projectId, ticket, systemPrompt, env);
    } catch (err) {
      console.error(`Failed to start queued ticket CC ${projectId}#${number}:`, err);
      // Remove from queue to prevent infinite retry of a broken ticket
      await db.removeFromQueue(projectId, number);
      await db.updateTicket(projectId, number, { ccStatus: "idle" });
      await db.setTicketCCStatus(projectId, number, {
        ccStatus: "idle",
        lastActiveAt: new Date().toISOString(),
      });
      continue; // Try next queued ticket
    }
    return; // Started one, done
  }
  console.warn("scheduleNext: skipped 100 invalid queue items, stopping");
}

/** Called on startup to recover running CCs */
export async function recoverOnStartup(): Promise<void> {
  console.log("Recovering CC processes...");

  // Recover Kanban CCs
  const allProjects = await db.getAllProjects();
  for (const project of allProjects) {
    const status = await db.getKanbanCCStatus(project.id);
    if (status.status === "running") {
      console.log(`Recovering Kanban CC for ${project.id}...`);
      const { addKanbanWorktree } = await import("../git/worktree.js");
      const { buildKanbanSystemPrompt } = await import("./kanbanCC.js");
      try {
        const worktreePath = await addKanbanWorktree(
          project.owner, project.repo, project.baseBranch,
        );
        const apiBaseUrl = `http://localhost:${process.env.PORT || 7700}`;
        const systemPrompt = buildKanbanSystemPrompt(project.id, project.name, apiBaseUrl);
        const settings = await db.getSettings();
        const env: Record<string, string> = {};
        if (settings.anthropicApiKey) env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
        await startKanbanCC(project.id, worktreePath, systemPrompt, env, { resume: true });

        // Send state summary so Kanban CC knows what happened during downtime
        const tickets = await db.getProjectTickets(project.id);
        const reviewing = tickets.filter((t) => t.status === "reviewing");
        const conflicts = tickets.filter((t) => t.returnReason === "conflict");
        const inProgress = tickets.filter((t) => t.status === "in_progress");
        const lines: string[] = ["[SYSTEM] Server restarted. Current board state:"];
        lines.push(`  Total tickets: ${tickets.length}`);
        if (reviewing.length > 0) {
          lines.push(`  Awaiting review: ${reviewing.map((t) => `#${t.number}`).join(", ")}`);
        }
        if (conflicts.length > 0) {
          lines.push(`  Rebase conflicts: ${conflicts.map((t) => `#${t.number}`).join(", ")}`);
        }
        if (inProgress.length > 0) {
          lines.push(`  In progress: ${inProgress.map((t) => `#${t.number}`).join(", ")}`);
        }
        // Retry sending state summary until CC PTY is ready (up to 15s)
        const msg = lines.join("\n");
        const pid = project.id;
        (async () => {
          for (let i = 0; i < 5; i++) {
            await new Promise((r) => setTimeout(r, 3000));
            if (sendToKanbanCC(pid, msg)) return;
          }
          console.warn(`Failed to send recovery state summary to Kanban CC for ${pid}`);
        })();
      } catch (err) {
        console.error(`Failed to recover Kanban CC for ${project.id}:`, err);
      }
    }
  }

  // Clear stale Ticket CC running state — processes are gone after restart
  const running = await db.getRunningItems();
  for (const item of running) {
    const [projectId, numStr] = item.split(":");
    await db.removeFromRunning(projectId, Number(numStr));
    // Re-queue them
    const ticket = await db.getTicket(projectId, Number(numStr));
    if (ticket && ticket.status === "in_progress") {
      await db.addToQueue(projectId, ticket.number, ticket.priority);
      await db.updateTicket(projectId, ticket.number, { ccStatus: "queued" });
      await db.setTicketCCStatus(projectId, ticket.number, {
        ccStatus: "queued",
        lastActiveAt: new Date().toISOString(),
      });
    }
  }

  // Start scheduling queued Ticket CCs
  await scheduleNext();
}

