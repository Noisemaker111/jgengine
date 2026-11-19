import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const root = join(import.meta.dir, "..");
export const repoRoot = join(root, "..");

export function repoCommit(dir = repoRoot): string {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  return head.status === 0 ? head.stdout.trim() : "unknown";
}
