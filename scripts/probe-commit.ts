/**
 * Capture one commit, then put the checkout back. Bisecting a visual regression
 * by hand means checkout → reinstall-if-needed → restart the warm servers →
 * shoot → restore, and skipping any step yields a shot that is not the commit
 * you named. This runs the whole sequence per probe and always restores the ref
 * it started on, including on failure.
 *
 *   bun run probe <commit> [-- <shoot args>]
 *   bun run probe 7a6de492 -- the-robots --mode play --settle 4000
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { shortRevision } from "./captureRevision";

const HELP = `bun run probe <commit> [-- <shoot args>]

Captures <commit> into shots/probe-<commit>.png and restores your original ref.

  --out <path>   explicit output path (default shots/probe-<short>.png)
  --help         show this text

Everything after -- is passed to shoot verbatim, so any shoot flag works:
  bun run probe b523a6f7 -- the-robots --mode play --look 40,120 --settle 4000
`;

function git(args: string[], repoRoot: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function gitOrThrow(args: string[], repoRoot: string): string {
  const result = git(args, repoRoot);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

/** The ref to return to: the branch name when on one, otherwise the detached commit. */
export function restoreTarget(branch: string, head: string): string {
  return branch === "HEAD" || branch.length === 0 ? head : branch;
}

/** Reinstalling is only needed when the probed commit moves the dependency graph. */
export function lockfileChanged(diffNames: string): boolean {
  return diffNames
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line === "bun.lock" || line === "bun.lockb" || line === "package.json" || line.endsWith("/package.json"));
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    process.exit(argv.length === 0 ? 2 : 0);
  }

  const separator = argv.indexOf("--");
  const own = separator === -1 ? argv : argv.slice(0, separator);
  const shootArgs = separator === -1 ? [] : argv.slice(separator + 1);
  const commit = own.find((value) => !value.startsWith("--"));
  if (commit === undefined) {
    console.error("probe: name the commit to capture");
    process.exit(2);
  }
  const outFlag = own.indexOf("--out");
  const explicitOut = outFlag === -1 ? undefined : own[outFlag + 1];

  const repoRoot = gitOrThrow(["rev-parse", "--show-toplevel"], process.cwd());

  const dirty = gitOrThrow(["status", "--porcelain"], repoRoot);
  if (dirty.length > 0) {
    console.error("probe: the working tree has uncommitted changes — commit or stash them first, a probe checks out another commit");
    process.exit(1);
  }

  const target = gitOrThrow(["rev-parse", commit], repoRoot);
  const startHead = gitOrThrow(["rev-parse", "HEAD"], repoRoot);
  const startBranch = gitOrThrow(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  const restore = restoreTarget(startBranch, startHead);

  const out = explicitOut ?? resolve(repoRoot, "shots", `probe-${shortRevision(target)}.png`);

  let exitCode = 0;
  try {
    console.error(`probe: checking out ${shortRevision(target)} (will restore ${restore})`);
    gitOrThrow(["checkout", "--detach", target], repoRoot);

    if (lockfileChanged(gitOrThrow(["diff", "--name-only", startHead, target], repoRoot))) {
      console.error("probe: the probed commit moves package.json/bun.lock — reinstalling");
      const install = spawnSync("bun", ["install"], { cwd: repoRoot, stdio: "inherit", windowsHide: true });
      if (install.status !== 0) throw new Error("probe: bun install failed on the probed commit");
    }

    // shoot retires any warm Vite whose commit no longer matches (see captureRevision.ts),
    // so the probe never has to stop the daemon or clear caches by hand.
    const shot = spawnSync("bun", ["run", "shoot", ...shootArgs, "--out", out], {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true,
    });
    exitCode = shot.status ?? 1;
    console.error(exitCode === 0 ? `probe: ${shortRevision(target)} → ${out}` : `probe: shoot failed for ${shortRevision(target)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    exitCode = 1;
  } finally {
    const back = git(["checkout", restore], repoRoot);
    if (back.status !== 0) {
      console.error(`probe: COULD NOT RESTORE ${restore} — you are detached at ${shortRevision(target)}: ${back.stderr.trim()}`);
      exitCode = 1;
    } else {
      console.error(`probe: restored ${restore}`);
    }
  }
  process.exit(exitCode);
}
