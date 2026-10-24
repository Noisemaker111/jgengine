// A lane's worktree is a full working copy, and a merged lane is a copy nobody
// will ever open again. Nothing removed those, so `.claude/worktrees` grew by
// about a gigabyte per lane until the disk filled, and a full disk is what leaves
// the next install half-linked. This reaps a worktree when its branch has reached
// `origin/beta` and its tree has nothing uncommitted. Committed work is never at
// risk: removing a worktree deletes files, not branches.
import { existsSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";

import { printHelpIfAsked } from "./script-help";
import { parseWorktreeList, type WorktreeRef } from "./worktree-doctor";

const WORKTREE_REAP_USAGE = {
  summary: "remove worktrees whose branch merged into origin/beta and whose tree is clean",
  usage: "bun run worktree:reap [--dry-run] [--fetch]",
  flags: [
    { flag: "--dry-run", detail: "print what would go, remove nothing" },
    { flag: "--fetch", detail: "fetch origin/beta first, so a merge that just landed counts" },
  ],
  example: "bun run worktree:reap --dry-run",
} as const;

export interface ReapCandidate {
  path: string;
  name: string;
  branch: string;
}

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
    else reap.push({ path: ref.path, name, branch: ref.branch });
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
  /** True when the tree has no tracked changes; untracked files such as node_modules do not count. */
  isClean: (path: string) => boolean;
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
    if (!io.isClean(candidate.path)) {
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

/** One line per reap run: what went, what stayed, and the reason for each rerun. */
export function summarise(result: { removed: ReapCandidate[]; kept: { name: string; reason: string }[] }): string {
  if (result.removed.length === 0) {
    const merged = result.kept.filter((row) => row.reason !== "not merged into origin/beta");
    return merged.length === 0
      ? "worktree:reap: no merged worktree to remove"
      : `worktree:reap: nothing removed - ${merged.map((row) => `${row.name} (${row.reason})`).join(", ")}`;
  }
  const names = result.removed.map((row) => row.name);
  const held = result.kept.filter((row) => row.reason === "uncommitted changes" || row.reason === "in use");
  const tail = held.length === 0 ? "" : `; kept ${held.map((row) => `${row.name} (${row.reason})`).join(", ")}`;
  return `worktree:reap: removed ${names.length} merged worktree${names.length === 1 ? "" : "s"} (${names.join(", ")})${tail}`;
}

function git(cwd: string, args: string[]): { ok: boolean; stdout: string } {
  const run = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { ok: run.exitCode === 0, stdout: run.stdout?.toString() ?? "" };
}

function main(argv: readonly string[]): void {
  if (printHelpIfAsked("worktree-reap", WORKTREE_REAP_USAGE, argv)) process.exit(0);
  const dryRun = argv.includes("--dry-run");
  const fetch = argv.includes("--fetch");

  const common = git(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common.ok) {
    console.error("worktree:reap: not in a git checkout");
    process.exit(1);
  }
  const mainRoot = dirname(common.stdout.trim());
  if (fetch) git(mainRoot, ["fetch", "origin", "beta", "--prune"]);

  const listed = git(mainRoot, ["worktree", "list", "--porcelain"]);
  if (!listed.ok) {
    console.error("worktree:reap: could not read the worktree list");
    process.exit(1);
  }
  const selection = selectReap({
    refs: parseWorktreeList(listed.stdout),
    mainRoot,
    skip: [process.cwd()],
    isMerged: (branch) => git(mainRoot, ["merge-base", "--is-ancestor", branch, "origin/beta"]).ok,
  });

  if (dryRun) {
    for (const candidate of selection.reap) console.log(`would remove ${candidate.name} (${candidate.branch})`);
    for (const row of selection.kept) console.log(`keeps ${row.name} - ${row.reason}`);
    console.log(summarise({ removed: [], kept: selection.kept }));
    return;
  }

  const result = reap(selection, {
    isClean: (path) => git(path, ["status", "--porcelain", "--untracked-files=no"]).stdout.trim() === "",
    remove: (path) => {
      rmSync(path, { recursive: true, force: true, maxRetries: 2 });
      return !existsSync(path);
    },
  });
  git(mainRoot, ["worktree", "prune"]);
  console.log(summarise(result));
}

if (import.meta.main) main(process.argv.slice(2));
