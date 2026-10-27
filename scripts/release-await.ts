// The wait half of a release: wait for the Publish run of one commit and answer with the version it
// published. `bun run release --wait` calls this after it lands a cut, and `bun run release --wait <version>`
// calls it for a version already cut. The flags, and the deploy after the wait, live in release.ts.
//
// A release lane spent 265 minutes in 24 h in `Start-Sleep 480; gh run view …; npm view …` loops. The
// wait is real — publishing is asynchronous — so this owns it in one bounded place, reports the run it
// waited on, and names the failed job instead of leaving a lane to poll.
import { spawnSync } from "node:child_process";

import { checkLiveRelease, unservedLockstep } from "./check-release-artifacts";

export interface ProcResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type RunGh = (args: readonly string[]) => ProcResult;

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
/** publish.yml starts on `workflow_run` of this workflow completing on main, never before it. */
export const CI_WORKFLOW = "ci.yml";
/** A publish run is build + sharded tests + pack/install/compile + 13 publishes + verify: ~11 min measured. */
export const PUBLISH_TIMEOUT_MS = 45 * 60_000;
/** Long enough not to hammer the API, short enough that a lane never wonders if it is alive. */
export const POLL_INTERVAL_MS = 10_000;
/**
 * How long a publish run may take to appear once main's CI run for the commit has finished. While that
 * CI run is still going, publish.yml cannot have queued yet, so the wait keeps going (bounded by the
 * overall timeout): 0.41.0's main CI took ~5 minutes and a 3-minute window reported it unpublished.
 */
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

/** The publish.yml step that checks every package installs from npm, waiting a bounded time for it to appear. */
export const VERIFY_STEP = "Verify every published package installs";
/**
 * How long npm may take to serve every package of a release once its publish run ends. npm answers a
 * publish with 202 and processes it afterwards: 0.49.0's core appeared 7m12s after its upload, 24 s
 * after the run's own 5-minute check gave up, and that false failure led to a second release.
 */
export const REGISTRY_TIMEOUT_MS = 20 * 60_000;

/** What the registry serves for a version. */
export interface RegistryCheck {
  /** The release's packages npm does not serve at `version` yet, as `name@version`. */
  unserved(version: string): Promise<string[]>;
  /** What a consumer installing `version` would hit: the publish run's own artifact check, run here. */
  defects(version: string): Promise<string[]>;
}

export const liveRegistryCheck: RegistryCheck = {
  unserved: (version) => unservedLockstep(version),
  defects: async (version) => (await checkLiveRelease(version)).flatMap((verdict) => verdict.failures),
};

export interface AwaitOptions {
  version: string;
  /** The commit Publish runs on; `main`'s head after the release lands. */
  sha: string;
  gh?: RunGh;
  /** The registry the release must reach before the wait answers. */
  registry?: RegistryCheck;
  /** How long npm may take to serve every package after the run ends. */
  registryTimeoutMs?: number;
  runId?: number | undefined;
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
      // No --branch: publish.yml follows a CI run, and GitHub reports the triggering run's branch
      // (beta), so filtering on main never found 0.40.0's run. The SHA is the match.
      "--limit",
      "10",
      "--json",
      "databaseId,status,conclusion,headSha,url",
    ]);
    if (result.status !== 0) return [];
    return parseJson<PublishRun[]>(result.stdout) ?? [];
  };

  /** Main's CI run for the commit: publish.yml is queued only after it completes. */
  const readCiRun = (): PublishRun | null => {
    const result = gh([
      "run",
      "list",
      "--workflow",
      CI_WORKFLOW,
      "--commit",
      options.sha,
      "--limit",
      "10",
      "--json",
      "databaseId,status,conclusion,headSha,url",
    ]);
    if (result.status !== 0) return null;
    return pickRun(parseJson<PublishRun[]>(result.stdout) ?? [], options.sha);
  };

  let run = options.runId === undefined ? pickRun(listRuns(), options.sha) : readRun(options.runId);
  // Publish starts only after main's CI for the commit finishes; until then a missing run is expected.
  // Once CI is done, a run not yet queued is normal for a few seconds; give it the grace window.
  let ci: PublishRun | null = null;
  let graceFrom = started;
  while (run === null && options.runId === undefined && now() - started < timeout) {
    ci = readCiRun();
    if (ci !== null && ci.status !== "completed") graceFrom = now();
    else if (ci !== null && ci.conclusion !== "success") break;
    if (now() - graceFrom >= grace) break;
    // wait-ok: bounded by the overall timeout while CI runs, then by the grace window
    await sleep(interval);
    run = pickRun(listRuns(), options.sha);
  }
  while (run === null && options.runId !== undefined && now() - started < grace) {
    // wait-ok: the run id is known; reading it can fail briefly, and this window is bounded
    await sleep(interval);
    run = readRun(options.runId);
  }
  if (run === null) {
    let line: string;
    if (options.runId !== undefined) line = `release: publish run ${options.runId} could not be read`;
    else if (ci !== null && ci.status === "completed" && ci.conclusion !== "success")
      line = `release: CI run ${ci.databaseId} on main for ${options.sha.slice(0, 8)} ended ${ci.conclusion ?? "without a conclusion"}, so ${PUBLISH_WORKFLOW} never starts and ${options.version} is not published (${ci.url})`;
    else if (ci !== null && ci.status !== "completed")
      line = `release: CI run ${ci.databaseId} on main for ${options.sha.slice(0, 8)} still running after ${Math.round(timeout / 60_000)} minutes, so ${PUBLISH_WORKFLOW} has not started (${ci.url})`;
    else
      line = `release: no ${PUBLISH_WORKFLOW} run for ${options.sha.slice(0, 8)} on main ${Math.round(grace / 1000)}s after its CI finished - nothing was queued, so ${options.version} is not published`;
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

  // A run whose only failure is its registry check giving up has uploaded everything; npm is still
  // processing. That is a wait, not a failed release, so it continues here against npm itself.
  let checkHere = false;
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
    if (step !== VERIFY_STEP) return { ok: false, line: failureLine(run, jobs, step), runId: run.databaseId, code: 1 };
    checkHere = true;
    log(`release: publish run ${run.databaseId} uploaded every package but its registry check gave up; waiting on npm itself`);
  }

  const registry = options.registry ?? liveRegistryCheck;
  const registryTimeout = options.registryTimeoutMs ?? REGISTRY_TIMEOUT_MS;
  const registryStarted = now();
  let unserved = await registry.unserved(options.version);
  const servedLate = unserved.length > 0;
  while (unserved.length > 0 && now() - registryStarted < registryTimeout) {
    // wait-ok: npm serves an accepted publish minutes later; polled, and bounded by the registry timeout
    await sleep(interval);
    unserved = await registry.unserved(options.version);
  }
  if (unserved.length > 0) {
    return {
      ok: false,
      line: `release: publish run ${run.databaseId} ${checkHere ? "uploaded" : "succeeded"}, but after ${Math.round(registryTimeout / 60_000)} minutes npm does not serve ${unserved.join(", ")}; a publish npm holds for approval shows in \`npm stage list <package>\``,
      runId: run.databaseId,
      code: 1,
    };
  }
  if (checkHere) {
    const defects = await registry.defects(options.version);
    if (defects.length > 0) {
      return { ok: false, line: `release: ${options.version} is on npm but does not install: ${defects.join("; ")}`, runId: run.databaseId, code: 1 };
    }
  }
  const waited = Math.round((now() - registryStarted) / 1000);
  return {
    ok: true,
    line: successLine(options.version, run.databaseId) + (servedLate ? `, served by npm ${waited}s after the run` : ""),
    runId: run.databaseId,
    code: 0,
  };
}
