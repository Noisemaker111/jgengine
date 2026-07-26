/**
 * Capture servers are warm and long-lived, but their identity was only the
 * checkout *path*. A `git checkout` of another commit moves hundreds of source
 * files under a running Vite, whose module graph and dep cache still describe
 * the previous commit — so the next shot renders a mixture of both, or times out
 * waiting for a frame that never becomes honest. Keying a warm server to the
 * revision it booted from makes that state unreachable: the drifted server is
 * retired and a clean one takes its place.
 *
 * Uncommitted edits deliberately do NOT count as drift — that is HMR's job, and
 * recycling on every keystroke would destroy the warm loop.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Commit the checkout currently points at, or undefined outside a git tree. */
export function headRevision(cwd = process.cwd()): string | undefined {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      timeout: 5_000,
    });
    if (result.status !== 0) return undefined;
    const head = result.stdout.trim();
    return head.length > 0 ? head : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when a warm server booted from a different commit than the tree now holds.
 * An unknown revision on either side is not drift: servers predating this field,
 * and non-git checkouts, keep the old reuse behaviour instead of thrashing.
 */
export function revisionDrifted(recorded: string | undefined, current: string | undefined): boolean {
  if (recorded === undefined || current === undefined) return false;
  return recorded !== current;
}

/** Vite dep-optimizer caches that outlive a server restart and must go with it. */
export function viteCacheDirs(repoRoot: string): string[] {
  return [
    join(repoRoot, "node_modules", ".vite"),
    join(repoRoot, "apps", "dev", "node_modules", ".vite"),
    join(repoRoot, "apps", "web", "node_modules", ".vite"),
  ];
}

/** Remove the dep-optimizer caches; returns the directories actually deleted. */
export function clearViteCaches(repoRoot: string): string[] {
  const removed: string[] = [];
  for (const dir of viteCacheDirs(repoRoot)) {
    if (!existsSync(dir)) continue;
    rmSync(dir, { recursive: true, force: true });
    removed.push(dir);
  }
  return removed;
}

export function shortRevision(revision: string | undefined): string {
  return revision === undefined ? "unknown" : revision.slice(0, 8);
}
