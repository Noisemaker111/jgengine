// The last step of a lane, done as one command so it is not a paragraph of remembered steps:
//
//   bun run lane:close -m "Wolves hunt in packs"   # the current branch's lane, with its change note
//   bun run lane:close --pr 2274
//   bun run lane:close --allow bun.lock  # keep a file the commit guards refuse
//
// It runs `bun run preflight --no-verify` (the install, conflict markers and gen, on this PC), then
// `verify:fast --landing`: the type-checks, every gate CI runs, the tests and the site build, on a
// boat.dev Linux machine when boat is usable, with only the steps that need this PC (a game boot, a
// Windows-only test) here in a fairshare slot (scripts/verify-boat.ts). A passing verify:fast --landing
// of this exact tree, run by hand just before, is reused in one line instead of run again. It writes the
// game suite scores those tests earned, lands (staging and committing the lane's work with a `changes/`
// note written from the -m messages - see scripts/change-note.ts - pushing and opening the PR), and then
// merges the PR itself.
//
// The merge is gated on the receipt, not on GitHub: the pushed head's tree must be a tree verify:fast
// passed on, apart from what lane:close itself wrote after it (the suite scores, and the change note
// land renders from -m, which no test or gate reads). A head that differs otherwise - a rebase onto a conflicting
// base, a file edited while verify ran - is verified again first, and the unit cache reruns only what
// changed. GitHub merges the PR only while its head is that commit. CI on the beta push stays the
// backstop. The last line names the merge commit; exit 1 when verify, land or the merge failed, 3 when
// it cannot answer (no PR, no branch).
//
// On the boat host (scripts/verify-boat.ts `onBoatHost`) verify:fast runs every step right there. When
// some step only Jon's PC can run (a Windows-only test file) was reached, verify exits EXIT_NEEDS_PC:
// lane:close still commits, pushes and opens the PR, merges nothing, and ends naming the command a PC
// thread runs to verify and merge it there (exit 76).
//
// One run per worktree: a second lane:close started while the first is still verifying is
// refused (exit 4) and told which run holds the worktree, instead of racing it for the same
// files, browsers and commit. The lock names the run's pid and goes with it, so a run that
// crashed or was killed by a timeout leaves a lock the next run breaks on its own.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { assertCheckoutReady } from "./checkout-ready";
import { workingTree } from "./boat-snapshot";
import { gitHub, repoFromRemote, type GitHub } from "./github";
import { MERGE_ATTEMPTS, mergeVerified, parseLock, pidIsAlive, staleReason, type LandLock } from "./land";
import { betaLaneClose, gitIn, landingRoot, landingScript, receiptsBehind } from "./landing-code";
import { printHelpIfAsked } from "./script-help";
import { isVerbose, takeVerboseFlag } from "./verbosity";
import { EXIT_BOAT_SPENT, EXIT_NEEDS_PC } from "./verify-boat";
import { passingReceipt } from "./verify-receipt";

const LANE_CLOSE_USAGE = {
  summary: "verify, land and merge this lane's PR, and print the lane report",
  usage: "bun run lane:close [-m <message> ...] [--pr <number>] [--allow <path>] [--verbose] | --batch <branch ...>",
  flags: [
    { flag: "-m, --message <text>", detail: "what changed, in plain words; repeatable. Prefix `Fixed:`, `Added:`, `Removed:` or `Migrate:` for that changelog heading (default Changed). Becomes changes/<branch>.md, the commit message and the PR body" },
    { flag: "--batch <branch ...>", detail: "land several finished branches as one push instead (the rest of the arguments go to the batch; --help there lists them)" },
    { flag: "--pr <number>", detail: "the PR to close; default: the open PR for this branch" },
    { flag: "--allow <path>", detail: "a path land --commit may take although its guards refuse it; repeatable" },
    { flag: "--verbose", detail: "also print each stage, every pass and every committed path (by default the failures, the summaries and the report)" },
  ],
  example: 'bun run lane:close -m "Wolves hunt in packs" -m "Fixed: a tamed wolf no longer despawns at night"',
  exits: [
    "0 merged",
    "1 verify, land or the merge failed",
    "3 cannot answer (no PR, no branch)",
    "4 another lane:close is still running in this worktree",
    "75 boat had no start for the Linux steps; close again when it frees",
    "76 on the boat host: the PR is open and every step here passed, but steps only Jon's PC can run were reached; a PC thread closes it",
    "78 this checkout has no node_modules - run bun install, or bun run agent:bootstrap",
  ],
} as const;

export const EXIT_CLOSED = 0;
export const EXIT_VERIFY_FAILED = 1;
export const EXIT_CANNOT_ANSWER = 3;
export const EXIT_ANOTHER_RUN = 4;

/** The lock file's name inside the worktree's git directory. */
export const LANE_LOCK_FILE = "lane-close.lock";

const root = landingRoot(import.meta.url);

export interface LaneCloseArgs {
  pr?: number;
  /** Paths `land --commit` may take although its guards refuse them; repeatable. */
  allow?: string[];
  /** `-m`: the lane's own words for its change note; repeatable. */
  messages?: string[];
}

export function parseArgs(argv: readonly string[]): LaneCloseArgs {
  const args: LaneCloseArgs = { allow: [], messages: [] };
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
    } else if (arg === "-m" || arg === "--message") {
      const message = argv[(i += 1)];
      if (message === undefined || message.trim().length === 0) throw new Error(`${arg} needs the words for the change note`);
      (args.messages ??= []).push(message);
    } else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

export interface ReportInput {
  branch: string;
  pr: number;
  prUrl?: string | undefined;
  /** The merge commit on the base. */
  merged: string;
  filesChanged: string;
}

/** The report a lane pastes: the numbers, filled in, with nothing to write by hand. */
export function reportSkeleton(input: ReportInput): string {
  return [
    "Lane report",
    `- branch: ${input.branch}`,
    `- PR: #${input.pr} merged${input.prUrl === undefined ? "" : ` ${input.prUrl}`}`,
    `- merge commit: ${input.merged}`,
    `- files changed: ${input.filesChanged}`,
  ].join("\n");
}

/** The file operations the worktree lock needs, so a test can hold one in memory. */
export interface LaneLockFs {
  /** Create the file holding `text` only when it does not exist; false when it does. */
  create: (path: string, text: string) => boolean;
  read: (path: string) => string | null;
  remove: (path: string) => void;
  mtimeMs: (path: string) => number | null;
}

export interface LaneIo {
  /** Runs one command; `inherit` streams its output instead of capturing it. */
  sh: (argv: string[], inherit: boolean) => { status: number; stdout: string; stderr: string };
  cwd: string;
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  lock: LaneLockFs;
  /** This run, as the lock records it. */
  pid: number;
  now: () => number;
  alive: (pid: number) => boolean;
  /** The working tree's id (`workingTree`): the same id is the same bytes. */
  tree: () => string;
  /** The passing `verify:fast --landing` receipt for `tree` against this branch's merge base, or null. */
  passedOn: (tree: string) => string | null;
  /** Why this lane's verify:fast cannot write a receipt this landing code reads (`receiptsBehind`), or null. */
  receiptsBehind: () => string | null;
  /** The GitHub client for `repo`; by default `gh api` through `sh`. */
  github?: (repo: string) => GitHub;
  /** Waits between merge attempts while another merge moves the base. */
  pause?: (ms: number) => void;
}

/** The lock another run holds, or the lock this run now holds with the release that drops it. */
type LaneHold = { release: () => void } | { heldBy: string };

/**
 * Take this worktree's lane:close lock: `<git dir>/lane-close.lock`, one per worktree since
 * each worktree has its own git directory. A lock whose pid is gone, or that is older than
 * land's 30 minutes, is broken with a note; a live one is reported, never waited on.
 */
function holdWorktree(branch: string, io: LaneIo): LaneHold | null {
  const gitDir = io.sh(["git", "rev-parse", "--absolute-git-dir"], false);
  const dir = gitDir.stdout.trim();
  if (gitDir.status !== 0 || dir.length === 0) return null;
  const path = join(dir, LANE_LOCK_FILE);
  const mine: LandLock = { branch, pid: io.pid, startedAt: io.now() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (io.lock.create(path, `${JSON.stringify(mine)}\n`)) {
      return {
        release: () => {
          const text = io.lock.read(path);
          const held = text === null ? null : parseLock(text);
          if (held !== null && held.pid !== io.pid) return;
          io.lock.remove(path);
        },
      };
    }
    const text = io.lock.read(path);
    const held = text === null ? null : parseLock(text);
    const reason = staleReason(held, io.lock.mtimeMs(path) ?? io.now(), io.now(), io.alive);
    if (reason === null) return { heldBy: describeHolder(held, path, io.now()) };
    const who = held === null ? "an unreadable lock" : `${held.branch} (pid ${held.pid})`;
    io.out(`lane:close: breaking a stale lock from ${who}: ${reason}`);
    io.lock.remove(path);
  }
  return { heldBy: `a lock that reappears at ${path}` };
}

function describeHolder(held: LandLock | null, path: string, now: number): string {
  if (held === null) return `an unreadable lock at ${path}`;
  const ago = Math.max(0, Math.round((now - held.startedAt) / 1000));
  return `${held.branch} (pid ${held.pid}, started ${new Date(held.startedAt).toISOString()}, ${ago}s ago; lock ${path})`;
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

  const hold = holdWorktree(branch, io);
  if (hold === null) {
    io.err("lane:close: could not find this worktree's git directory for its lock");
    return EXIT_CANNOT_ANSWER;
  }
  if ("heldBy" in hold) {
    io.err(
      `lane:close: another lane:close is still running in this worktree: ${hold.heldBy}. ` +
        "Let it finish; do not start a second one.",
    );
    return EXIT_ANOTHER_RUN;
  }
  try {
    return closeHeldLane(args, branch, io);
  } finally {
    hold.release();
  }
}

function closeHeldLane(args: LaneCloseArgs, branch: string, io: LaneIo): number {
  // The cheap checks first, stopping at the first failure: `bun run preflight` regenerates every
  // committed derived file (a stale manifest, api.md or ledger was the most common reason a lane
  // failed to land, and the fix was always `bun run gen`), then runs the type-checks and gates.
  // A type error used to surface only after the whole test suite. land --commit stages what gen rewrote.
  // The stage lines are progress, kept for --verbose; each stage's own failure names the stage.
  const stage = isVerbose(io.env) ? io.out : (): void => {};
  // Merging needs a receipt this code can read, and the receipt comes from the lane's own verify:fast.
  // A lane too old to write one learns that now, not after the whole suite (scripts/landing-code.ts).
  const behind = io.receiptsBehind();
  if (behind !== null) {
    io.err(`lane:close: ${behind}; nothing ran and nothing landed. Merge beta into this branch (git merge origin/beta) and close again.`);
    return EXIT_VERIFY_FAILED;
  }
  // A `verify:fast --landing` that passed on these exact bytes (run by hand just before) already
  // proved what preflight and verify would: its gates fail on a stale generated file, so gen has
  // nothing to rewrite. Both are skipped, in one line, instead of spending minutes on the same answer.
  const already = io.passedOn(io.tree());
  let needsPc = false;
  if (already !== null) {
    io.out(`lane:close: verify:fast --landing already passed on this exact tree (${already}); preflight and verify not run again`);
  } else {
    stage(`lane:close: ${branch} — preflight (install, conflict markers, gen)`);
    const preflight = io.sh(["run", "preflight", "--no-verify"], true);
    if (preflight.status !== 0) {
      io.err(`lane:close: preflight failed (exit ${preflight.status}); nothing landed, no tests run. Fix what it names and close again.`);
      return EXIT_VERIFY_FAILED;
    }
    stage(`lane:close: ${branch} — verify:fast --landing (type-checks, gates, tests, boots and the site build)`);
    const verified = verify(io);
    if (verified === "failed") return EXIT_VERIFY_FAILED;
    needsPc = verified === "needs-pc";
  }
  const verifiedTree = io.tree();
  if (!needsPc && io.passedOn(verifiedTree) === null) {
    io.err("lane:close: the files changed while verify:fast ran, so its pass covers no tree here; nothing landed. Close again.");
    return EXIT_VERIFY_FAILED;
  }

  // The tests rewrote each game's suite report (here or on boat, which sends it back): write its score
  // into the README and PLAN now, so the lane's commit carries the score its own proofs earned.
  const scored = io.sh(["run", "scripts/gen-game-suite.ts"], true);
  if (scored.status !== 0) {
    io.err(`lane:close: writing the game suite scores failed (exit ${scored.status}); nothing landed.`);
    return EXIT_VERIFY_FAILED;
  }
  const scoredPaths = new Set(changedBetween(verifiedTree, io.tree(), io));

  stage("lane:close: land --commit");
  const landArgs = [
    "run",
    landingScript(import.meta.url, "land.ts"),
    "--commit",
    ...(args.allow ?? []).flatMap((path) => ["--allow", path]),
    ...(args.messages ?? []).flatMap((message) => ["-m", message]),
  ];
  const landed = io.sh(landArgs, true);
  if (landed.status !== 0) {
    io.err(`lane:close: land exited ${landed.status}; the lane is not closed`);
    return landed.status;
  }

  const remote = io.sh(["git", "remote", "get-url", "origin"], false);
  const repo = remote.status === 0 ? repoFromRemote(remote.stdout) : null;
  const pr = args.pr ?? (repo === null ? null : branchPr(branch, repo, io));
  if (repo === null || pr === null) {
    io.err(`lane:close: landed ${branch} but cannot name its PR; nothing merged`);
    return EXIT_CANNOT_ANSWER;
  }
  const github = io.github?.(repo) ?? gitHub((ghArgs) => io.sh(["gh", ...ghArgs], false), repo);
  const files = filesChanged(io);
  if (needsPc) {
    io.err(
      `lane:close: #${pr} is pushed and open, and every step this boat host could run passed; nothing merged, because the steps ` +
        "verify:fast named above need Jon's PC. Needs a PC thread: in a checkout of " +
        `${branch} on the PC, \`bun run lane:close --pr ${pr}\` (it verifies there, then merges).`,
    );
    return EXIT_NEEDS_PC;
  }

  for (let attempt = 1; attempt <= MERGE_ATTEMPTS; attempt += 1) {
    const proof = proveHead(verifiedTree, scoredPaths, io);
    if (proof !== null) {
      io.err(`lane:close: ${proof}; nothing merged, and #${pr} stays open. Fix it on this branch and close again.`);
      return EXIT_VERIFY_FAILED;
    }
    const head = io.sh(["git", "rev-parse", "HEAD"], false).stdout.trim();
    const merged = mergeVerified(github, pr, head, io.pause);
    if (merged.ok) {
      const view = github.pull(pr);
      io.out("");
      io.out(reportSkeleton({ branch, pr, prUrl: view.ok ? view.value.url : undefined, merged: merged.sha, filesChanged: files }));
      // A merged lane's worktree is a copy nobody will open again. Reaping here keeps
      // `.claude/worktrees` bounded; this lane's own tree stays, since a process
      // cannot delete the directory it runs in, and the next close takes it.
      const reaped = io.sh(["run", "worktree", "reap", "--fetch"], false);
      const reapLine = lastLine(reaped.stdout);
      if (reapLine.length > 0) stage(`lane:close: ${reapLine}`);
      io.out(`lane:close: merged #${pr} into beta as ${merged.sha}`);
      return EXIT_CLOSED;
    }
    if (!merged.baseMoved || attempt === MERGE_ATTEMPTS) {
      io.err(`lane:close: GitHub refused to merge #${pr}: ${merged.error}; the PR stays open.`);
      return EXIT_VERIFY_FAILED;
    }
    // The base now conflicts with the branch: land rebases it (generated files regenerated) and
    // pushes, and the next pass verifies the rebased tree before it merges.
    io.out(`lane:close: #${pr} conflicts with beta now; rebasing, then verifying the rebased tree`);
    const rebased = io.sh(["run", landingScript(import.meta.url, "land.ts")], true);
    if (rebased.status !== 0) {
      io.err(`lane:close: the rebase onto beta failed (land exited ${rebased.status}); #${pr} stays open.`);
      return rebased.status;
    }
  }
  return EXIT_VERIFY_FAILED;
}

/** `verify:fast --landing`, and what to do when it fails; `needs-pc` when only Jon's PC's steps are left. */
function verify(io: LaneIo): "passed" | "failed" | "needs-pc" {
  const verified = io.sh(["run", "verify:fast", "--landing"], true);
  if (verified.status === EXIT_NEEDS_PC) return "needs-pc";
  if (verified.status === EXIT_BOAT_SPENT) {
    io.err(
      "lane:close: boat.dev had no start for the Linux steps (verify:fast says until when, above); they did not run here " +
        "either, and nothing landed. Run lane:close again then, as a harness background command. Do not set JG_VERIFY_BOAT=0 " +
        "to land sooner: that runs the whole Linux suite on Jon's PC. Any other failure printed above is real.",
    );
    return "failed";
  }
  if (verified.status !== 0) {
    io.err(`lane:close: verify:fast failed (exit ${verified.status}); nothing merged. Fix what it names and close again.`);
    return "failed";
  }
  return "passed";
}

/** Paths whose content differs between two trees. */
function changedBetween(from: string, to: string, io: LaneIo): string[] {
  if (from === to) return [];
  return io.sh(["git", "diff", "--name-only", "--no-renames", from, to], false).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * Why HEAD may not merge yet, or null when a passing receipt covers it. HEAD's tree is covered when
 * verify:fast passed on it, or when it differs from the verified tree only in what lane:close wrote
 * after that run (the suite scores, and the change note land renders, which no test or gate reads). Any
 * other difference - a rebase, an edit made while verify ran - is verified again here.
 */
export function proveHead(verifiedTree: string, scoredPaths: ReadonlySet<string>, io: LaneIo): string | null {
  const headTree = io.sh(["git", "rev-parse", "HEAD^{tree}"], false).stdout.trim();
  if (io.passedOn(headTree) !== null) return null;
  const differs = changedBetween(verifiedTree, headTree, io);
  const unproven = differs.filter((path) => !scoredPaths.has(path) && !path.startsWith("changes/"));
  if (unproven.length > 0) {
    const named = `${unproven.slice(0, 3).join(", ")}${unproven.length > 3 ? ", ..." : ""}`;
    io.out(`lane:close: the pushed head differs from the verified tree in ${unproven.length} file(s) (${named}); verifying it`);
    const verified = verify(io);
    if (verified === "needs-pc") return "the pushed head reaches steps only Jon's PC can run (named above); a PC thread closes it";
    if (verified === "failed") return "verify:fast failed on the pushed head";
    if (io.passedOn(headTree) === null) return "the files changed while verify:fast ran on the pushed head";
  }
  return null;
}

/** This branch's PR: open, or already merged by an earlier close. */
function branchPr(branch: string, repo: string, io: LaneIo): number | null {
  const listed = gitHub((args) => io.sh(["gh", ...args], false), repo).listPulls({ head: branch, state: "all", limit: 1 });
  return listed.ok ? (listed.value[0]?.number ?? null) : null;
}

function filesChanged(io: LaneIo): string {
  const diff = io.sh(["git", "diff", "--shortstat", "origin/beta...HEAD"], false);
  const text = diff.stdout.trim();
  return text.length > 0 ? text : "none against origin/beta";
}

/** The landing mode besides closing this lane: `--batch` hands the rest of argv to its script. */
export function landingMode(argv: readonly string[]): { script: string; rest: string[] } | null {
  if (argv[0] === "--batch") return { script: landingScript(import.meta.url, "land-batch.ts"), rest: argv.slice(1) };
  return null;
}

function main(rawArgv: readonly string[]): void {
  // Every mode, --help included, runs beta's current landing code, so a landing fix reaches lanes
  // made before it (scripts/landing-code.ts).
  const beta = betaLaneClose(import.meta.url, root, gitIn(root), (line) => console.log(line));
  if (beta !== null && "problem" in beta) {
    console.error(`lane:close: cannot take beta's landing code: ${beta.problem}`);
    process.exit(EXIT_CANNOT_ANSWER);
  }
  if (beta !== null) {
    const run = spawnSync(process.execPath, [beta.script, ...rawArgv], { cwd: root, stdio: "inherit" });
    process.exit(run.status ?? 1);
  }
  const argv = takeVerboseFlag(rawArgv);
  const mode = landingMode(argv);
  if (mode !== null) {
    const run = spawnSync(process.execPath, [mode.script, ...mode.rest], { cwd: root, stdio: "inherit" });
    process.exit(run.status ?? 1);
  }
  if (printHelpIfAsked("lane-close", LANE_CLOSE_USAGE, argv)) process.exit(EXIT_CLOSED);
  const parsed = parseOrRefuse(argv);
  if ("problem" in parsed) {
    console.error(`lane:close: ${parsed.problem}`);
    process.exit(EXIT_CANNOT_ANSWER);
  } else {
    // A shell that gives up on a foreground command after two minutes moves this to the background,
    // and the agent then ended its turn with the landing half done.
    console.log(`lane:close: ${LANE_CLOSE_DURATION}`);
    markRunning(root);
    assertCheckoutReady("lane:close", root);
    process.exit(closeLane(parsed.args, realIo()));
  }
}

export const LANE_CLOSE_DURATION =
  "this takes several minutes (gen, every gate, the tests and the site build on a boat machine, or on the boat host itself, then the merge), longer while both boat machines are busy, which it waits for. Run it as a harness background command (Bash run_in_background) and wait for its exit before ending the turn; its last line names the merge commit. A passing verify:fast --landing of the same tree is reused, not run again.";

/** `.scratch/lane-close.json` while a close runs: the repo's Stop hook reads it, so a turn cannot end mid-landing. */
export const RUNNING_MARKER = join(".scratch", "lane-close.json");

function markRunning(checkout: string): void {
  const marker = join(checkout, RUNNING_MARKER);
  try {
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    process.on("exit", () => rmSync(marker, { force: true }));
  } catch {
    // The marker only helps the Stop hook; a close never fails for want of it.
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
    lock: realLockFs(),
    pid: process.pid,
    now: Date.now,
    alive: pidIsAlive,
    tree: () => workingTree(root).tree,
    receiptsBehind: () => receiptsBehind(import.meta.url, root),
    passedOn: (tree) => {
      const base = spawnSync("git", ["merge-base", "HEAD", "origin/beta"], { cwd: root, encoding: "utf8" });
      const mergeBase = (base.stdout ?? "").trim();
      if (base.status !== 0 || mergeBase.length === 0) return null;
      return passingReceipt(root, { tree, mergeBase, runtime: `bun ${Bun.version}`, scope: "landing", skillApi: false })?.path ?? null;
    },
  };
}

function realLockFs(): LaneLockFs {
  return {
    create: (path, text) => {
      try {
        writeFileSync(path, text, { flag: "wx" });
        return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // Windows answers EPERM while the holder's release is still deleting the file: it is
        // the same "someone has the lock" as EEXIST.
        if (code === "EEXIST" || (code === "EPERM" && process.platform === "win32")) return false;
        throw error;
      }
    },
    read: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    remove: (path) => rmSync(path, { force: true }),
    mtimeMs: (path) => {
      try {
        return statSync(path).mtimeMs;
      } catch {
        return null;
      }
    },
  };
}

if (import.meta.main) main(process.argv.slice(2));
