// The wait half of a release: wait for beta's CI on the release commit, then for the Publish run its
// `v<version>` tag starts, and answer with the version it published. `bun run release` calls this after
// it pushes the cut, and `bun run release --wait <version>` for a version already cut. The flags, the tag
// and the deploy after the wait live in release.ts.
//
// A release lane spent 265 minutes in 24 h in `Start-Sleep 480; gh run view …; npm view …` loops. The
// wait is real — publishing is asynchronous — so this owns it in one bounded place, reports the run it
// waited on, and names the failed job instead of leaving a lane to poll.
import { spawnSync } from "node:child_process";

import { checkLiveRelease, unservedLockstep } from "./check-release-artifacts";
import { decideCiRuns, parseCiRuns } from "./check-release-ci";

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
  /** ISO time GitHub created the run. */
  createdAt?: string | undefined;
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
/** The workflow whose verdict on the release commit gates the tag. */
export const CI_WORKFLOW = "ci.yml";
/** A publish run is build + pack/install/compile + 13 publishes + verify: ~11 min measured. */
export const PUBLISH_TIMEOUT_MS = 45 * 60_000;
/** Beta's CI on one commit: ~8 min measured, longer when runners queue. */
export const CI_TIMEOUT_MS = 60 * 60_000;
/** Long enough not to hammer the API, short enough that a lane never wonders if it is alive. */
export const POLL_INTERVAL_MS = 10_000;
/** How long a run may take to appear after the push that starts it. */
export const START_GRACE_MS = 3 * 60_000;

/** The run for `sha`: the newest by id, so a re-run replaces the attempt it retried. */
export function pickRun(runs: readonly PublishRun[], sha: string): PublishRun | null {
  let newest: PublishRun | null = null;
  for (const run of runs) {
    if (run.headSha !== sha) continue;
    if (newest === null || run.databaseId > newest.databaseId) newest = run;
  }
  return newest;
}

/**
 * Wait until beta's CI has a verdict on `sha`. The release tags a commit only once that verdict is
 * green, so publish.yml never starts on a commit CI has not proved.
 */
export async function awaitCi(options: {
  sha: string;
  gh?: RunGh;
  timeoutMs?: number;
  graceMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}): Promise<{ ok: boolean; line: string }> {
  const gh = options.gh ?? defaultGh;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
  const timeout = options.timeoutMs ?? CI_TIMEOUT_MS;
  const grace = options.graceMs ?? START_GRACE_MS;
  const started = now();
  const short = options.sha.slice(0, 8);
  let logged = false;
  for (;;) {
    const read = gh(["api", `repos/{owner}/{repo}/actions/workflows/${CI_WORKFLOW}/runs?head_sha=${options.sha}&per_page=50`]);
    const runs = read.status === 0 ? parseCiRuns(read.stdout) : [];
    const verdict = decideCiRuns(runs, options.sha);
    if (verdict.ok) return { ok: true, line: `release: ${verdict.message}` };
    const pending = runs.some((run) => run.status !== "completed");
    if (runs.length > 0 && !pending) return { ok: false, line: `release: ${verdict.message}; nothing was tagged or published` };
    const waited = now() - started;
    if (runs.length === 0 && waited >= grace) {
      return { ok: false, line: `release: no ${CI_WORKFLOW} run for ${short} ${Math.round(grace / 1000)}s after it reached beta; nothing was tagged` };
    }
    if (waited >= timeout) {
      return { ok: false, line: `release: CI on ${short} still running after ${Math.round(timeout / 60_000)} minutes; finish with \`bun run release --wait <version>\`` };
    }
    if (!logged && runs.length > 0) {
      options.log?.(`release: waiting on beta's CI for ${short} (${runs[0]?.url ?? CI_WORKFLOW})`);
      logged = true;
    }
    // CI on beta takes minutes; bounded by the timeout above
    await sleep(options.intervalMs ?? POLL_INTERVAL_MS);
  }
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
  /** The commit the release tag names; publish.yml runs on it. */
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
    const result = gh(["run", "list", "--workflow", PUBLISH_WORKFLOW, "--commit", options.sha, "--limit", "10", "--json", "databaseId,status,conclusion,headSha,url,createdAt"]);
    if (result.status !== 0) return [];
    return parseJson<PublishRun[]>(result.stdout) ?? [];
  };
  const find = (): PublishRun | null => (options.runId === undefined ? pickRun(listRuns(), options.sha) : readRun(options.runId));

  let run = find();
  while (run === null && now() - started < grace) {
    // The tag was just pushed; GitHub queues its run within seconds. Bounded by the grace window
    await sleep(interval);
    run = find();
  }
  if (run === null) {
    const line =
      options.runId === undefined
        ? `release: no ${PUBLISH_WORKFLOW} run for ${options.sha.slice(0, 8)} ${Math.round(grace / 1000)}s after v${options.version} was pushed, so ${options.version} is not published`
        : `release: publish run ${options.runId} could not be read`;
    return { ok: false, line, runId: options.runId ?? null, code: 1 };
  }
  log(`release: waiting on publish run ${run.databaseId} (${run.url})`);

  while (run.status !== "completed" && now() - started < timeout) {
    // A publish run takes ~11 minutes of real build, test and publish work; bounded by timeout
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
    // npm serves an accepted publish minutes later; polled, and bounded by the registry timeout
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
