import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** The games/ directory. */
export const root = join(import.meta.dir, "..");
/** The repository root: the engine every game runs. */
export const repoRoot = join(root, "..");

/** The commit the games and the engine share, or "unknown" outside a git checkout. */
export function repoCommit(dir = repoRoot): string {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  return head.status === 0 ? head.stdout.trim() : "unknown";
}
