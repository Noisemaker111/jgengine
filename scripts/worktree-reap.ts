// A lane's worktree is a full working copy, and a merged lane is a copy nobody
// will ever open again. Nothing removed those, so `.claude/worktrees` grew by
// about a gigabyte per lane until the disk filled, and a full disk is what leaves
// the next install half-linked. This reaps a worktree when its branch has reached
// `origin/beta` and its tree has nothing uncommitted; a lane that never committed
// goes once it has sat untouched past its grace, with no new files either.
// Committed work is never at risk: removing a worktree deletes files, not branches.
import { existsSync, readdirSync, realpathSync, renameSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

import { removeDirSync } from "./removeDir";
import { printHelpIfAsked } from "./script-help";
import { parseWorktreeList, type WorktreeRef } from "./worktree-doctor";

const WORKTREE_REAP_USAGE = {
  summary: "remove worktrees whose branch merged into origin/beta and whose tree is clean",
  usage: "bun run worktree reap [--dry-run] [--fetch]",
  flags: [
    { flag: "--dry-run", detail: "print what would go, remove nothing" },
    { flag: "--fetch", detail: "fetch origin/beta first, so a merge that just landed counts" },
    { flag: "--skip <path>", detail: "never remove this worktree (repeatable); the caller's own directory is always skipped" },
  ],
  example: "bun run worktree reap --dry-run",
} as const;

export interface ReapCandidate {
  path: string;
  name: string;
  branch: string;
  /**
   * The branch never moved from where it was created. Such a lane's only work can be new files git
   * does not track yet, so its tree must be clean of those too before it goes.
   */
  untouched: boolean;
}

/**
 * How long a lane with nothing committed is left for its session to start work. A lane created at the
 * beta tip reads as merged, so without a grace a second lane starting up deleted the first; without an
 * end to it, a lane abandoned before its first commit stayed forever.
 */
export const NEW_LANE_GRACE_MS = 60 * 60 * 1000;

export interface ReapSelection {
  reap: ReapCandidate[];
  kept: { name: string; reason: string }[];
}

function nameOf(path: string): string {
  return basename(path.replace(/[\\/]+$/, ""));
}

/** Removing a registered worktree prunes its admin directory on the next `worktree prune`. */
export function livesUnderWorktrees(path: string, mainRoot: string): boolean {
  const root = resolve(mainRoot, ".claude", "worktrees") + sep;
  return resolve(path).startsWith(root);
}

/**
 * Which worktrees a reap may take. The main checkout is never one; neither is a
 * locked, detached or unmerged tree, nor the one the calling session stands in.
 * `isMerged` is asked once per branch and is the cheap half: the clean check that
 * follows spawns `git status` in the tree, so it runs only for branches already
 * known to be merged.
 */
export function selectReap(args: {
  refs: WorktreeRef[];
  mainRoot: string;
  skip: string[];
  isMerged: (branch: string) => boolean;
  /** When the branch was created (epoch ms) if it has not moved since; null once it has. */
  createdAt: (branch: string) => number | null;
  now: number;
}): ReapSelection {
  const skip = new Set(args.skip.map((path) => safeRealpath(path)));
  const reap: ReapCandidate[] = [];
  const kept: { name: string; reason: string }[] = [];
  for (const ref of args.refs.slice(1)) {
    const name = nameOf(ref.path);
    if (!livesUnderWorktrees(ref.path, args.mainRoot)) kept.push({ name, reason: "not under .claude/worktrees" });
    else if (ref.locked) kept.push({ name, reason: "locked" });
    else if (ref.branch === null) kept.push({ name, reason: "detached" });
    else if (skip.has(safeRealpath(ref.path))) kept.push({ name, reason: "this session" });
    else if (!args.isMerged(ref.branch)) kept.push({ name, reason: "not merged into origin/beta" });
    else {
      const created = args.createdAt(ref.branch);
      if (created !== null && args.now - created < NEW_LANE_GRACE_MS) kept.push({ name, reason: "new lane, nothing committed yet" });
      else reap.push({ path: ref.path, name, branch: ref.branch, untouched: created !== null });
    }
  }
  return { reap, kept };
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path).toLowerCase();
  } catch {
    return resolve(path).toLowerCase();
  }
}

export interface ReapIo {
  /** True when the directory is still there; a tree another run already removed is not an error. */
  exists: (path: string) => boolean;
  /**
   * True when the tree has no tracked changes. Untracked files count only when `untracked` is set (a
   * lane that never committed); ignored ones such as node_modules never do.
   */
  isClean: (path: string, untracked: boolean) => boolean;
  remove: (path: string) => boolean;
}

/**
 * Remove the selection and say what stayed and why. A tree that is dirty keeps its
 * worktree, because those changes exist nowhere else; one that cannot be deleted
 * (a live session's working directory) is reported rather than retried.
 */
export function reap(selection: ReapSelection, io: ReapIo): { removed: ReapCandidate[]; kept: { name: string; reason: string }[] } {
  const removed: ReapCandidate[] = [];
  const kept = [...selection.kept];
  for (const candidate of selection.reap) {
    if (!io.exists(candidate.path)) {
      removed.push(candidate);
      continue;
    }
    if (!io.isClean(candidate.path, candidate.untouched)) {
      kept.push({ name: candidate.name, reason: "uncommitted changes" });
      continue;
    }
    if (!io.remove(candidate.path)) {
      kept.push({ name: candidate.name, reason: "in use" });
      continue;
    }
    removed.push(candidate);
  }
  return { removed, kept };
}

/** Where a tree goes while it is deleted; a leftover one is finished by the next reap. */
export const REAPING_SUFFIX = ".reaping";

export interface TreeRemoval {
  rename: (from: string, to: string) => void;
  removeDir: (path: string, timeoutMs: number) => void;
}

const fsRemoval: TreeRemoval = { rename: renameSync, removeDir: removeDirSync };

/**
 * Delete one tree; false when it is in use. A tree a live process holds (a dev server running from
 * it) refuses to be renamed, so the rename asks first and a held tree is left whole. Deleting it in
 * place got halfway (its `.git` link and most files gone) before the refusal, leaving a folder no reap
 * could see; and the throw ended the whole reap, so every worktree after a held one stayed too.
 */
export function removeTree(path: string, io: TreeRemoval = fsRemoval): boolean {
  const staging = `${path.replace(/[\\/]+$/, "")}${REAPING_SUFFIX}`;
  try {
    io.rename(path, staging);
  } catch {
    return false;
  }
  try {
    io.removeDir(staging, 10_000);
  } catch {
    // Out of the worktree list already; the next reap finishes it.
  }
  return true;
}

/** One line per reap run: what went, what stayed, and the reason for each rerun. */
export function summarise(result: { removed: ReapCandidate[]; kept: { name: string; reason: string }[] }): string {
  if (result.removed.length === 0) {
    const merged = result.kept.filter((row) => row.reason !== "not merged into origin/beta");
    return merged.length === 0
      ? "worktree reap: no merged worktree to remove"
      : `worktree reap: nothing removed - ${merged.map((row) => `${row.name} (${row.reason})`).join(", ")}`;
  }
  const names = result.removed.map((row) => row.name);
  const held = result.kept.filter((row) => row.reason === "uncommitted changes" || row.reason === "in use");
  const tail = held.length === 0 ? "" : `; kept ${held.map((row) => `${row.name} (${row.reason})`).join(", ")}`;
  return `worktree reap: removed ${names.length} merged worktree${names.length === 1 ? "" : "s"} (${names.join(", ")})${tail}`;
}

function git(cwd: string, args: string[]): { ok: boolean; stdout: string } {
  // A directory can disappear between the listing and the check; spawning there
  // reports a missing `git` rather than a missing directory, so it is caught here.
  try {
    const run = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    return { ok: run.exitCode === 0, stdout: run.stdout?.toString() ?? "" };
  } catch {
    return { ok: false, stdout: "" };
  }
}

/** The caller's directory plus every `--skip <path>`: a lane that was just created sits at `origin/beta` and would otherwise count as merged. */
export function skipPaths(argv: readonly string[], cwd: string): string[] {
  const paths = [cwd];
  argv.forEach((arg, index) => {
    const next = argv[index + 1];
    if (arg === "--skip" && next !== undefined) paths.push(next);
  });
  return paths;
}

function main(argv: readonly string[]): void {
  if (printHelpIfAsked("worktree-reap", WORKTREE_REAP_USAGE, argv)) process.exit(0);
  const dryRun = argv.includes("--dry-run");
  const fetch = argv.includes("--fetch");

  const common = git(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common.ok) {
    console.error("worktree reap: not in a git checkout");
    process.exit(1);
  }
  const mainRoot = dirname(common.stdout.trim());
  if (fetch) git(mainRoot, ["fetch", "origin", "beta", "--prune"]);

  const listed = git(mainRoot, ["worktree", "list", "--porcelain"]);
  if (!listed.ok) {
    console.error("worktree reap: could not read the worktree list");
    process.exit(1);
  }
  const selection = selectReap({
    refs: parseWorktreeList(listed.stdout),
    mainRoot,
    skip: skipPaths(argv, process.cwd()),
    isMerged: (branch) => git(mainRoot, ["merge-base", "--is-ancestor", branch, "origin/beta"]).ok,
    createdAt: (branch) => {
      const log = git(mainRoot, ["reflog", "show", "--format=%ct", `refs/heads/${branch}`]);
      const entries = log.stdout.trim().split("\n");
      const seconds = Number(entries[0]);
      return log.ok && entries.length === 1 && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
    },
    now: Date.now(),
  });

  // A dry run asks the trees the same questions and deletes nothing, so it lists what a real run takes.
  const result = reap(selection, {
    exists: (path) => existsSync(path),
    isClean: (path, untracked) => {
      const status = git(path, ["status", "--porcelain", `--untracked-files=${untracked ? "normal" : "no"}`]);
      return status.ok && status.stdout.trim() === "";
    },
    remove: (path) => dryRun || removeTree(path),
  });
  if (dryRun) {
    for (const candidate of result.removed) console.log(`would remove ${candidate.name} (${candidate.branch})`);
    for (const row of result.kept) if (row.reason !== "not merged into origin/beta") console.log(`keeps ${row.name} - ${row.reason}`);
    return;
  }
  git(mainRoot, ["worktree", "prune"]);
  finishStaged(join(mainRoot, ".claude", "worktrees"));
  console.log(summarise(result));
}

/** Delete trees an earlier reap renamed aside but could not finish deleting. */
function finishStaged(root: string): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (!entry.endsWith(REAPING_SUFFIX)) continue;
    try {
      removeDirSync(join(root, entry), 1_000);
    } catch {
      // Still held; the next reap tries again.
    }
  }
}

if (import.meta.main) main(process.argv.slice(2));
