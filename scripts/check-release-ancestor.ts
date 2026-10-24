/**
 * Refuses a release or publish from a commit that does not contain the branch everything lands on.
 * The release path (`scripts/release.ts`) and the publish workflow both call this, so a stale
 * branch is a hard stop instead of a habit.
 *
 *   bun scripts/check-release-ancestor.ts
 *   bun scripts/check-release-ancestor.ts --ref origin/beta --target HEAD --cwd <repo>
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { ancestorFailureLines, checkReleaseAncestor } from "./release";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};

const root = fileURLToPath(new URL("..", import.meta.url));
const cwd = argValue("--cwd") ?? root;
const ref = argValue("--ref") ?? "origin/beta";
const target = argValue("--target") ?? "HEAD";

if (!args.includes("--no-fetch") && ref.startsWith("origin/")) {
  spawnSync("git", ["fetch", "--quiet", "origin", ref.slice("origin/".length)], { cwd, stdio: "ignore", timeout: 60_000 });
}

const report = checkReleaseAncestor({ cwd, ref, target });
if (report.ok) {
  console.log(`check-release-ancestor ok: ${target} (${report.targetSha?.slice(0, 8)}) contains ${ref} (${report.refSha?.slice(0, 8)})`);
} else {
  for (const line of ancestorFailureLines(report)) console.error(line);
  process.exit(1);
}
