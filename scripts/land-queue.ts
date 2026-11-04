// The one process that waits for CI. An author runs `bun run lane:close`, reads three lines and leaves;
// this drains everything that was handed over, in the order it became ready.
//
//   bun run lane:close --queue                       # land every ready PR into beta
//   bun run lane:close --queue --base beta --label land:queue
//   bun run lane:close --queue --pr 2278             # only that PR; lane:close starts this in the background
//
// Ready means the PR carries the `land:queue` label, which `bun run lane:close` adds at hand-off. Every
// GitHub call goes through `gh api` (`scripts/github.ts`), which has no auto-merge, so the label is the
// only signal. Drafts and other repositories' branches are not ready. A lane hands off by running `bun run lane:close`; it
// never rebases, labels or waits, and the branch it pushed is merged as-is unless the base moved.
//
// Per PR, oldest-ready first, the queue:
//   1. rebases the branch onto the base when GitHub says it is behind, so a moved base costs one CI
//      run instead of one cancelled run plus its replacement;
//   2. waits once for the checks to settle, polling every 10 s up to 25 minutes;
//   3. merges, and prints one line with that PR's wait time and the run it waited on.
// When nothing is ready it prints that and exits 0.
//
// The rebase happens in a throwaway worktree, so it never touches the tree of the lane that pushed:
// a queued rebase rewrites the remote branch only, and the lane that owned it is finished either way.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { attemptsOf, judgeChecks, runIdFrom } from "./ci-status";
import type { RollupEntry } from "./ci-status";
import { checkoutGitHub, type GhResult, type GitHub, type Pull } from "./github";
import { needsRegenerate, rebaseResolvingGenerated, regenerateAndCommit } from "./generated-rebase";
import { MERGE_ATTEMPTS, QUEUE_LABEL, baseMoved, checkVerdict, duration, formatFailures, runAt } from "./land";
import type { GhCheck, Run } from "./land";

const root = fileURLToPath(new URL("..", import.meta.url));

export const EXIT_DRAINED = 0;
export const EXIT_SOMETHING_FAILED = 1;

/** CI settles in 2.6–3.0 minutes here; 25 minutes is the ceiling before the queue gives up on a PR. */
export const WAIT_TIMEOUT_MS = 25 * 60_000;
export const POLL_MS = 10_000;
/** How long a rerun of a cancelled run gets to register its jobs before its cancellations count. */
export const RERUN_GRACE_MS = 120_000;

export type Git = (cwd: string, args: string[]) => Run;

export interface QueueArgs {
  base: string;
  label: string;
  /** Land only this PR: what `lane:close` starts in the background for the PR it just handed over. */
  pr?: number;
}

/** `--base beta`, `--label land:queue` and `--pr <n>`; anything else is a typo. */
export function parseArgs(argv: readonly string[]): QueueArgs {
  const args: QueueArgs = { base: "beta", label: QUEUE_LABEL };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") args.base = value(argv, (i += 1), arg);
    else if (arg === "--label") args.label = value(argv, (i += 1), arg);
    else if (arg === "--pr") {
      const pr = Number(value(argv, (i += 1), arg));
      if (!Number.isInteger(pr) || pr <= 0) throw new Error("--pr needs a PR number");
      args.pr = pr;
    } else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function value(argv: readonly string[], at: number, flag: string): string {
  const found = argv[at];
  if (found === undefined || found.startsWith("--")) throw new Error(`${flag} needs a value`);
  return found;
}

/** One listed PR, narrowed to what makes it ready and orders it. */
export type PrRow = Pick<Pull, "number" | "url" | "headRefName" | "isDraft" | "isCrossRepository" | "updatedAt" | "labels">;

export interface ReadyPr {
  number: number;
  url: string;
  branch: string;
  /** Milliseconds since the epoch, when it became ready: what the drain is ordered by. */
  readyAt: number;
}

function timeOf(text: string | null | undefined, fallback: number): number {
  const at = text === null || text === undefined ? Number.NaN : Date.parse(text);
  return Number.isFinite(at) ? at : fallback;
}

/**
 * Labelled PRs, oldest-ready first. Readiness time is the PR's last update, which is the moment the
 * label was added; never the branch name, which says nothing about who waited longest.
 */
export function readyPrs(rows: readonly PrRow[], label: string, now = Date.now()): ReadyPr[] {
  const ready: ReadyPr[] = [];
  for (const row of rows) {
    if (row.isDraft || row.isCrossRepository) continue;
    if (!row.labels.includes(label)) continue;
    ready.push({ number: row.number, url: row.url, branch: row.headRefName, readyAt: timeOf(row.updatedAt, now) });
  }
  return ready.sort((a, b) => a.readyAt - b.readyAt || a.number - b.number);
}

export interface PrView {
  number: number;
  url: string;
  state: string;
  headRefName: string;
  headRefOid?: string;
  mergeStateStatus?: string;
  statusCheckRollup?: RollupEntry[] | null;
}

export interface QueueIo {
  github: GitHub;
  git: Git;
  /** The one place this process sleeps, between polls. */
  pause: (ms: number) => void;
  now: () => number;
  log: (line: string) => void;
  error: (line: string) => void;
  /** An isolated checkout of a branch to rebase in, when the lane's own tree is elsewhere or busy. */
  checkout?: (branch: string) => { dir: string; release: () => void } | null;
  /** Runs a generator after a rebase; `bun run gen` in the rebased tree by default. */
  exec?: (command: readonly string[]) => Run;
}

function details(result: Run): string {
  return (result.stderr || result.stdout).trim();
}

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? text.trim();
}

/** Reads that may fail in a row before the queue gives up on a PR: GitHub answers a 500 now and then. */
export const READ_ATTEMPTS = 3;

/**
 * The PR and the checks on its head commit, or what GitHub last answered when it could not be read
 * {@link READ_ATTEMPTS} times in a row, a poll apart. Every read the queue makes goes through here.
 */
export function readView(io: Pick<QueueIo, "github" | "pause" | "log">, number: number): GhResult<PrView> {
  for (let attempt = 1; ; attempt += 1) {
    const read = readViewOnce(io.github, number);
    if (read.ok) return read;
    if (attempt >= READ_ATTEMPTS) return { ok: false, error: `failed ${attempt} times in a row: ${firstLine(read.error)}` };
    io.log(`#${number}: reading the PR failed (${firstLine(read.error)}); trying again`);
    io.pause(POLL_MS);
  }
}

function readViewOnce(github: GitHub, number: number): GhResult<PrView> {
  const pull = github.pull(number);
  if (!pull.ok) return pull;
  const view = pull.value;
  const settled: GhResult<RollupEntry[]> = { ok: true, value: [] };
  const checks = view.state === "OPEN" ? github.checks(view.headRefOid) : settled;
  if (!checks.ok) return checks;
  return {
    ok: true,
    value: {
      number: view.number,
      url: view.url,
      state: view.state,
      headRefName: view.headRefName,
      headRefOid: view.headRefOid,
      mergeStateStatus: view.mergeStateStatus,
      statusCheckRollup: checks.value,
    },
  };
}

export interface CheckReport {
  checks: GhCheck[];
  runIds: number[];
}

/** The PR's checks as land judges them — one per name, on this commit — plus the Action runs they belong to. */
export function checkReport(view: PrView): CheckReport {
  const judged = judgeChecks(attemptsOf(view.statusCheckRollup ?? []), view.headRefOid);
  const runIds = [...new Set(judged.map((check) => check.runId).filter((id): id is number => id !== null))];
  return {
    checks: judged.map((check) => ({ name: check.name, state: check.state, bucket: check.bucket, link: check.url })),
    runIds,
  };
}

export type WaitVerdict = "green" | "failed" | "timedout" | "unreadable";

export interface WaitResult {
  verdict: WaitVerdict;
  checks: GhCheck[];
  runIds: number[];
  waitedMs: number;
  detail: string;
}

/**
 * Wait once for one PR's checks. This is the only loop in the repo that sleeps on CI, and the
 * queue is the only process allowed to: authors hand off and read `bun run ci:status --pr N`.
 */
export function waitForGreen(number: number, io: QueueIo): WaitResult {
  const startedAt = io.now();
  let runIds: number[] = [];
  let rerunAt: number | null = null;
  for (;;) {
    const read = readView(io, number);
    if (!read.ok) {
      return { verdict: "unreadable", checks: [], runIds, waitedMs: io.now() - startedAt, detail: `reading the PR ${read.error}` };
    }
    const view = read.value;
    if (view.state === "MERGED") {
      return { verdict: "green", checks: [], runIds, waitedMs: io.now() - startedAt, detail: "already merged" };
    }
    if (view.state === "CLOSED") {
      return { verdict: "failed", checks: [], runIds, waitedMs: io.now() - startedAt, detail: "closed without merging" };
    }
    const report = checkReport(view);
    if (report.runIds.length > 0) runIds = report.runIds;
    const verdict = checkVerdict(report.checks);
    // A run cancelled by a newer run on the same commit (two pull_request events at once, PR #2496 on
    // 25 Oct) leaves its jobs cancelled before the replacement has any: while every failure is a
    // cancellation and something still runs, the verdict is not in yet.
    const cancelled = new Set(report.checks.filter((check) => check.bucket === "cancel" || check.state === "CANCELLED").map((check) => check.name));
    const allCancelled = verdict.failures.every((failure) => cancelled.has(failure.name));
    const onlySuperseded = allCancelled && verdict.pending.length > 0;
    // Cancelled with nothing running to replace it (a PR body edit used to do this): no check failed,
    // the run just never reached a verdict, so it is run again once rather than read as a failure.
    // A rerun takes a moment to register its jobs; until then the old cancellations are all there is.
    let rerunning = rerunAt !== null && allCancelled && io.now() - rerunAt < RERUN_GRACE_MS;
    if (verdict.failures.length > 0 && allCancelled && verdict.pending.length === 0 && rerunAt === null) {
      const cancelledRuns = [
        ...new Set(
          report.checks
            .filter((check) => cancelled.has(check.name))
            .map((check) => runIdFrom(check.link ?? ""))
            .filter((id): id is number => id !== null),
        ),
      ];
      if (cancelledRuns.length > 0) {
        rerunAt = io.now();
        for (const id of cancelledRuns) io.github.rerunRun(id);
        io.log(`#${number}: run ${cancelledRuns.join(", ")} was cancelled before a verdict; running it again`);
        rerunning = true;
      }
    }
    if (verdict.failures.length > 0 && !onlySuperseded && !rerunning) {
      return {
        verdict: "failed",
        checks: report.checks,
        runIds,
        waitedMs: io.now() - startedAt,
        detail: formatFailures(verdict.failures).join("\n").trim(),
      };
    }
    if (verdict.failures.length === 0 && verdict.pending.length === 0 && report.checks.length > 0) {
      return { verdict: "green", checks: report.checks, runIds, waitedMs: io.now() - startedAt, detail: "" };
    }
    if (io.now() - startedAt >= WAIT_TIMEOUT_MS) {
      const on = runIds.length > 0 ? ` (run ${runIds.join(", ")})` : "";
      const pending = verdict.pending.join(", ") || "no checks reported";
      return {
        verdict: "timedout",
        checks: report.checks,
        runIds,
        waitedMs: io.now() - startedAt,
        detail: `still running after ${WAIT_TIMEOUT_MS / 60_000} minutes: ${verdict.pending.length} of ${report.checks.length}${on}: ${pending}`,
      };
    }
    io.pause(POLL_MS); // land:queue is the one process that waits for CI; everything else asks ci:status
  }
}

export interface RebaseResult {
  rebased: boolean;
  refusal: string | null;
}

/**
 * Rebase `branch` onto `origin/<base>` in a throwaway checkout and push it back with a lease on the
 * tip that was read first. A branch that is already up to date is left exactly as the lane pushed it.
 */
export function rebaseOntoBase(options: { branch: string; base: string; io: QueueIo }): RebaseResult {
  const { branch, base, io } = options;
  const fetched = io.git(root, ["fetch", "--no-tags", "origin", base, branch]);
  if (fetched.status !== 0) return { rebased: false, refusal: `fetch origin ${branch} ${base} failed: ${details(fetched)}` };

  const tip = io.git(root, ["rev-parse", `origin/${branch}`]);
  if (tip.status !== 0) return { rebased: false, refusal: `cannot read origin/${branch}: ${details(tip)}` };

  const behind = io.git(root, ["rev-list", "--count", `origin/${branch}..origin/${base}`]);
  const count = Number(behind.stdout.trim());
  if (behind.status !== 0 || !Number.isFinite(count)) {
    return { rebased: false, refusal: `could not count commits behind origin/${base}: ${details(behind)}` };
  }
  if (count === 0) return { rebased: false, refusal: null };

  // The lane's own tree, when it is this branch, clean and exactly the pushed tip: the lane has handed
  // off and is waiting, and only this tree has the installed generators a rebase may need.
  const ownBranch = io.git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const ownTip = io.git(root, ["rev-parse", "HEAD"]).stdout.trim();
  const ownDirty = io.git(root, ["status", "--porcelain"]);
  const inPlace = ownBranch === branch && ownTip === tip.stdout.trim() && ownDirty.status === 0 && ownDirty.stdout.trim() === "";
  const checkout = inPlace ? { dir: root, release: () => {} } : (io.checkout ?? worktreeCheckout(io))(branch);
  if (checkout === null) return { rebased: false, refusal: `could not check out ${branch} to rebase it` };
  try {
    const git = (args: string[]): Run => io.git(checkout.dir, args);
    // Generated files and the lane's own note never stop the queue: the same resolution land uses.
    const rebased = rebaseResolvingGenerated(git, `origin/${base}`);
    if (!rebased.ok) {
      const files = rebased.conflicts.length > 0 ? ` in ${rebased.conflicts.join(", ")}` : "";
      return { rebased: false, refusal: `rebase onto origin/${base} hit a conflict${files}: ${rebased.detail}` };
    }
    const branchPaths = git(["diff", "--name-only", `origin/${base}...HEAD`]).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    // Without the lane's tree there is no generator to run: a clean textual merge is pushed as it
    // always was, and only a generated file that actually conflicted sends the lane back.
    if (inPlace ? needsRegenerate(rebased, branchPaths) : rebased.regenerate.length > 0) {
      if (!inPlace) {
        git(["reset", "--hard", tip.stdout.trim()]);
        return {
          rebased: false,
          refusal: `the base moved and ${branch}'s generated files need \`bun run gen\` on the merged source; run bun run lane:close again in ${branch}'s own tree`,
        };
      }
      const failed = regenerateAndCommit(git, io.exec ?? (([program = "bun", ...args]) => runAt(checkout.dir, program, args, 20 * 60_000)));
      if (failed !== null) {
        git(["reset", "--hard", tip.stdout.trim()]);
        return { rebased: false, refusal: failed };
      }
    }
    const pushed = io.git(checkout.dir, [
      "push",
      `--force-with-lease=${branch}:${tip.stdout.trim()}`,
      "origin",
      `HEAD:${branch}`,
    ]);
    if (pushed.status !== 0) return { rebased: false, refusal: `push after the rebase failed: ${details(pushed)}` };
    return { rebased: true, refusal: null };
  } finally {
    checkout.release();
  }
}

/** A temporary worktree of one branch, so the rebase never moves the tree of the lane that pushed. */
function worktreeCheckout(io: QueueIo): (branch: string) => { dir: string; release: () => void } | null {
  return (branch: string) => {
    const dir = mkdtempSync(join(tmpdir(), "land-queue-"));
    const added = io.git(root, ["worktree", "add", "--detach", "--force", dir, `origin/${branch}`]);
    if (added.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      return null;
    }
    return {
      dir,
      release: () => {
        io.git(root, ["worktree", "remove", "--force", dir]);
        rmSync(dir, { recursive: true, force: true });
      },
    };
  };
}

export type Outcome = "landed" | "failed" | "skipped";

export interface Drained {
  pr: ReadyPr;
  outcome: Outcome;
  waitedMs: number;
  runIds: number[];
  detail: string;
}

/** One line per PR, so a drain reads at a glance and a lane's wait is a number. */
export function formatOutcome(drained: Drained): string {
  const head = `#${drained.pr.number} ${drained.pr.branch}`;
  const runs = drained.runIds.length > 0 ? `, run ${drained.runIds.join(", ")}` : "";
  const detail = drained.detail
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("; ");
  if (drained.outcome === "landed") {
    return drained.waitedMs === 0
      ? `${head} landed without waiting${runs}`
      : `${head} landed: waited ${duration(drained.waitedMs)}${runs}`;
  }
  if (drained.outcome === "skipped") return `${head} skipped: ${detail}`;
  return `${head} not landed: waited ${duration(drained.waitedMs)}${runs}: ${detail}`;
}

/** Land one ready PR: rebase if the base moved, wait once, merge, and report what it cost. */
export function landOne(pr: ReadyPr, args: QueueArgs, io: QueueIo): Drained {
  const startedAt = io.now();
  let runIds: number[] = [];
  let waitedMs = 0;
  const done = (outcome: Outcome, detail: string): Drained => ({
    pr,
    outcome,
    waitedMs,
    runIds,
    detail,
  });

  for (let attempt = 1; attempt <= MERGE_ATTEMPTS; attempt += 1) {
    const read = readView(io, pr.number);
    if (!read.ok) return done("failed", `could not read the PR: ${firstLine(read.error)}`);
    const view = read.value;
    if (view.state === "MERGED") return done("landed", "it was already merged");
    if (view.state !== "OPEN") return done("skipped", `state ${view.state}`);
    if (view.mergeStateStatus === "DIRTY") return done("failed", "conflicts with the base; a person has to resolve it");

    if (view.mergeStateStatus === "BEHIND") {
      const rebased = rebaseOntoBase({ branch: pr.branch, base: args.base, io });
      if (rebased.refusal !== null) return done("failed", rebased.refusal);
      io.log(`#${pr.number} ${pr.branch} rebased onto origin/${args.base} before waiting`);
    }

    const waited = waitForGreen(pr.number, io);
    waitedMs += waited.waitedMs;
    if (waited.runIds.length > 0) runIds = waited.runIds;
    if (waited.verdict === "green") {
      const merged = io.github.mergePull(pr.number);
      if (merged.ok) {
        return done("landed", waited.detail);
      }
      // A person or another queue run may have merged it a moment earlier.
      const after = readView(io, pr.number);
      if (after.ok && after.value.state === "MERGED") return done("landed", "it was merged first by someone else");
      const why = merged.error;
      if (!baseMoved(why)) return done("failed", firstLine(why));
      if (attempt === MERGE_ATTEMPTS) return done("failed", `base kept moving: ${firstLine(why)}`);
      io.log(`#${pr.number} ${pr.branch} merge refused because origin/${args.base} moved; rebasing and waiting again`);
      continue;
    }
    if (waited.verdict === "failed") return done("failed", waited.detail);
    if (waited.verdict === "timedout") return done("failed", waited.detail);
    return done("failed", waited.detail);
  }
  return done("failed", `not merged after ${MERGE_ATTEMPTS} attempts`);
}

/**
 * Land one named PR, labelled or not, and print one line: what `lane:close` runs in the background so
 * the lane that handed the PR over keeps working instead of sitting in the queue.
 */
export function drainOne(number: number, args: QueueArgs, io: QueueIo): { code: number; drained: Drained[] } {
  const read = readView(io, number);
  if (!read.ok) {
    io.error(`#${number} could not be read: ${firstLine(read.error)}`);
    return { code: EXIT_SOMETHING_FAILED, drained: [] };
  }
  const pr: ReadyPr = { number, url: read.value.url, branch: read.value.headRefName, readyAt: io.now() };
  const result = landOne(pr, args, io);
  const line = formatOutcome(result);
  if (result.outcome === "failed") io.error(line);
  else io.log(line);
  return { code: result.outcome === "landed" ? EXIT_DRAINED : EXIT_SOMETHING_FAILED, drained: [result] };
}

/** Every ready PR into `base`, in readiness order, one at a time. */
export function drain(args: QueueArgs, io: QueueIo): { code: number; drained: Drained[] } {
  if (args.pr !== undefined) return drainOne(args.pr, args, io);
  const startedAt = io.now();
  const listed = io.github.listPulls({ base: args.base, state: "open", limit: 50 });
  if (!listed.ok) {
    io.error(`listing PRs failed: ${listed.error}`);
    return { code: EXIT_SOMETHING_FAILED, drained: [] };
  }

  const ready = readyPrs(listed.value, args.label, io.now());
  if (ready.length === 0) {
    io.log(`nothing ready: no open PR into ${args.base} has the ${args.label} label`);
    return { code: EXIT_DRAINED, drained: [] };
  }

  io.log(`${ready.length} ready: ${ready.map((pr) => `#${pr.number}`).join(", ")}`);
  const drained: Drained[] = [];
  for (const pr of ready) {
    const result = landOne(pr, args, io);
    drained.push(result);
    const line = formatOutcome(result);
    if (result.outcome === "failed") io.error(line);
    else io.log(line);
  }

  const landed = drained.filter((entry) => entry.outcome === "landed").length;
  io.log(`drained ${landed} of ${drained.length} in ${duration(io.now() - startedAt)}`);
  return { code: landed === drained.length ? EXIT_DRAINED : EXIT_SOMETHING_FAILED, drained };
}

/** `spawnSync` reports no status when the process died on a signal; that is a failure, not a pass. */
function run(command: string, cwd: string | undefined, args: string[]): Run {
  const result = spawnSync(command, args, { encoding: "utf8", ...(cwd === undefined ? {} : { cwd }) });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function main(): void {
  let args: QueueArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`land:queue: ${(error as Error).message}`);
    process.exit(EXIT_SOMETHING_FAILED);
  }

  const result = drain(args, {
    github: checkoutGitHub(root),
    git: (cwd, gitArgs) => run("git", cwd, gitArgs),
    pause,
    now: Date.now,
    log: (line) => console.log(`land:queue: ${line}`),
    error: (line) => console.error(`land:queue: ${line}`),
  });
  process.exit(result.code);
}

function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

if (import.meta.main) main();
