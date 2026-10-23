// The one process that waits for CI. An author runs `bun run land`, reads three lines and leaves;
// this drains everything that was handed over, in the order it became ready.
//
//   bun run land:queue                       # land every ready PR into beta
//   bun run land:queue --base beta --label land:queue
//
// Ready means auto-merge is armed — which is exactly what `bun run land` does at hand-off — or the
// PR carries the `land:queue` label, which land adds where the repo will not arm auto-merge. Drafts
// and other repositories' branches are not ready. A lane hands off by running `bun run land`; it
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
import { normalizeCheck, runIdFrom } from "./ci-status";
import type { RollupEntry } from "./ci-status";
import { MERGE_ATTEMPTS, QUEUE_LABEL, baseMoved, checkVerdict, duration, formatFailures } from "./land";
import type { GhCheck, Run } from "./land";

const root = fileURLToPath(new URL("..", import.meta.url));

export const EXIT_DRAINED = 0;
export const EXIT_SOMETHING_FAILED = 1;

/** CI settles in 2.6–3.0 minutes here; 25 minutes is the ceiling before the queue gives up on a PR. */
export const WAIT_TIMEOUT_MS = 25 * 60_000;
export const POLL_MS = 10_000;

export type Gh = (args: string[]) => Run;
export type Git = (cwd: string, args: string[]) => Run;

export interface QueueArgs {
  base: string;
  label: string;
}

/** `--base beta` and `--label land:queue`; anything else is a typo. */
export function parseArgs(argv: readonly string[]): QueueArgs {
  const args: QueueArgs = { base: "beta", label: QUEUE_LABEL };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") args.base = value(argv, (i += 1), arg);
    else if (arg === "--label") args.label = value(argv, (i += 1), arg);
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

function value(argv: readonly string[], at: number, flag: string): string {
  const found = argv[at];
  if (found === undefined || found.startsWith("--")) throw new Error(`${flag} needs a value`);
  return found;
}

/** One row of `gh pr list`, narrowed to what makes a PR ready and orders it. */
export interface PrRow {
  number: number;
  url: string;
  headRefName: string;
  isDraft?: boolean;
  isCrossRepository?: boolean;
  updatedAt?: string;
  autoMergeRequest?: { enabledAt?: string | null } | null;
  labels?: { name: string }[];
}

export interface ReadyPr {
  number: number;
  url: string;
  branch: string;
  /** Milliseconds since the epoch, when it became ready: what the drain is ordered by. */
  readyAt: number;
  signal: "auto-merge" | "label";
}

function timeOf(text: string | null | undefined, fallback: number): number {
  const at = text === null || text === undefined ? Number.NaN : Date.parse(text);
  return Number.isFinite(at) ? at : fallback;
}

/**
 * Ready PRs, oldest-ready first. Readiness time is auto-merge's `enabledAt`, else the PR's last
 * update, which is the moment the label was added; never the branch name, which says nothing about
 * who waited longest.
 */
export function readyPrs(rows: readonly PrRow[], label: string, now = Date.now()): ReadyPr[] {
  const ready: ReadyPr[] = [];
  for (const row of rows) {
    if (row.isDraft === true || row.isCrossRepository === true) continue;
    const armed = row.autoMergeRequest ?? null;
    const labelled = (row.labels ?? []).some((entry) => entry.name === label);
    if (armed === null && !labelled) continue;
    ready.push({
      number: row.number,
      url: row.url,
      branch: row.headRefName,
      readyAt: armed !== null ? timeOf(armed.enabledAt, now) : timeOf(row.updatedAt, now),
      signal: armed !== null ? "auto-merge" : "label",
    });
  }
  return ready.sort((a, b) => a.readyAt - b.readyAt || a.number - b.number);
}

export interface PrView {
  number: number;
  url: string;
  state: string;
  headRefName: string;
  mergeStateStatus?: string;
  statusCheckRollup?: RollupEntry[] | null;
}

export interface QueueIo {
  gh: Gh;
  git: Git;
  /** The one place a sleep is allowed; see the `wait-ok` on the poll. */
  pause: (ms: number) => void;
  now: () => number;
  log: (line: string) => void;
  error: (line: string) => void;
  /** An isolated checkout of a branch to rebase in, so the lane's own tree is never rewritten. */
  checkout?: (branch: string) => { dir: string; release: () => void } | null;
}

function details(result: Run): string {
  return (result.stderr || result.stdout).trim();
}

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? text.trim();
}

export function readView(gh: Gh, number: number): PrView | null {
  const view = gh(["pr", "view", String(number), "--json", "number,url,state,headRefName,mergeStateStatus,statusCheckRollup"]);
  if (view.status !== 0) return null;
  try {
    const parsed = JSON.parse(view.stdout) as PrView;
    return { ...parsed, number: parsed.number ?? number, statusCheckRollup: parsed.statusCheckRollup ?? [] };
  } catch {
    return null;
  }
}

export interface CheckReport {
  checks: GhCheck[];
  runIds: number[];
}

/** The PR's checks as land judges them, plus the Action runs they belong to. */
export function checkReport(view: PrView): CheckReport {
  const normalized = (view.statusCheckRollup ?? []).map(normalizeCheck);
  const runIds = [...new Set(normalized.map((check) => check.runId).filter((id): id is number => id !== null))];
  return { checks: normalized, runIds };
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
  for (;;) {
    const view = readView(io.gh, number);
    if (view === null) {
      return { verdict: "unreadable", checks: [], runIds, waitedMs: io.now() - startedAt, detail: "gh pr view failed" };
    }
    if (view.state === "MERGED") {
      return { verdict: "green", checks: [], runIds, waitedMs: io.now() - startedAt, detail: "already merged" };
    }
    if (view.state === "CLOSED") {
      return { verdict: "failed", checks: [], runIds, waitedMs: io.now() - startedAt, detail: "closed without merging" };
    }
    const report = checkReport(view);
    if (report.runIds.length > 0) runIds = report.runIds;
    const verdict = checkVerdict(report.checks);
    if (verdict.failures.length > 0) {
      return {
        verdict: "failed",
        checks: report.checks,
        runIds,
        waitedMs: io.now() - startedAt,
        detail: formatFailures(verdict.failures).join("\n").trim(),
      };
    }
    if (verdict.pending.length === 0 && report.checks.length > 0) {
      return { verdict: "green", checks: report.checks, runIds, waitedMs: io.now() - startedAt, detail: "" };
    }
    if (io.now() - startedAt >= WAIT_TIMEOUT_MS) {
      const pending = verdict.pending.join(", ") || "no checks reported";
      return {
        verdict: "timedout",
        checks: report.checks,
        runIds,
        waitedMs: io.now() - startedAt,
        detail: `still pending after ${WAIT_TIMEOUT_MS / 60_000} minutes: ${pending}`,
      };
    }
    io.pause(POLL_MS); // wait-ok: land:queue is the one process that waits for CI; everything else asks ci:status
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

  const checkout = (io.checkout ?? worktreeCheckout(io))(branch);
  if (checkout === null) return { rebased: false, refusal: `could not check out ${branch} to rebase it` };
  try {
    const rebased = io.git(checkout.dir, ["rebase", `origin/${base}`]);
    if (rebased.status !== 0) {
      io.git(checkout.dir, ["rebase", "--abort"]);
      return { rebased: false, refusal: `rebase onto origin/${base} hit a conflict: ${details(rebased)}` };
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
  const head = `#${drained.pr.number} ${drained.pr.branch} (${drained.pr.signal})`;
  const runs = drained.runIds.length > 0 ? `, run ${drained.runIds.join(", ")}` : "";
  if (drained.outcome === "landed") {
    return drained.waitedMs === 0
      ? `${head} landed without waiting${runs}`
      : `${head} landed: waited ${duration(drained.waitedMs)}${runs}`;
  }
  if (drained.outcome === "skipped") return `${head} skipped: ${drained.detail}`;
  return `${head} not landed: waited ${duration(drained.waitedMs)}${runs}: ${drained.detail}`;
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
    const view = readView(io.gh, pr.number);
    if (view === null) return done("failed", "could not read the PR");
    if (view.state === "MERGED") return done("landed", "auto-merge had already landed it");
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
      const merged = io.gh(["pr", "merge", String(pr.number), "--merge"]);
      if (merged.status === 0) {
        return done("landed", waited.detail);
      }
      // Auto-merge races this merge: it lands the PR when its checks turn green, so a refusal can
      // simply mean the PR is already in.
      const after = readView(io.gh, pr.number);
      if (after?.state === "MERGED") return done("landed", "auto-merge merged it first");
      const why = details(merged);
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

/** Every ready PR into `base`, in readiness order, one at a time. */
export function drain(args: QueueArgs, io: QueueIo): { code: number; drained: Drained[] } {
  const startedAt = io.now();
  const listed = io.gh([
    "pr",
    "list",
    "--base",
    args.base,
    "--state",
    "open",
    "--limit",
    "50",
    "--json",
    "number,url,headRefName,isDraft,isCrossRepository,updatedAt,autoMergeRequest,labels",
  ]);
  if (listed.status !== 0) {
    io.error(`gh pr list failed: ${details(listed)}`);
    return { code: EXIT_SOMETHING_FAILED, drained: [] };
  }
  let rows: PrRow[];
  try {
    rows = JSON.parse(listed.stdout || "[]") as PrRow[];
  } catch (error) {
    io.error(`unreadable gh pr list output: ${String(error)}`);
    return { code: EXIT_SOMETHING_FAILED, drained: [] };
  }

  const ready = readyPrs(rows, args.label, io.now());
  if (ready.length === 0) {
    io.log(`nothing ready: no open PR into ${args.base} has auto-merge armed or the ${args.label} label`);
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

function main(): void {
  let args: QueueArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`land:queue: ${(error as Error).message}`);
    process.exit(EXIT_SOMETHING_FAILED);
  }

  const result = drain(args, {
    gh: (ghArgs) => spawnSync("gh", ghArgs, { encoding: "utf8" }),
    git: (cwd, gitArgs) => spawnSync("git", gitArgs, { cwd, encoding: "utf8" }),
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
