// Ten finished branches land with one CI run, not ten.
//
//   bun run land:batch agent/a agent/b agent/c
//   bun run land:batch --file .scratch/branches.txt   # one branch per line, # comments allowed
//   bun run land:batch agent/a agent/b --dry-run      # build and verify the chain, push nothing
//   bun run land:batch --explain                      # after a red batch: name the commit that broke it
//
// Each branch is merged onto the chain in the order given, inside this checkout, so the verify
// command uses the install that already exists here. A branch that conflicts or fails verify is
// skipped with the reason and the rest carry on; nothing is force-pushed. When the chain is built,
// the whole run reaches `origin/<base>` in one push, so CI sees one commit and runs once.
//
// The chain is merge commits, not a rebase, and that is deliberate: a rebase rewrites each branch's
// commits, so its PR is never marked merged and `Closes #N` never fires. A merge commit keeps every
// branch tip an ancestor of the base, which is what tells GitHub the PR landed, and it leaves one
// revertable commit per branch. A branch behind the base is merged as it stands; a real conflict
// stops that branch alone.
//
// Nothing here waits. It prints what it did and hands the CI question to a one-shot read:
// `bun run ci:status --branch <base>` (or the run id it names) and `bun run pr:sweep`. If the batch
// tip comes back red, `--explain` walks the recorded commits in order and names the first one that
// cannot verify on its own, which is the likely cause.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCheckoutReady } from "./checkout-ready";
import { printHelpIfAsked } from "./script-help";
import { duration, gitCommonDir, runAt } from "./land";
import type { Git, Run } from "./land";

const root = fileURLToPath(new URL("..", import.meta.url));

const BATCH_USAGE = {
  summary: "land several finished branches as one push, so CI runs once instead of once per branch",
  usage: "bun run land:batch [branch ...] [--file <path>] [--base <branch>] [--verify <command>] [--skill-api] [--dry-run] [--explain]",
  flags: [
    { flag: "<branch ...>", detail: "branches to land, in the order given" },
    { flag: "--file <path>", detail: "also read branches from this file, one per line (# comments allowed)" },
    { flag: "--base <branch>", detail: "branch to land into (default: beta)" },
    { flag: "--verify <command>", detail: "run after each merge, before the push (default: bun run verify:fast)" },
    { flag: "--skill-api", detail: "also run the verify command with --skill-api once, on the finished tip" },
    { flag: "--dry-run", detail: "build and verify the chain, then stop without pushing" },
    { flag: "--explain", detail: "read the last batch and name the commit a red tip most likely came from" },
  ],
  example: "bun run land:batch agent/menus agent/audio agent/hud --file .scratch/more.txt",
  exits: [
    "0 every branch landed and reached the base in one push",
    "1 some branches landed, the rest were skipped with a reason",
    "2 nothing landed (every branch was skipped)",
    "3 refused before landing (dirty tree, moved base, failed tip check, unreadable batch record)",
  ],
} as const;

export const EXIT_BATCH_LANDED = 0;
export const EXIT_BATCH_PARTIAL = 1;
export const EXIT_BATCH_EMPTY = 2;
export const EXIT_BATCH_REFUSED = 3;

export interface BatchArgs {
  base: string;
  branches: string[];
  file?: string;
  verify: string;
  skillApi: boolean;
  dryRun: boolean;
  explain: boolean;
}

/** Positional branches, `--file`, `--base`, `--verify`, `--skill-api`, `--dry-run` and `--explain`. */
export function parseArgs(argv: readonly string[]): BatchArgs {
  const args: BatchArgs = { base: "beta", branches: [], verify: "bun run verify:fast", skillApi: false, dryRun: false, explain: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") args.base = value(argv, (i += 1), arg);
    else if (arg === "--file") args.file = value(argv, (i += 1), arg);
    else if (arg === "--verify") args.verify = value(argv, (i += 1), arg);
    else if (arg === "--skill-api") args.skillApi = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--explain") args.explain = true;
    else if (arg.startsWith("--")) throw new Error(`unknown argument ${arg}`);
    else args.branches.push(arg);
  }
  return args;
}

function value(argv: readonly string[], at: number, flag: string): string {
  const found = argv[at];
  if (found === undefined || found.startsWith("--")) throw new Error(`${flag} needs a value`);
  return found;
}

/** Branch names from a list file: one per line, `#` and blank lines are notes, not branches. */
export function readBranchList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** The list file's branches first, then the ones on the command line, each once, in order. */
export function batchBranches(args: BatchArgs, read: (path: string) => string = (path) => readFileSync(path, "utf8")): string[] {
  const fromFile = args.file === undefined ? [] : readBranchList(read(args.file));
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const branch of [...fromFile, ...args.branches]) {
    if (seen.has(branch)) continue;
    seen.add(branch);
    ordered.push(branch);
  }
  return ordered;
}

/** One branch that reached the base, and the merge commit that carried it. */
export interface BatchLanded {
  branch: string;
  commit: string;
  subject: string;
  pr?: number;
  /** How many commits this branch added. */
  commits: number;
}

/** One branch that did not reach the base, and why, so nothing is dropped silently. */
export interface BatchSkipped {
  branch: string;
  why: string;
}

export interface BatchOutcome {
  base: string;
  baseSha: string;
  landed: BatchLanded[];
  skipped: BatchSkipped[];
  /** The chain tip the push used, or null when nothing landed. */
  tip: string | null;
  pushed: boolean;
  code: number;
}

export interface BatchPr {
  number: number;
  title: string;
}

export interface BatchIo {
  /** Runs in this checkout. */
  git: Git;
  gh: (args: string[]) => Run;
  /** Runs the verify command in this checkout; true when it passed. */
  verify: (command: string) => boolean;
  log: (line: string) => void;
  error: (line: string) => void;
  now: () => number;
}

function details(result: Run): string {
  return (result.stderr || result.stdout).trim();
}

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? text.trim();
}

export function short(sha: string): string {
  return sha.slice(0, 8);
}

/** Open PRs into the base, by head branch, so a merge commit can name its PR the way GitHub does. */
export function openPrs(io: BatchIo, base: string): Map<string, BatchPr> {
  const listed = io.gh(["pr", "list", "--base", base, "--state", "open", "--limit", "100", "--json", "number,title,headRefName"]);
  const byBranch = new Map<string, BatchPr>();
  if (listed.status !== 0) return byBranch;
  try {
    const rows = JSON.parse(listed.stdout || "[]") as { number: number; title: string; headRefName: string }[];
    for (const row of rows) byBranch.set(row.headRefName, { number: row.number, title: row.title });
  } catch {
    return byBranch;
  }
  return byBranch;
}

/** The merge commit message: GitHub's own shape when a PR is known, a plain merge otherwise. */
export function mergeMessage(base: string, branch: string, pr: BatchPr | undefined): { subject: string; body: string } {
  if (pr === undefined) return { subject: `Merge branch '${branch}' into ${base}`, body: "" };
  return { subject: `Merge pull request #${pr.number} from ${branch}`, body: pr.title };
}

/** Where the last batch is recorded, so `--explain` can name a commit after the fact. */
export function recordPath(git: Git): string {
  return join(gitCommonDir(git), "land-batch.json");
}

export interface BatchRecord {
  base: string;
  baseSha: string;
  tip: string;
  at: number;
  entries: { branch: string; commit: string; subject: string; pr?: number }[];
}

/**
 * Land every branch in order: merge it onto the chain, verify the chain, keep it when the check
 * passes and skip it with the reason when it does not. The chain goes to `origin/<base>` in one
 * push, and nothing is ever force-pushed.
 */
export function landBatch(args: BatchArgs, io: BatchIo): BatchOutcome {
  const startedAt = io.now();
  const outcome: BatchOutcome = { base: args.base, baseSha: "", landed: [], skipped: [], tip: null, pushed: false, code: EXIT_BATCH_LANDED };
  const branches = batchBranches(args);
  if (branches.length === 0) {
    io.error("no branches named: give them on the command line or with --file <path>");
    outcome.code = EXIT_BATCH_REFUSED;
    return outcome;
  }

  io.git(["fetch", "--no-tags", "origin", args.base]);
  for (const branch of branches) io.git(["fetch", "--no-tags", "origin", branch]);
  const baseSha = io.git(["rev-parse", `origin/${args.base}`]).stdout.trim();
  if (baseSha.length === 0) {
    io.error(`cannot read origin/${args.base}; nothing was pushed`);
    outcome.code = EXIT_BATCH_REFUSED;
    return outcome;
  }
  outcome.baseSha = baseSha;

  const original = io.git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim() || "beta";
  const prs = openPrs(io, args.base);
  io.log(`${branches.length} branch(es) into ${args.base} at ${short(baseSha)}`);

  let chain = baseSha;
  try {
    for (const branch of branches) {
      const tip = io.git(["rev-parse", "--verify", `origin/${branch}`]);
      if (tip.status !== 0) {
        outcome.skipped.push({ branch, why: "no such branch on origin" });
        io.error(`- ${branch} skipped: no such branch on origin`);
        continue;
      }
      const commits = Number(io.git(["rev-list", "--count", `origin/${args.base}..origin/${branch}`]).stdout.trim() || "0");
      if (io.git(["merge-base", "--is-ancestor", `origin/${branch}`, chain]).status === 0) {
        outcome.skipped.push({ branch, why: `already in ${args.base}` });
        io.log(`= ${branch} already in ${args.base}`);
        continue;
      }
      if (commits === 0) {
        outcome.skipped.push({ branch, why: "no commits against the base; nothing to land" });
        io.error(`- ${branch} skipped: no commits against origin/${args.base}`);
        continue;
      }

      io.git(["checkout", "--quiet", "--detach", chain]);
      const pr = prs.get(branch);
      const message = mergeMessage(args.base, branch, pr);
      const merged = io.git(
        message.body.length === 0
          ? ["merge", "--no-ff", "--no-edit", "-m", message.subject, `origin/${branch}`]
          : ["merge", "--no-ff", "--no-edit", "-m", message.subject, "-m", message.body, `origin/${branch}`],
      );
      if (merged.status !== 0) {
        const conflicted = io
          .git(["diff", "--name-only", "--diff-filter=U"])
          .stdout.split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        io.git(["merge", "--abort"]);
        io.git(["checkout", "--quiet", "--detach", chain]);
        const files = conflicted.slice(0, 3).join(", ") + (conflicted.length > 3 ? `, +${conflicted.length - 3} more` : "");
        const why = conflicted.length > 0 ? `conflicts with the chain in ${files}` : `merge refused: ${firstLine(details(merged))}`;
        outcome.skipped.push({ branch, why });
        io.error(`- ${branch} skipped: ${why}`);
        continue;
      }

      if (!io.verify(args.verify)) {
        io.git(["checkout", "--quiet", "--detach", chain]);
        outcome.skipped.push({ branch, why: `verify failed (${args.verify})` });
        io.error(`- ${branch} skipped: verify failed (${args.verify}); the chain stays at ${short(chain)}`);
        continue;
      }

      chain = io.git(["rev-parse", "HEAD"]).stdout.trim();
      const subject = io.git(["log", "-1", "--format=%s"]).stdout.trim();
      outcome.landed.push({ branch, commit: chain, subject, commits, ...(pr === undefined ? {} : { pr: pr.number }) });
      io.log(`+ ${branch} ${commits} commit(s), merged and verified (${short(chain)})`);
    }

    if (outcome.landed.length > 0 && args.skillApi) {
      io.git(["checkout", "--quiet", "--detach", chain]);
      const command = `${args.verify} --skill-api`;
      io.log(`verify once on the finished tip: ${command}`);
      if (!io.verify(command)) {
        outcome.skipped.push({ branch: "the finished tip", why: `verify failed (${command}); nothing was pushed` });
        io.error(`refusing the push: the finished tip ${short(chain)} fails ${command}`);
        outcome.code = EXIT_BATCH_REFUSED;
        return outcome;
      }
    }

    if (outcome.landed.length === 0) {
      outcome.code = EXIT_BATCH_EMPTY;
      io.error(`nothing landed: ${outcome.skipped.length} branch(es) skipped, nothing was pushed`);
      return outcome;
    }

    outcome.tip = chain;
    record(io, { base: args.base, baseSha, tip: chain, at: io.now(), entries: outcome.landed.map((entry) => ({ branch: entry.branch, commit: entry.commit, subject: entry.subject, ...(entry.pr === undefined ? {} : { pr: entry.pr }) })) });

    if (args.dryRun) {
      io.log(`dry run: ${outcome.landed.length} branch(es) would reach ${args.base} in one push, tip ${short(chain)}`);
      outcome.code = outcome.skipped.length === 0 ? EXIT_BATCH_LANDED : EXIT_BATCH_PARTIAL;
      return outcome;
    }

    io.git(["fetch", "--no-tags", "origin", args.base]);
    const moved = io.git(["rev-parse", `origin/${args.base}`]).stdout.trim();
    if (moved !== baseSha) {
      outcome.skipped.push({ branch: "the push", why: `origin/${args.base} moved from ${short(baseSha)} to ${short(moved)} while the batch verified` });
      io.error(`refusing the push: origin/${args.base} moved to ${short(moved)}; re-run the batch onto the new tip`);
      outcome.code = EXIT_BATCH_REFUSED;
      return outcome;
    }

    const pushed = io.git(["push", "origin", `${chain}:refs/heads/${args.base}`]);
    if (pushed.status !== 0) {
      io.error(`push to origin/${args.base} failed: ${firstLine(details(pushed))}`);
      outcome.code = EXIT_BATCH_REFUSED;
      return outcome;
    }
    outcome.pushed = true;
    outcome.code = outcome.skipped.length === 0 ? EXIT_BATCH_LANDED : EXIT_BATCH_PARTIAL;
    io.log(`pushed ${outcome.landed.length} merge commit(s) to origin/${args.base}, tip ${short(chain)}: one CI run for the batch`);
    for (const line of handOffLines(chain, args.base, runOnTip(io, args.base, chain))) io.log(line);
    annotatePrs(io, outcome);
    return outcome;
  } finally {
    io.git(["checkout", "--quiet", original]);
    io.log(`${outcome.landed.length} landed, ${outcome.skipped.length} skipped in ${duration(io.now() - startedAt)}`);
  }
}

function record(io: BatchIo, value: BatchRecord): void {
  try {
    writeFileSync(recordPath(io.git), `${JSON.stringify(value, null, 2)}\n`);
  } catch (error) {
    io.error(`could not write the batch record: ${String(error)}`);
  }
}

/**
 * The Action run the batch push started, when GitHub has it yet. One read, never a watch: the run
 * is the thing that tells the batch's state, and asking for it costs a second.
 */
export function runOnTip(io: BatchIo, base: string, tip: string): number | null {
  const listed = io.gh(["run", "list", "--branch", base, "--limit", "3", "--json", "databaseId,headSha"]);
  if (listed.status !== 0) return null;
  try {
    const rows = JSON.parse(listed.stdout || "[]") as { databaseId: number; headSha: string }[];
    return rows.find((row) => row.headSha === tip)?.databaseId ?? null;
  } catch {
    return null;
  }
}

/** What an author reads instead of a wait: where the CI answer is, and which command gives it. */
export function handOffLines(tip: string, base: string, runId: number | null = null): string[] {
  return [
    runId === null
      ? `status: gh run list --branch ${base} --limit 1 --json databaseId,headSha,conclusion`
      : `status: gh run view ${runId} --json status,conclusion`,
    `red batch: bun run land:batch --explain`,
    `the batch is ${short(tip)}; this command is done and waits for nothing`,
  ];
}

/**
 * GitHub marks a PR merged when its commits reach the base, so a batch push usually needs nothing
 * here. A PR it left open is closed with the commit that carried it, never left looking unlanded.
 */
function annotatePrs(io: BatchIo, outcome: BatchOutcome): void {
  for (const entry of outcome.landed) {
    if (entry.pr === undefined) continue;
    const view = io.gh(["pr", "view", String(entry.pr), "--json", "state"]);
    if (view.status !== 0) continue;
    let state = "";
    try {
      state = (JSON.parse(view.stdout) as { state?: string }).state ?? "";
    } catch {
      continue;
    }
    if (state !== "OPEN") continue;
    const closed = io.gh([
      "pr",
      "close",
      String(entry.pr),
      "--comment",
      `Landed in the batch push ${short(outcome.tip ?? "")} as ${short(entry.commit)}; its commits are in ${outcome.base}.`,
    ]);
    if (closed.status === 0) io.log(`closed PR #${entry.pr}: it landed as ${short(entry.commit)}`);
  }
}

/** The last batch this checkout recorded, or null when there is none to read. */
export function readRecord(git: Git): BatchRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(recordPath(git), "utf8")) as Partial<BatchRecord>;
    if (!Array.isArray(parsed.entries) || typeof parsed.tip !== "string") return null;
    return { base: parsed.base ?? "beta", baseSha: parsed.baseSha ?? "", tip: parsed.tip, at: parsed.at ?? 0, entries: parsed.entries };
  } catch {
    return null;
  }
}

export interface ExplainIo {
  git: Git;
  verify: (command: string) => boolean;
  log: (line: string) => void;
  error: (line: string) => void;
}

/**
 * Name the likely cause of a red batch tip: walk the recorded commits in order and verify each one
 * on its own, stopping at the first that cannot pass. A batch that passes every commit locally is
 * reported as a CI-only failure rather than guessed at.
 */
export function explainBatch(args: BatchArgs, io: ExplainIo): number {
  const record = readRecord(io.git);
  if (record === null || record.entries.length === 0) {
    io.error("no batch record to explain: run bun run land:batch first, then --explain if its tip goes red");
    return EXIT_BATCH_REFUSED;
  }
  const original = io.git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim() || record.base;
  io.log(`${record.entries.length} commit(s) from ${short(record.baseSha)} to ${short(record.tip)} on ${record.base}`);
  try {
    for (const entry of record.entries) {
      if (io.git(["checkout", "--quiet", "--detach", entry.commit]).status !== 0) {
        io.error(`cannot check out ${short(entry.commit)} (${entry.branch}); its branch is gone`);
        continue;
      }
      if (!io.verify(args.verify)) {
        const revert = io.git(["log", "-1", "--format=%B", entry.commit]).stdout.trim();
        io.error(`likely cause: ${entry.branch} at ${short(entry.commit)} — "${firstLine(revert)}" fails ${args.verify} on its own`);
        io.error(`revert it with: git revert -m 1 ${entry.commit}`);
        return EXIT_BATCH_PARTIAL;
      }
      io.log(`ok ${short(entry.commit)} ${entry.branch}`);
    }
  } finally {
    io.git(["checkout", "--quiet", original]);
  }
  io.error(`every commit in the batch passes ${args.verify} here: the red tip is a CI-only failure`);
  io.error(`ask which check failed: bun run ci:status --branch ${record.base} (or gh run list --branch ${record.base})`);
  return EXIT_BATCH_LANDED;
}

function runVerify(command: string): boolean {
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], { cwd: root, stdio: "inherit" })
      : spawnSync("bash", ["-lc", command], { cwd: root, stdio: "inherit" });
  return (result.status ?? 1) === 0;
}

function main(): void {
  if (printHelpIfAsked("land:batch", BATCH_USAGE)) process.exit(EXIT_BATCH_LANDED);
  assertCheckoutReady("land:batch", root);

  let args: BatchArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`land:batch: ${(error as Error).message}`);
    process.exit(EXIT_BATCH_REFUSED);
  }

  const git: Git = (gitArgs) => runAt(root, "git", gitArgs, 180_000);
  const io: BatchIo = {
    git,
    gh: (ghArgs) => runAt(root, "gh", ghArgs, 120_000),
    verify: runVerify,
    log: (line) => console.log(`land:batch: ${line}`),
    error: (line) => console.error(`land:batch: ${line}`),
    now: Date.now,
  };

  if (args.explain) process.exit(explainBatch(args, { git, verify: runVerify, log: io.log, error: io.error }));

  if (args.file !== undefined) {
    try {
      readFileSync(args.file, "utf8");
    } catch {
      console.error(`land:batch: --file ${args.file} does not exist`);
      process.exit(EXIT_BATCH_REFUSED);
    }
  }

  const status = git(["status", "--porcelain"]).stdout;
  if (status.trim().length > 0) {
    console.error("land:batch: refusing a dirty tree: the chain is built here, so commit or stash first.");
    process.exit(EXIT_BATCH_REFUSED);
  }

  process.exit(landBatch(args, io).code);
}

if (import.meta.main) main();
