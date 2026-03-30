import { Redis } from "ioredis";
import type {
  Project,
  Ticket,
  Settings,
  TicketStatus,
  TicketCCStatus,
} from "@claudehub/shared";
import { DEFAULT_MAX_CONCURRENT_TICKETS } from "@claudehub/shared";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379/0";
export const redis = new Redis(redisUrl);

// ── Projects ──

export async function getNextProjectId(): Promise<string> {
  const num = await redis.incr("project:next_id");
  return `PROJ-${num}`;
}

export async function saveProject(project: Project): Promise<void> {
  const key = `project:${project.id}`;
  await redis.hset(key, flattenForRedis(project).toSet);
  await redis.sadd("projects", project.id);
  // Reverse lookup: repo → projectId
  await redis.set(`repo:${project.owner}/${project.repo}`, project.id);
}

export async function getProject(id: string): Promise<Project | null> {
  const data = await redis.hgetall(`project:${id}`);
  if (!data || !data.id) return null;
  return parseProject(data);
}

export async function getAllProjects(): Promise<Project[]> {
  const ids = await redis.smembers("projects");
  const projects: Project[] = [];
  for (const id of ids) {
    const p = await getProject(id);
    if (p) projects.push(p);
  }
  return projects;
}

export async function updateProject(
  id: string,
  updates: Partial<Project>,
): Promise<Project | null> {
  const key = `project:${id}`;
  const exists = await redis.exists(key);
  if (!exists) return null;
  const { toSet } = flattenForRedis(updates);
  if (Object.keys(toSet).length > 0) {
    await redis.hset(key, toSet);
  }
  return getProject(id);
}

export async function deleteProject(id: string): Promise<boolean> {
  const project = await getProject(id);
  if (!project) return false;

  // Clean up tickets
  const ticketNumbers = await redis.smembers(
    `project:${id}:tickets`,
  );
  for (const num of ticketNumbers) {
    await deleteTicketData(id, Number(num));
  }

  // Clean up project data
  await redis.del(`project:${id}`);
  await redis.del(`project:${id}:tickets`);
  await redis.del(`project:${id}:ticket:next_id`);
  await redis.srem("projects", id);
  await redis.del(`repo:${project.owner}/${project.repo}`);
  await redis.del(`cc:kanban:${id}`);
  await redis.del(`merge:lock:${id}`);
  await redis.del(`project:lock:${id}`);

  return true;
}

export async function getProjectByRepo(
  owner: string,
  repo: string,
): Promise<Project | null> {
  const projectId = await redis.get(`repo:${owner}/${repo}`);
  if (!projectId) return null;
  return getProject(projectId);
}

// ── Tickets ──

export async function getNextTicketNumber(
  projectId: string,
): Promise<number> {
  return redis.incr(`project:${projectId}:ticket:next_id`);
}

export async function saveTicket(ticket: Ticket): Promise<void> {
  const key = `ticket:${ticket.projectId}:${ticket.number}`;
  await redis.hset(key, flattenForRedis(ticket).toSet);
  await redis.sadd(`project:${ticket.projectId}:tickets`, String(ticket.number));
  // Reverse lookups
  await redis.set(
    `branch:${ticket.projectId}:${ticket.branchName}`,
    String(ticket.number),
  );
  if (ticket.githubIssueNumber) {
    await redis.set(
      `issue:${ticket.projectId}:${ticket.githubIssueNumber}`,
      String(ticket.number),
    );
  }
}

export async function getTicket(
  projectId: string,
  number: number,
): Promise<Ticket | null> {
  const data = await redis.hgetall(`ticket:${projectId}:${number}`);
  if (!data || !data.id) return null;
  return parseTicket(data);
}

export async function getProjectTickets(
  projectId: string,
  filters?: { status?: TicketStatus; priority?: number },
): Promise<Ticket[]> {
  const numbers = await redis.smembers(`project:${projectId}:tickets`);
  const tickets: Ticket[] = [];
  for (const num of numbers) {
    const t = await getTicket(projectId, Number(num));
    if (!t) continue;
    if (filters?.status && t.status !== filters.status) continue;
    if (filters?.priority !== undefined && t.priority !== filters.priority)
      continue;
    tickets.push(t);
  }
  return tickets.sort((a, b) => a.priority - b.priority);
}

export async function updateTicket(
  projectId: string,
  number: number,
  updates: Partial<Ticket>,
): Promise<Ticket | null> {
  const key = `ticket:${projectId}:${number}`;
  const exists = await redis.exists(key);
  if (!exists) return null;
  updates.updatedAt = new Date().toISOString();
  const { toSet, toDel } = flattenForRedis(updates);
  if (Object.keys(toSet).length > 0) {
    await redis.hset(key, toSet);
  }
  if (toDel.length > 0) {
    await redis.hdel(key, ...toDel);
  }
  return getTicket(projectId, number);
}

async function deleteTicketData(
  projectId: string,
  number: number,
): Promise<void> {
  const ticket = await getTicket(projectId, number);
  if (!ticket) return;

  await redis.del(`ticket:${projectId}:${number}`);
  await redis.srem(`project:${projectId}:tickets`, String(number));
  await redis.del(`branch:${projectId}:${ticket.branchName}`);
  if (ticket.githubIssueNumber) {
    await redis.del(`issue:${projectId}:${ticket.githubIssueNumber}`);
  }
  await redis.del(`cc:ticket:${projectId}:${number}`);
  // Remove from queue if present
  await redis.zrem("cc:queue", `${projectId}:${number}`);
  await redis.srem("cc:running", `${projectId}:${number}`);
}

export async function deleteTicket(
  projectId: string,
  number: number,
): Promise<boolean> {
  const ticket = await getTicket(projectId, number);
  if (!ticket) return false;
  if (ticket.status === "merged") return false;
  await deleteTicketData(projectId, number);
  return true;
}

export async function getTicketByBranch(
  projectId: string,
  branchName: string,
): Promise<Ticket | null> {
  const num = await redis.get(`branch:${projectId}:${branchName}`);
  if (!num) return null;
  return getTicket(projectId, Number(num));
}

export async function getTicketByIssue(
  projectId: string,
  issueNumber: number,
): Promise<Ticket | null> {
  const num = await redis.get(`issue:${projectId}:${issueNumber}`);
  if (!num) return null;
  return getTicket(projectId, Number(num));
}

// ── Settings ──

export async function getSettings(): Promise<Settings> {
  const data = await redis.hgetall("settings");
  return {
    anthropicApiKey: data.anthropicApiKey || undefined,
    maxConcurrentTickets: data.maxConcurrentTickets
      ? Number(data.maxConcurrentTickets)
      : DEFAULT_MAX_CONCURRENT_TICKETS,
  };
}

export async function updateSettings(
  updates: Partial<Settings>,
): Promise<Settings> {
  const toSet: Record<string, string> = {};
  if (updates.anthropicApiKey !== undefined)
    toSet.anthropicApiKey = updates.anthropicApiKey;
  if (updates.maxConcurrentTickets !== undefined)
    toSet.maxConcurrentTickets = String(updates.maxConcurrentTickets);
  if (Object.keys(toSet).length > 0) {
    await redis.hset("settings", toSet);
  }
  return getSettings();
}

// ── CC Status ──

export async function setKanbanCCStatus(
  projectId: string,
  status: Record<string, string>,
): Promise<void> {
  await redis.hset(`cc:kanban:${projectId}`, status);
}

export async function getKanbanCCStatus(
  projectId: string,
): Promise<Record<string, string>> {
  return redis.hgetall(`cc:kanban:${projectId}`);
}

export async function setTicketCCStatus(
  projectId: string,
  number: number,
  status: Record<string, string>,
): Promise<void> {
  await redis.hset(`cc:ticket:${projectId}:${number}`, status);
}

export async function getTicketCCStatus(
  projectId: string,
  number: number,
): Promise<Record<string, string>> {
  return redis.hgetall(`cc:ticket:${projectId}:${number}`);
}

// ── CC Queue ──

export async function addToQueue(
  projectId: string,
  number: number,
  priority: number,
): Promise<void> {
  // Composite score: priority * 1e13 + timestamp (ms)
  // This ensures same-priority items sort by creation time (FIFO).
  // Priority range [0..100], timestamp ~1.7e12 → no overflow in float64.
  const score = priority * 1e13 + Date.now();
  await redis.zadd("cc:queue", score, `${projectId}:${number}`);
}

export async function removeFromQueue(
  projectId: string,
  number: number,
): Promise<void> {
  await redis.zrem("cc:queue", `${projectId}:${number}`);
}

export async function getQueuedItems(): Promise<string[]> {
  return redis.zrange("cc:queue", 0, -1);
}

export async function addToRunning(
  projectId: string,
  number: number,
): Promise<void> {
  await redis.sadd("cc:running", `${projectId}:${number}`);
}

export async function removeFromRunning(
  projectId: string,
  number: number,
): Promise<void> {
  await redis.srem("cc:running", `${projectId}:${number}`);
}

export async function getRunningCount(): Promise<number> {
  return redis.scard("cc:running");
}

export async function getRunningItems(): Promise<string[]> {
  return redis.smembers("cc:running");
}

// ── Merge Lock ──

export async function acquireMergeLock(
  projectId: string,
  ttlSeconds = 120,
): Promise<boolean> {
  const result = await redis.set(
    `merge:lock:${projectId}`,
    "1",
    "EX",
    ttlSeconds,
    "NX",
  );
  return result === "OK";
}

export async function renewMergeLock(
  projectId: string,
  ttlSeconds = 120,
): Promise<boolean> {
  const result = await redis.expire(`merge:lock:${projectId}`, ttlSeconds);
  return result === 1;
}

export async function releaseMergeLock(projectId: string): Promise<void> {
  await redis.del(`merge:lock:${projectId}`);
}

export async function hasMergeLock(projectId: string): Promise<boolean> {
  return (await redis.exists(`merge:lock:${projectId}`)) === 1;
}

// ── Project Write Lock ──

export async function acquireProjectLock(
  projectId: string,
  ttlSeconds = 30,
): Promise<boolean> {
  const result = await redis.set(
    `project:lock:${projectId}`,
    "1",
    "EX",
    ttlSeconds,
    "NX",
  );
  return result === "OK";
}

export async function releaseProjectLock(projectId: string): Promise<void> {
  await redis.del(`project:lock:${projectId}`);
}

// ── Merge Progress ──

export async function setMergeProgress(
  projectId: string,
  number: number,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const data = JSON.stringify({ number, status, ...extra, updatedAt: new Date().toISOString() });
  await redis.set(`merge:progress:${projectId}`, data, "EX", 3600);
}

export async function getMergeProgress(
  projectId: string,
): Promise<Record<string, unknown> | null> {
  const data = await redis.get(`merge:progress:${projectId}`);
  if (!data) return null;
  return JSON.parse(data);
}

export async function clearMergeProgress(projectId: string): Promise<void> {
  await redis.del(`merge:progress:${projectId}`);
}

// ── Pilot State ──

export async function savePilotState(
  projectId: string,
  state: { goal: string; idleTimeout: number },
): Promise<void> {
  await redis.set(`pilot:${projectId}`, JSON.stringify(state));
}

export async function getPilotState(
  projectId: string,
): Promise<{ goal: string; idleTimeout: number } | null> {
  const data = await redis.get(`pilot:${projectId}`);
  if (!data) return null;
  return JSON.parse(data);
}

export async function deletePilotState(projectId: string): Promise<void> {
  await redis.del(`pilot:${projectId}`);
}

export async function getAllPilotStates(): Promise<
  { projectId: string; goal: string; idleTimeout: number }[]
> {
  const keys = await redis.keys("pilot:*");
  const results: { projectId: string; goal: string; idleTimeout: number }[] = [];
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      const projectId = key.replace("pilot:", "");
      results.push({ projectId, ...JSON.parse(data) });
    }
  }
  return results;
}

// ── Helpers ──

function flattenForRedis(obj: object): { toSet: Record<string, string>; toDel: string[] } {
  const toSet: Record<string, string> = {};
  const toDel: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      toDel.push(key);
      continue;
    }
    if (Array.isArray(value)) {
      toSet[key] = JSON.stringify(value);
    } else if (typeof value === "object") {
      toSet[key] = JSON.stringify(value);
    } else {
      toSet[key] = String(value);
    }
  }
  return { toSet, toDel };
}

function parseProject(data: Record<string, string>): Project {
  return {
    id: data.id,
    name: data.name,
    githubUrl: data.githubUrl,
    owner: data.owner,
    repo: data.repo,
    githubToken: data.githubToken,
    baseBranch: data.baseBranch,
    webhookId: data.webhookId || undefined,
    webhookSecret: data.webhookSecret,
    createdAt: data.createdAt,
  };
}

function parseTicket(data: Record<string, string>): Ticket {
  return {
    id: data.id,
    projectId: data.projectId,
    number: Number(data.number),
    title: data.title,
    description: data.description,
    type: data.type as Ticket["type"],
    status: data.status as TicketStatus,
    ccStatus: (data.ccStatus || "idle") as TicketCCStatus,
    priority: Number(data.priority),
    branchName: data.branchName,
    worktreePath: data.worktreePath,
    dependencies: data.dependencies ? JSON.parse(data.dependencies) : [],
    githubIssueNumber: Number(data.githubIssueNumber),
    githubPrNumber: data.githubPrNumber
      ? Number(data.githubPrNumber)
      : undefined,
    taskBrief: data.taskBrief || undefined,
    returnReason: (data.returnReason as Ticket["returnReason"]) || undefined,
    mergeStep: data.mergeStep || undefined,
    ciPassed: data.ciPassed !== undefined ? data.ciPassed === "true" : undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}
