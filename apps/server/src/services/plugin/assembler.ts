import fs from "node:fs/promises";
import path from "node:path";

const PLUGINS_DIR = path.join(
  import.meta.dirname,
  "..",
  "..",
  "plugins",
);

/**
 * Assemble a plugin directory for a CC instance.
 * Copies selected plugin files into a temp directory.
 */
export async function assemblePluginDir(
  targetDir: string,
  pluginNames: string[],
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });

  for (const name of pluginNames) {
    // Validate: no path traversal (e.g. "../../../etc/passwd")
    const resolved = path.resolve(PLUGINS_DIR, name);
    if (!resolved.startsWith(PLUGINS_DIR + path.sep) && resolved !== PLUGINS_DIR) {
      console.warn(`Plugin "${name}" rejected: path traversal detected`);
      continue;
    }
    const dest = path.join(targetDir, path.basename(name));
    try {
      await fs.copyFile(resolved, dest);
    } catch {
      console.warn(`Plugin "${name}" not found at ${resolved}, skipping`);
    }
  }
}

/** List available plugins */
export async function listPlugins(): Promise<string[]> {
  try {
    const files = await fs.readdir(PLUGINS_DIR);
    return files.filter((f) => f.endsWith(".md") || f.endsWith(".json"));
  } catch {
    return [];
  }
}
