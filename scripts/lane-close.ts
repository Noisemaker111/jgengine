// The last step of a lane, done as one command so it is not a paragraph of
// remembered steps:
//
//   bun run lane:close                 # the current branch's lane
//   bun run lane:close --pr 2274
//   bun run lane:close --allow bun.lock  # keep a file the commit guards refuse
//
// It verifies, lands (staging and committing the lane's work first, with its `changes/`
// fragment as the message), asks `ci:status` once for the truth about the checks, and
// prints a report skeleton a lane can paste instead of writing prose. It exits 1 when
// verify or land failed and 3 when it cannot answer (no PR, no branch).
//
// A PR whose checks have not registered yet is a hand-off, not a failure: the queue
// owns the wait and `bun run ci:status --pr <n>` answers only later, so the report
// says so and the lane still exits 0.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { assertCheckoutReady } from "./checkout-ready";
import { printHelpIfAsked } from "./script-help";

const LANE_CLOSE_USAGE = {
  summary: "verify, land, ask the checks once, and print the lane report",
  usage: "bun run lane:close [--pr <number>] [--allow <path>] | --batch <branch ...> | --queue",
  flags: [
    { flag: "--batch <branch ...>", detail: "land several finished branches as one push instead (the rest of the arguments go to the batch; --help there lists them)" },
    { flag: "--queue", detail: "drain the landing queue: rebase and wait once for each queued PR" },
    { flag: "--pr <number>", detail: "the PR to close; default: the open PR for this branch" },
    { flag: "--allow <path>", detail: "a path land --commit may take although its guards refuse it; repeatable" },
  ],
  example: "bun run lane:close --pr 2274",
  exits: [
    "0 closed",
    "1 verify or land failed",
    "3 cannot answer (no PR, no branch)",
    "78 this checkout has no node_modules - run bun install, or bun run agent:bootstrap",
  ],
} as const;

export const EXIT_CLOSED = 0;
export const EXIT_VERIFY_FAILED = 1;
export const EXIT_CANNOT_ANSWER = 3;

const root = fileURLToPath(new URL("..", import.meta.url));

export interface LaneCloseArgs {
  pr?: number;
  /** Paths `land --commit` may take although its guards refuse them; repeatable. */
  allow?: string[];
}

export function parseArgs(argv: readonly string[]): LaneCloseArgs {
  const args: LaneCloseArgs = { allow: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pr") {
      const raw = argv[(i += 1)];
      const pr = Number(raw);
      if (raw === undefined || !Number.isInteger(pr) || pr <= 0) throw new Error("--pr needs a PR number");
      args.pr = pr;
    } else if (arg === "--allow") {
      const path = argv[(i += 1)];
      if (path === undefined || path.trim().length === 0) throw new Error("--allow needs a path");
      (args.allow ??= []).push(path.trim().replace(/\\/g, "/"));
    } else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

export interface ReportInput {
  branch: string;
  pr: number;
  prState?: string;
  prUrl?: string;
  status?: { counts: { pass: number; fail: number; pending: number }; verdict: string; runIds: number[] };
  checksProblem?: string;
  filesChanged: string;
}

/** The report a lane pastes: the numbers, filled in, with nothing to write by hand. */
export function reportSkeleton(input: ReportInput): string {
  const lines = ["Lane report", `- branch: ${input.branch}`];
  const state = input.prState === undefined ? "" : ` ${input.prState.toLowerCase()}`;
  lines.push(`- PR: #${input.pr}${state}${input.prUrl === undefined ? "" : ` ${input.prUrl}`}`.trimEnd());
  if (input.status === undefined) {
    lines.push(`- checks: unavailable — ${input.checksProblem ?? "ci:status did not answer"}`);
  } else {
    const { pass, fail, pending } = input.status.counts;
    const runs = input.status.runIds.length > 0 ? ` (run ${input.status.runIds.join(", ")})` : "";
    lines.push(`- checks: ${pass} pass, ${fail} fail, ${pending} pending — ${input.status.verdict}${runs}`);
  }
  lines.push(`- files changed: ${input.filesChanged}`);
  if (input.status === undefined) lines.push(`- ask again for the checks: bun run ci:status --pr ${input.pr}`);
  return lines.join("\n");
}

export interface LaneIo {
  /** Runs one command; `inherit` streams its output instead of capturing it. */
  sh: (argv: string[], inherit: boolean) => { status: number; stdout: string; stderr: string };
  cwd: string;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
}

function lastLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .pop() ?? ""
  );
}

function parseJson<T>(text: string): { value: T } | { error: string } {
  try {
    return { value: JSON.parse(text) as T };
  } catch (error) {
    return { error: `unreadable JSON: ${String(error)}` };
  }
}

export function closeLane(args: LaneCloseArgs, io: LaneIo): number {
  const branchRun = io.sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], false);
  const branch = branchRun.stdout.trim();
  if (branchRun.status !== 0 || branch.length === 0) {
    io.err("lane:close: could not read the current branch");
    return EXIT_CANNOT_ANSWER;
  }
  if (branch === "main" || branch === "beta") {
    io.err(`lane:close: refusing to close ${branch}: a lane is a task branch, not the base`);
    return EXIT_CANNOT_ANSWER;
  }

  // Regenerate every committed derived file first: a stale manifest, api.md or capabilities
  // ledger was the most common reason a finished lane failed to land, and the fix was always
  // `bun run gen`. land --commit stages what gen rewrote.
  io.out(`lane:close: ${branch} — gen`);
  const generated = io.sh(["run", "gen"], true);
  if (generated.status !== 0) {
    io.err(`lane:close: gen failed (exit ${generated.status}); nothing landed.`);
    return EXIT_VERIFY_FAILED;
  }
  io.out(`lane:close: ${branch} — verify:fast`);
  const verified = io.sh(["run", "verify:fast"], true);
  if (verified.status !== 0) {
    io.err(
      `lane:close: verify:fast failed (exit ${verified.status}); nothing landed. ` +
        "Fix what it names and close again.",
    );
    return EXIT_VERIFY_FAILED;
  }

  io.out("lane:close: land --commit");
  const landArgs = ["run", "scripts/land.ts", "--commit", ...(args.allow ?? []).flatMap((path) => ["--allow", path])];
  const landed = io.sh(landArgs, true);
  if (landed.status !== 0) {
    io.err(`lane:close: land exited ${landed.status}; the lane is not closed`);
    return landed.status;
  }

  const pr = args.pr ?? branchPr(branch, io);
  if (pr === null) {
    io.err(`lane:close: landed ${branch} but cannot name its PR; no checks or report to print`);
    return EXIT_CANNOT_ANSWER;
  }
  const view = io.sh(["run", "ci:status", "--json", "--pr", String(pr)], false);
  const parsed = parseJson<{
    ok: boolean;
    message?: string;
    state?: string;
    url?: string;
    counts?: { pass: number; fail: number; pending: number };
    verdict?: string;
    runIds?: number[];
  }>(view.stdout);
  const answer = "value" in parsed ? parsed.value : null;
  const status =
    answer !== null && answer.ok === true && answer.counts !== undefined
      ? { counts: answer.counts, verdict: answer.verdict ?? "unknown", runIds: answer.runIds ?? [] }
      : undefined;
  const checksProblem =
    "error" in parsed
      ? parsed.error
      : (answer?.message ?? `ci:status exited ${view.status} and printed no status`);

  io.out("");
  io.out(
    reportSkeleton({
      branch,
      pr,
      prState: answer?.state,
      prUrl: answer?.url,
      status,
      checksProblem,
      filesChanged: filesChanged(io),
    }),
  );

  // A PR whose checks have not registered yet is handed off, not unanswered: the queue owns the
  // wait, and `ci:status` is the one command that answers later. Only a ci:status that produced no
  // answer at all leaves the lane unable to report.
  if (status === undefined && answer === null) {
    io.err(`lane:close: cannot report the checks: ${checksProblem}`);
    return EXIT_CANNOT_ANSWER;
  }
  // A merged lane's worktree is a copy nobody will open again. Reaping here keeps
  // `.claude/worktrees` bounded; this lane's own tree stays, since a process
  // cannot delete the directory it runs in, and the next close takes it.
  const reaped = io.sh(["run", "worktree", "reap", "--fetch"], false);
  const reapLine = lastLine(reaped.stdout);
  if (reapLine.length > 0) io.out(`lane:close: ${reapLine}`);
  return EXIT_CLOSED;
}

/**
 * The PR this branch handed over: open and armed, or already merged. `land` no longer waits, so the
 * PR a lane just produced is usually still open when the report is printed.
 */
function branchPr(branch: string, io: LaneIo): number | null {
  const listed = io.sh(["gh", "pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "number"], false);
  if (listed.status !== 0) return null;
  const parsed = parseJson<{ number: number }[]>(listed.stdout);
  if (!("value" in parsed)) return null;
  const found = parsed.value[0];
  return found === undefined ? null : found.number;
}

function filesChanged(io: LaneIo): string {
  const diff = io.sh(["git", "diff", "--shortstat", "origin/beta...HEAD"], false);
  const text = diff.stdout.trim();
  return text.length > 0 ? text : "none against origin/beta";
}

/** The landing modes besides closing this lane: `--batch` and `--queue` hand the rest of argv to their script. */
export function landingMode(argv: readonly string[]): { script: string; rest: string[] } | null {
  if (argv[0] === "--batch") return { script: "scripts/land-batch.ts", rest: argv.slice(1) };
  if (argv[0] === "--queue") return { script: "scripts/land-queue.ts", rest: argv.slice(1) };
  return null;
}

function main(argv: readonly string[]): void {
  const mode = landingMode(argv);
  if (mode !== null) {
    const run = spawnSync(process.execPath, [mode.script, ...mode.rest], { cwd: root, stdio: "inherit" });
    process.exit(run.status ?? 1);
  }
  if (printHelpIfAsked("lane-close", LANE_CLOSE_USAGE, argv)) process.exit(EXIT_CLOSED);
  assertCheckoutReady("lane:close", root);
  const parsed = parseOrRefuse(argv);
  if ("problem" in parsed) {
    console.error(`lane:close: ${parsed.problem}`);
    process.exit(EXIT_CANNOT_ANSWER);
  } else {
    process.exit(closeLane(parsed.args, realIo()));
  }
}

function parseOrRefuse(argv: readonly string[]): { args: LaneCloseArgs } | { problem: string } {
  try {
    return { args: parseArgs(argv) };
  } catch (error) {
    return { problem: (error as Error).message };
  }
}

function realIo(): LaneIo {
  return {
    sh: (shArgs, inherit) => {
      const [command, ...rest] = shArgs;
      const exe = command === "run" ? process.execPath : command!;
      const run = spawnSync(exe, rest, {
        cwd: root,
        encoding: "utf8",
        stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      });
      return { status: run.status ?? 1, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
    },
    cwd: root,
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  };
}

if (import.meta.main) main(process.argv.slice(2));
