// The half of a release that a lane used to do by hand: land the cut, then wait for the Publish run
// and answer with the version it published.
//
//   bun run release --wait          # cut, land and wait, answering with the published version
//   bun run release:await 0.38.4    # wait for the publish run of an already-cut version
//   bun run release:await --run 40107700057 --version 0.38.4
//
// A release lane spent 265 minutes in 24 h in `Start-Sleep 480; gh run view …; npm view …` loops. The
// wait is real — publishing is asynchronous — so this owns it in one bounded place, reports the run it
// waited on, and names the failed job instead of leaving a lane to poll.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { printHelpIfAsked } from "./script-help";

export interface ProcResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type RunGh = (args: readonly string[]) => ProcResult;
export type RunGit = (args: readonly string[]) => ProcResult;

export interface PublishRun {
  databaseId: number;
  status: string;
  conclusion: string | null;
  headSha: string;
  url: string;
}

export interface PublishJob {
  id?: number;
  name: string;
  conclusion: string | null;
  htmlUrl: string;
}

export interface JobStep {
  name: string;
  conclusion: string | null;
}

export const PUBLISH_WORKFLOW = "publish.yml";
/** A publish run is build + sharded tests + pack/install/compile + 13 publishes + verify: ~11 min measured. */
export const PUBLISH_TIMEOUT_MS = 45 * 60_000;
/** Long enough not to hammer the API, short enough that a lane never wonders if it is alive. */
export const POLL_INTERVAL_MS = 10_000;
export const START_GRACE_MS = 3 * 60_000;

/** The run for `sha`, preferring the newest: a re-run replaces the failed attempt it retried. */
export function pickRun(runs: readonly PublishRun[], sha: string): PublishRun | null {
  const matching = runs.filter((run) => run.headSha === sha);
  return matching.length === 0 ? null : matching[matching.length - 1]!;
}

/** The jobs that failed, in the order the run ran them; the first is the cause to name. */
export function failedJobs(jobs: readonly PublishJob[]): PublishJob[] {
  return jobs.filter((job) => job.conclusion === "failure");
}

/** `release: publish run 40107700057 failed at job "publish" (step: Verify …) <url>`. */
export function failureLine(run: PublishRun, jobs: readonly PublishJob[], failedStep?: string | null): string {
  const failed = failedJobs(jobs);
  const job = failed[0];
  const where = job === undefined ? "no failed job reported" : `job "${job.name}"`;
  const step = failedStep === null || failedStep === undefined || failedStep === "" ? "" : ` at step "${failedStep}"`;
  const url = job?.htmlUrl ?? run.url;
  return `release: publish run ${run.databaseId} failed at ${where}${step} ${url}`;
}

/** `release: published @jgengine/core@0.38.4 (publish run 40107700057)`. */
export function successLine(version: string, runId: number): string {
  return `release: published @jgengine/core@${version} (publish run ${runId})`;
}

/** The version npm answers with, or null when npm has no such version (or cannot be asked). */
export function registryVersion(npmView: () => ProcResult): string | null {
  const result = npmView();
  if (result.status !== 0) return null;
  const version = result.stdout.trim();
  return version === "" ? null : version;
}

export interface AwaitOptions {
  version: string;
  /** The commit Publish runs on; `main`'s head after the release lands. */
  sha: string;
  gh?: RunGh;
  /** Registry answer, for the final check. */
  npmView?: () => ProcResult;
  runId?: number;
  timeoutMs?: number;
  graceMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface AwaitResult {
  ok: boolean;
  /** The line a lane reads: the version and run, or the run and the job that failed. */
  line: string;
  runId: number | null;
  code: number;
}

function defaultGh(args: readonly string[]): ProcResult {
  const result = spawnSync("gh", [...args], { encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Wait for the publish run of one commit and answer. Bounded by `timeoutMs`; a run that never appears
 * is reported by name rather than waited on forever.
 */
export async function awaitPublish(options: AwaitOptions): Promise<AwaitResult> {
  const gh = options.gh ?? defaultGh;
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const interval = options.intervalMs ?? POLL_INTERVAL_MS;
  const timeout = options.timeoutMs ?? PUBLISH_TIMEOUT_MS;
  const grace = options.graceMs ?? START_GRACE_MS;
  const started = now();

  const readRun = (id: number): PublishRun | null => {
    const result = gh(["api", `repos/{owner}/{repo}/actions/runs/${id}`]);
    if (result.status !== 0) return null;
    const parsed = parseJson<{
      id?: number;
      databaseId?: number;
      status?: string;
      conclusion?: string | null;
      head_sha?: string;
      headSha?: string;
      html_url?: string;
      url?: string;
    }>(result.stdout);
    if (parsed === null) return null;
    return {
      databaseId: parsed.databaseId ?? parsed.id ?? id,
      status: parsed.status ?? "unknown",
      conclusion: parsed.conclusion ?? null,
      headSha: parsed.headSha ?? parsed.head_sha ?? "",
      url: parsed.html_url ?? parsed.url ?? "",
    };
  };

  const listRuns = (): PublishRun[] => {
    const result = gh([
      "run",
      "list",
      "--workflow",
      PUBLISH_WORKFLOW,
      "--branch",
      "main",
      "--limit",
      "10",
      "--json",
      "databaseId,status,conclusion,headSha,url",
    ]);
    if (result.status !== 0) return [];
    return parseJson<PublishRun[]>(result.stdout) ?? [];
  };

  let run = options.runId === undefined ? pickRun(listRuns(), options.sha) : readRun(options.runId);
  // A run that has not been queued yet is normal for a few seconds after the merge; give it a window.
  while (run === null && now() - started < grace) {
    // wait-ok: the merge commit reaches the workflow queue in seconds and this window is bounded
    await sleep(interval);
    run = options.runId === undefined ? pickRun(listRuns(), options.sha) : readRun(options.runId);
  }
  if (run === null) {
    const line =
      options.runId === undefined
        ? `release: no ${PUBLISH_WORKFLOW} run for ${options.sha.slice(0, 8)} on main after ${Math.round(grace / 1000)}s - nothing was queued, so ${options.version} is not published`
        : `release: publish run ${options.runId} could not be read`;
    return { ok: false, line, runId: options.runId ?? null, code: 1 };
  }
  log(`release: waiting on publish run ${run.databaseId} (${run.url})`);

  while (run.status !== "completed" && now() - started < timeout) {
    // wait-ok: a publish run takes ~11 minutes of real build, test and publish work; bounded by timeout
    await sleep(interval);
    run = readRun(run.databaseId) ?? run;
  }
  if (run.status !== "completed") {
    return {
      ok: false,
      line: `release: publish run ${run.databaseId} still running after ${Math.round(timeout / 60_000)} minutes (${run.url})`,
      runId: run.databaseId,
      code: 1,
    };
  }

  if (run.conclusion !== "success") {
    const raw = gh(["api", `repos/{owner}/{repo}/actions/runs/${run.databaseId}/jobs`]).stdout;
    const listed = parseJson<{ jobs?: (PublishJob & { html_url?: string })[] }>(raw)?.jobs ?? [];
    const jobs = listed.map((job) => ({ ...job, htmlUrl: job.htmlUrl ?? job.html_url ?? run.url }));
    const failed = failedJobs(jobs)[0];
    let step: string | null = null;
    if (failed?.id !== undefined) {
      const detail = gh(["api", `repos/{owner}/{repo}/actions/jobs/${failed.id}`]);
      const steps = parseJson<{ steps?: JobStep[] }>(detail.stdout)?.steps ?? [];
      step = steps.find((entry) => entry.conclusion === "failure")?.name ?? null;
    }
    return { ok: false, line: failureLine(run, jobs, step), runId: run.databaseId, code: 1 };
  }

  const npmView = options.npmView ?? (() => spawnSync("npm", ["view", "@jgengine/core", "version"], { encoding: "utf8" }));
  const published = registryVersion(npmView);
  if (published !== options.version) {
    return {
      ok: false,
      line: `release: publish run ${run.databaseId} succeeded but npm answers ${published ?? "nothing"} for @jgengine/core, not ${options.version}`,
      runId: run.databaseId,
      code: 1,
    };
  }
  return { ok: true, line: successLine(options.version, run.databaseId), runId: run.databaseId, code: 0 };
}

export const RELEASE_AWAIT_USAGE = {
  summary: "wait for a release's Publish run and answer with the version it published",
  usage: "bun run release:await [<version>] [--run <id>] [--sha <commit>] [--version <x.y.z>]",
  flags: [
    { flag: "--run <id>", detail: "wait on one publish run by id instead of the one for main's head" },
    { flag: "--sha <commit>", detail: "the commit Publish ran on; default: origin/main's head" },
    { flag: "--version <x.y.z>", detail: "the version to expect; default: packages/core's own" },
  ],
  example: "bun run release:await 0.38.4",
  exits: ["0 the version is on npm, and the line names the run", "1 the run failed, did not start, or npm disagreed"],
} as const;

export interface AwaitCliIo {
  gh?: RunGh;
  git?: RunGit;
  npmView?: () => ProcResult;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/** The version the checkout ships, used when the command names none. */
export function versionFromCheckout(read: (path: string) => string): string {
  return (JSON.parse(read("packages/core/package.json")) as { version: string }).version;
}

export function parseAwaitArgs(argv: readonly string[]): { version?: string; runId?: number; sha?: string } {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at < 0 ? undefined : argv[at + 1];
  };
  const positional = argv.find((arg) => !arg.startsWith("--") && /^\d+\.\d+\.\d+/.test(arg));
  const run = value("--run");
  return {
    version: value("--version") ?? positional,
    runId: run === undefined ? undefined : Number(run),
    sha: value("--sha"),
  };
}

/** One line out, one exit code: what a lane reads instead of polling. */
export async function awaitCli(argv: readonly string[], io: AwaitCliIo = {}): Promise<AwaitResult> {
  const git = io.git ?? ((args: readonly string[]) => spawnSync("git", [...args], { encoding: "utf8" }) as ProcResult);
  const parsed = parseAwaitArgs(argv);
  const root = fileURLToPath(new URL("..", import.meta.url));
  const version = parsed.version ?? versionFromCheckout((path) => readFileSync(`${root}${path}`, "utf8"));
  const head = git(["rev-parse", "origin/main"]);
  const sha = parsed.sha ?? (head.status === 0 ? head.stdout.trim() : "");
  const result = await awaitPublish({ ...io, version, sha, runId: parsed.runId });
  (io.log ?? ((line: string) => console.log(line)))(result.line);
  return result;
}

if (import.meta.main) {
  if (printHelpIfAsked("release-await", RELEASE_AWAIT_USAGE, process.argv.slice(2))) process.exit(0);
  const result = await awaitCli(process.argv.slice(2));
  process.exit(result.code);
}
