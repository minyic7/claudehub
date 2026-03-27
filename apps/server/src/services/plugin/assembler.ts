import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const PLUGINS_DIR = path.join(import.meta.dirname, "..", "..", "plugins");

/**
 * Assemble a plugin directory for Kanban CC.
 * Copies all kanban skills + shared hooks into a temp directory.
 */
export async function assembleKanbanPluginDir(projectId: string): Promise<string> {
  const targetDir = path.join(os.tmpdir(), `claudehub-kanban-${projectId}`);
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(path.join(targetDir, "skills"), { recursive: true });
  await fs.mkdir(path.join(targetDir, "hooks"), { recursive: true });

  // Copy all kanban skills
  const kanbanSkillsDir = path.join(PLUGINS_DIR, "kanban", "skills");
  await copyDirRecursive(kanbanSkillsDir, path.join(targetDir, "skills"));

  // Copy shared hooks
  const sharedHooksDir = path.join(PLUGINS_DIR, "shared", "hooks");
  await copyDirRecursive(sharedHooksDir, path.join(targetDir, "hooks"));

  return targetDir;
}

/**
 * Assemble a plugin directory for Ticket CC.
 * Copies selected ticket skills + shared hooks into a temp directory.
 * @param skillNames — which skills to include (default: all)
 */
export async function assembleTicketPluginDir(
  projectId: string,
  ticketNumber: number,
  skillNames?: string[],
): Promise<string> {
  const targetDir = path.join(os.tmpdir(), `claudehub-ticket-${projectId}-${ticketNumber}`);
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(path.join(targetDir, "skills"), { recursive: true });
  await fs.mkdir(path.join(targetDir, "hooks"), { recursive: true });

  const ticketSkillsDir = path.join(PLUGINS_DIR, "ticket", "skills");

  if (skillNames && skillNames.length > 0) {
    // Copy only selected skills
    for (const name of skillNames) {
      const src = path.join(ticketSkillsDir, name);
      const dest = path.join(targetDir, "skills", name);
      // Validate: no path traversal
      if (!path.resolve(src).startsWith(ticketSkillsDir + path.sep)) {
        console.warn(`Skill "${name}" rejected: path traversal detected`);
        continue;
      }
      try {
        await copyDirRecursive(src, dest);
      } catch {
        console.warn(`Skill "${name}" not found, skipping`);
      }
    }
  } else {
    // Copy all ticket skills
    await copyDirRecursive(ticketSkillsDir, path.join(targetDir, "skills"));
  }

  // Copy shared hooks
  const sharedHooksDir = path.join(PLUGINS_DIR, "shared", "hooks");
  await copyDirRecursive(sharedHooksDir, path.join(targetDir, "hooks"));

  return targetDir;
}

/**
 * List available skill names for a given CC type.
 */
export async function listAvailableSkills(ccType: "kanban" | "ticket"): Promise<string[]> {
  const skillsDir = path.join(PLUGINS_DIR, ccType, "skills");
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Clean up assembled plugin directory.
 */
export async function cleanupPluginDir(targetDir: string): Promise<void> {
  try {
    await fs.rm(targetDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/** Recursively copy a directory */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
