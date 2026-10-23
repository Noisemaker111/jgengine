// One question, one answer: where do this PR's checks stand right now?
//
//   bun run ci:status                    # the current branch's open PR
//   bun run ci:status --pr 2274          # a merged or open PR by number
//   bun run ci:status --branch agent/x
//   bun run ci:status --json             # for scripts
//
// This is what replaced `gh pr checks --watch` and `gh run watch`. Watching a
// nine-minute gate parks an agent for nine minutes to learn one fact at the end;
// asking costs a second and can be repeated whenever there is something else to
// do in between. Nothing here polls, sleeps or waits for a run to finish.
//
// It answers or it says why it cannot: no open PR for a branch, no checks on the
// PR yet, or gh unreadable all exit non-zero with the reason named, because an
// empty green-looking table is the one answer that must never be printed.
import { spawnSync } from "node:child_process";

export const EXIT_GREEN = 0;
export const EXIT_FAILED = 1;
export const EXIT_PENDING = 2;
export const EXIT_CANNOT_ANSWER = 3;

export interface CiStatusArgs {
  pr?: number;
  branch?: string;
  repo?: string;
  json: boolean;
}

export interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

export type Gh = (args: string[]) => Run;
export type Git = (args: string[]) => Run;

/** One row of `statusCheckRollup`: a check run or a legacy commit status. */
export interface RollupEntry {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string | null;
  state?: string;
  detailsUrl?: string;
  targetUrl?: string;
}

export type Bucket = "pass" | "fail" | "pending";

export interface CheckStatus {
  name: string;
  /** The conclusion, else the state, else the run status: whatever GitHub last said. */
  state: string;
  bucket: Bucket;
  url: string;
  runId: number | null;
}

export interface CiStatus {
  pr: number;
  url: string;
  branch: string;
  state: string;
  verdict: Bucket;
  counts: { pass: number; fail: number; pending: number };
  runIds: number[];
  checks: CheckStatus[];
  wallMs: number;
}

export interface Refusal {
  reason: "no-pr" | "no-checks" | "gh-failed" | "bad-args";
  message: string;
}

const FAIL_STATES = new Set([
  "FAILURE",
  "ERROR",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STALE",
  "STARTUP_FAILURE",
]);
const PASS_STATES = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

export function parseArgs(argv: readonly string[]): CiStatusArgs {
  const args: CiStatusArgs = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pr") {
      const raw = argv[(i += 1)];
      const pr = Number(raw);
      if (raw === undefined || !Number.isInteger(pr) || pr <= 0) throw new Error("--pr needs a PR number");
      args.pr = pr;
    } else if (arg === "--branch") args.branch = value(argv, (i += 1), arg);
    else if (arg === "--repo") args.repo = value(argv, (i += 1), arg);
    else if (arg === "--json") args.json = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (args.pr !== undefined && args.branch !== undefined) throw new Error("give --pr or --branch, not both");
  return args;
}

function value(argv: readonly string[], at: number, flag: string): string {
  const found = argv[at];
  if (found === undefined || found.startsWith("--")) throw new Error(`${flag} needs a value`);
  return found;
}

export function bucketOf(state: string): Bucket {
  const upper = state.toUpperCase();
  if (PASS_STATES.has(upper)) return "pass";
  if (FAIL_STATES.has(upper)) return "fail";
  return "pending";
}

/** The Action run a check belongs to, from `.../actions/runs/1234/job/5678`. */
export function runIdFrom(url: string): number | null {
  const match = /\/runs\/(\d+)/.exec(url);
  if (match === null) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * `statusCheckRollup` mixes check runs (`conclusion`/`status`) with commit
 * statuses (`state`). A check run that has not concluded yet is pending whatever
 * its status says, so the conclusion decides and the status only fills the word.
 */
export function normalizeCheck(entry: RollupEntry): CheckStatus {
  const url = entry.detailsUrl ?? entry.targetUrl ?? "";
  const last = entry.conclusion ?? entry.state ?? entry.status ?? "UNKNOWN";
  return {
    name: entry.name ?? entry.context ?? "(unnamed check)",
    state: last,
    bucket: bucketOf(last),
    url,
    runId: runIdFrom(url),
  };
}

export function verdictOf(checks: readonly CheckStatus[]): Bucket {
  if (checks.some((check) => check.bucket === "fail")) return "fail";
  if (checks.some((check) => check.bucket === "pending")) return "pending";
  return "pass";
}

export function summarize(input: {
  pr: number;
  url: string;
  branch: string;
  state: string;
  rollup: readonly RollupEntry[];
  wallMs: number;
}): CiStatus {
  const checks = input.rollup.map(normalizeCheck);
  const verdict = verdictOf(checks);
  const counts = { pass: 0, fail: 0, pending: 0 };
  for (const check of checks) counts[check.bucket] += 1;
  const runIds = [...new Set(checks.map((check) => check.runId).filter((id): id is number => id !== null))];
  return {
    pr: input.pr,
    url: input.url,
    branch: input.branch,
    state: input.state,
    verdict,
    counts,
    runIds,
    checks,
    wallMs: input.wallMs,
  };
}

/** `1.2s`, `340ms`: the whole point is that this number stays small. */
export function seconds(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatText(status: CiStatus): string {
  const word = status.verdict === "pass" ? "green" : status.verdict === "fail" ? "failing" : "pending";
  const lines = [`ci:status #${status.pr} ${status.branch} ${status.state} ${status.url}`.trimEnd()];
  for (const check of status.checks) {
    const mark = check.bucket === "pass" ? "pass" : check.bucket === "fail" ? "FAIL" : "wait";
    lines.push(`  ${mark.padEnd(4)} ${check.name}${check.bucket === "pass" ? "" : ` (${check.state})`}`);
  }
  const { pass, fail, pending } = status.counts;
  lines.push(`${status.checks.length} check(s): ${pass} pass, ${fail} fail, ${pending} pending — ${word}`);
  if (status.runIds.length > 0) lines.push(`run ${status.runIds.join(", ")}`);
  lines.push(`answered in ${seconds(status.wallMs)}`);
  return lines.join("\n");
}

interface PrView {
  number: number;
  url: string;
  state: string;
  headRefName: string;
  statusCheckRollup: RollupEntry[] | null;
}

export interface CiIo {
  gh: Gh;
  git: Git;
}

function ghRun(io: CiIo, args: string[]): Run {
  return io.gh(args);
}

function describe(run: Run): string {
  const text = (run.stderr || run.stdout).trim();
  return text.length > 0 ? text.split("\n")[0] : `gh exited ${run.status}`;
}

/** Resolve the one PR this question is about, without watching anything. */
export function resolvePr(args: CiStatusArgs, io: CiIo): { pr: PrView } | Refusal {
  const repo = args.repo === undefined ? [] : ["-R", args.repo];
  if (args.pr !== undefined) {
    const view = ghRun(io, ["pr", "view", String(args.pr), "--json", "number,url,state,headRefName,statusCheckRollup", ...repo]);
    if (view.status !== 0) return { reason: "gh-failed", message: `gh pr view #${args.pr} failed: ${describe(view)}` };
    return { pr: parsePr(view.stdout, args.pr) };
  }

  const branch = args.branch ?? io.git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  if (branch.length === 0) return { reason: "no-pr", message: "could not read the current branch" };
  const listed = ghRun(io, [
    "pr",
    "list",
    "--head",
    branch,
    "--state",
    "open",
    "--limit",
    "1",
    "--json",
    "number,url,state,headRefName,statusCheckRollup",
    ...repo,
  ]);
  if (listed.status !== 0) return { reason: "gh-failed", message: `gh pr list failed: ${describe(listed)}` };
  let rows: PrView[];
  try {
    rows = JSON.parse(listed.stdout || "[]") as PrView[];
  } catch (error) {
    return { reason: "gh-failed", message: `unreadable gh pr list output: ${String(error)}` };
  }
  const found = rows[0];
  if (found === undefined) {
    return { reason: "no-pr", message: `no open PR for branch ${branch}: nothing to report on` };
  }
  return { pr: found };
}

function parsePr(stdout: string, asked: number): PrView {
  const parsed = JSON.parse(stdout) as PrView;
  return { ...parsed, number: parsed.number ?? asked, statusCheckRollup: parsed.statusCheckRollup ?? [] };
}

export function ask(args: CiStatusArgs, io: CiIo): CiStatus | Refusal {
  const resolved = resolvePr(args, io);
  if ("reason" in resolved) return resolved;
  const rollup = resolved.pr.statusCheckRollup ?? [];
  if (rollup.length === 0) {
    return {
      reason: "no-checks",
      message: `PR #${resolved.pr.number} has no checks yet: workflows are queued or none run on this branch`,
    };
  }
  return summarize({
    pr: resolved.pr.number,
    url: resolved.pr.url ?? "",
    branch: resolved.pr.headRefName ?? "",
    state: resolved.pr.state ?? "",
    rollup,
    wallMs: 0,
  });
}

/** The exit code for an answer or a refusal, so a script can gate on either. */
export function exitCodeFor(answer: CiStatus | Refusal): number {
  if ("reason" in answer) return EXIT_CANNOT_ANSWER;
  return answer.verdict === "pass" ? EXIT_GREEN : answer.verdict === "fail" ? EXIT_FAILED : EXIT_PENDING;
}

/** The `--json` body: one object, so a caller reads the verdict and the checks in one parse. */
export function jsonText(status: CiStatus): string {
  return JSON.stringify({ ok: true, ...status }, null, 2);
}

/** What the command prints and the code it exits with, so a test drives it without a process. */
export interface CliResult {
  code: number;
  stdout: string[];
  stderr: string[];
}

export function cli(argv: readonly string[], io: CiIo, now: () => number = () => Date.now()): CliResult {
  let args: CiStatusArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    return { code: EXIT_CANNOT_ANSWER, stdout: [], stderr: [`ci:status: ${(error as Error).message}`] };
  }

  const startedAt = now();
  const answer = ask(args, io);
  const wallMs = now() - startedAt;
  if ("reason" in answer) {
    return {
      code: exitCodeFor(answer),
      stdout: args.json ? [JSON.stringify({ ok: false, reason: answer.reason, message: answer.message }, null, 2)] : [],
      stderr: args.json ? [] : [`ci:status: ${answer.message}`],
    };
  }

  const status: CiStatus = {
    pr: answer.pr,
    url: answer.url,
    branch: answer.branch,
    state: answer.state,
    verdict: answer.verdict,
    counts: answer.counts,
    runIds: answer.runIds,
    checks: answer.checks,
    wallMs,
  };
  return { code: exitCodeFor(status), stdout: [args.json ? jsonText(status) : formatText(status)], stderr: [] };
}

function main(argv: readonly string[]): void {
  const result = cli(argv, {
    gh: (ghArgs) => spawnSync("gh", ghArgs, { encoding: "utf8" }),
    git: (gitArgs) => spawnSync("git", gitArgs, { encoding: "utf8" }),
  });
  for (const line of result.stdout) console.log(line);
  for (const line of result.stderr) console.error(line);
  process.exit(result.code);
}

if (import.meta.main) main(process.argv.slice(2));
