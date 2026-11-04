// The one way repo tooling talks to GitHub: `gh api` against the REST API. `gh pr` speaks GraphQL,
// which cloud sessions' proxy refuses, so the landing scripts never use it; REST works on this PC and
// in the cloud alike. Auto-merge has no REST endpoint: a PR handed to the landing queue carries the
// `land:queue` label instead.
import { spawnSync } from "node:child_process";

import type { RollupEntry } from "./ci-status";

export interface GhRun {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs `gh <args>`; tests pass a fake that serves `gh api` paths from memory. */
export type GhRunner = (args: string[]) => GhRun;

export type GhResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * GitHub's own outage answers (a 500, 502 or 503, or no connection): the same request a few seconds
 * later goes through. On 4 Nov they ended a landing three times in a row, on a read, a push and a merge.
 */
export const GITHUB_OUTAGE = /HTTP 5\d\d|Internal Server Error|Server Error|Bad Gateway|Service Unavailable|error: 5\d\d|error connecting to/i;
/** Tries of one request GitHub answered with {@link GITHUB_OUTAGE} before its error is returned. */
export const OUTAGE_ATTEMPTS = 3;

/** Blocks this process for `ms`: the landing scripts are synchronous. */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Runs a command again, after a pause, while it fails with a {@link GITHUB_OUTAGE} answer; any other
 * failure, a refusal or a rejected push included, comes back at once.
 */
export function retryOutages<R extends { status: number; stdout: string; stderr: string }>(
  run: () => R,
  pause: (ms: number) => void = sleepSync,
): R {
  for (let attempt = 1; ; attempt += 1) {
    const result = run();
    if (result.status === 0 || attempt >= OUTAGE_ATTEMPTS || !GITHUB_OUTAGE.test(`${result.stderr}\n${result.stdout}`)) return result;
    pause(5_000 * attempt);
  }
}

/** One pull request, in the words the landing scripts read. */
export interface Pull {
  number: number;
  url: string;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  isCrossRepository: boolean;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  updatedAt: string | null;
  /** `BEHIND`, `DIRTY`, `CLEAN`, `BLOCKED`, ...; `UNKNOWN` until GitHub has computed it (and always in a list). */
  mergeStateStatus: string;
  labels: string[];
}

interface PullQuery {
  head?: string;
  base?: string;
  state: "open" | "closed" | "all";
  limit?: number;
}

interface WorkflowRun {
  id: number;
  headSha: string;
}

/** The pull request, check and workflow-run calls the landing scripts make, all over `gh api`. */
export interface GitHub {
  readonly repo: string;
  listPulls(query: PullQuery): GhResult<Pull[]>;
  pull(number: number): GhResult<Pull>;
  /** Check runs on a commit, shaped as `RollupEntry` so the check judging reads them unchanged. */
  checks(sha: string): GhResult<RollupEntry[]>;
  createPull(input: { base: string; head: string; title: string; body: string }): GhResult<{ number: number; url: string }>;
  editPull(number: number, patch: { title?: string; body?: string }): GhResult<null>;
  addLabel(number: number, label: string): GhResult<null>;
  mergePull(number: number): GhResult<null>;
  /** Leave a comment on the PR, then close it. */
  closePull(number: number, comment: string): GhResult<null>;
  branchRuns(branch: string, limit: number): GhResult<WorkflowRun[]>;
  rerunRun(id: number): GhResult<null>;
}

/** `owner/repo` from a remote URL (github.com over https or ssh, or a proxy whose path ends in it), or `owner/repo` itself. */
export function repoFromRemote(remote: string): string | null {
  const trimmed = remote.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match = /(?:^|[:/])([^/:\s]+)\/([^/:\s]+)$/.exec(trimmed);
  return match === null ? null : `${match[1]}/${match[2]}`;
}

/** `owner/repo` of the checkout at `cwd`, read from its origin remote. */
function originRepo(cwd: string): string | null {
  const remote = spawnSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", timeout: 30_000 });
  return remote.status === 0 ? repoFromRemote(remote.stdout ?? "") : null;
}

/** The real `gh` CLI, run with a timeout. */
export function ghCli(cwd?: string): GhRunner {
  return (args) => {
    const result = spawnSync("gh", args, { encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024, ...(cwd === undefined ? {} : { cwd }) });
    return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? (result.error === undefined ? "" : String(result.error)) };
  };
}

/** The checkout's GitHub repository through the real `gh`; throws when origin names none. */
export function checkoutGitHub(cwd: string): GitHub {
  const repo = originRepo(cwd);
  if (repo === null) throw new Error(`no GitHub repository in the origin remote of ${cwd}`);
  return gitHub(ghCli(cwd), repo);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}; // type-escape: narrowed to a plain object on this line
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pullOf(value: unknown): Pull {
  const pull = record(value);
  const head = record(pull["head"]);
  const base = record(pull["base"]);
  const headRepo = text(record(head["repo"])["full_name"]);
  const baseRepo = text(record(base["repo"])["full_name"]);
  const merged = typeof pull["merged_at"] === "string";
  const labels = Array.isArray(pull["labels"]) ? pull["labels"].map((label: unknown) => text(record(label)["name"])) : [];
  return {
    number: typeof pull["number"] === "number" ? pull["number"] : 0,
    url: text(pull["html_url"]),
    title: text(pull["title"]),
    body: text(pull["body"]),
    state: merged ? "MERGED" : pull["state"] === "open" ? "OPEN" : "CLOSED",
    isDraft: pull["draft"] === true,
    isCrossRepository: headRepo !== "" && baseRepo !== "" && headRepo !== baseRepo,
    headRefName: text(head["ref"]),
    headRefOid: text(head["sha"]),
    baseRefName: text(base["ref"]),
    updatedAt: typeof pull["updated_at"] === "string" ? pull["updated_at"] : null,
    mergeStateStatus: (text(pull["mergeable_state"]) || "unknown").toUpperCase(),
    labels,
  };
}

function checkOf(value: unknown): RollupEntry {
  const run = record(value);
  const conclusion = run["conclusion"];
  return {
    __typename: "CheckRun",
    name: text(run["name"]),
    status: text(run["status"]).toUpperCase(),
    conclusion: typeof conclusion === "string" ? conclusion.toUpperCase() : null,
    startedAt: typeof run["started_at"] === "string" ? run["started_at"] : null,
    detailsUrl: text(run["details_url"]) || text(run["html_url"]),
    headSha: typeof run["head_sha"] === "string" ? run["head_sha"] : null,
  };
}

/** GitHub for `repo` (`owner/name`) through `gh api`; a request GitHub's outage answered is tried again. */
export function gitHub(gh: GhRunner, repo: string, pause: (ms: number) => void = sleepSync): GitHub {
  const call = (args: string[]): GhResult<unknown> => {
    const run = retryOutages(() => gh(["api", ...args]), pause);
    if (run.status !== 0) return { ok: false, error: (run.stderr || run.stdout).trim() || `gh api exited ${run.status}` };
    try {
      return { ok: true, value: run.stdout.trim() === "" ? null : JSON.parse(run.stdout) };
    } catch (error) {
      return { ok: false, error: `unreadable gh api answer: ${String(error)}` };
    }
  };
  const done = (result: GhResult<unknown>): GhResult<null> => (result.ok ? { ok: true, value: null } : result);
  const owner = repo.split("/")[0] ?? "";

  return {
    repo,
    listPulls(query) {
      const params = [`state=${query.state}`, `per_page=${Math.min(Math.max(query.limit ?? 30, 1), 100)}`];
      if (query.head !== undefined) params.push(`head=${encodeURIComponent(query.head.includes(":") ? query.head : `${owner}:${query.head}`)}`);
      if (query.base !== undefined) params.push(`base=${encodeURIComponent(query.base)}`);
      const listed = call([`repos/${repo}/pulls?${params.join("&")}`]);
      if (!listed.ok) return listed;
      return { ok: true, value: Array.isArray(listed.value) ? listed.value.map(pullOf) : [] };
    },
    pull(number) {
      const viewed = call([`repos/${repo}/pulls/${number}`]);
      return viewed.ok ? { ok: true, value: pullOf(viewed.value) } : viewed;
    },
    checks(sha) {
      const listed = call([`repos/${repo}/commits/${sha}/check-runs?per_page=100`]);
      if (!listed.ok) return listed;
      const runs = record(listed.value)["check_runs"];
      return { ok: true, value: Array.isArray(runs) ? runs.map(checkOf) : [] };
    },
    createPull(input) {
      const created = call(["-X", "POST", `repos/${repo}/pulls`, "-f", `base=${input.base}`, "-f", `head=${input.head}`, "-f", `title=${input.title}`, "-f", `body=${input.body}`]);
      if (!created.ok) return created;
      const pull = pullOf(created.value);
      return pull.number > 0 ? { ok: true, value: { number: pull.number, url: pull.url } } : { ok: false, error: "GitHub answered the new PR without a number" };
    },
    editPull(number, patch) {
      const fields: string[] = [];
      if (patch.title !== undefined) fields.push("-f", `title=${patch.title}`);
      if (patch.body !== undefined) fields.push("-f", `body=${patch.body}`);
      if (fields.length === 0) return { ok: true, value: null };
      return done(call(["-X", "PATCH", `repos/${repo}/pulls/${number}`, ...fields]));
    },
    addLabel(number, label) {
      return done(call(["-X", "POST", `repos/${repo}/issues/${number}/labels`, "-f", `labels[]=${label}`]));
    },
    mergePull(number) {
      return done(call(["-X", "PUT", `repos/${repo}/pulls/${number}/merge`, "-f", "merge_method=merge"]));
    },
    closePull(number, comment) {
      const commented = call(["-X", "POST", `repos/${repo}/issues/${number}/comments`, "-f", `body=${comment}`]);
      if (!commented.ok) return commented;
      return done(call(["-X", "PATCH", `repos/${repo}/pulls/${number}`, "-f", "state=closed"]));
    },
    branchRuns(branch, limit) {
      const listed = call([`repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=${limit}`]);
      if (!listed.ok) return listed;
      const runs = record(listed.value)["workflow_runs"];
      return {
        ok: true,
        value: Array.isArray(runs) ? runs.map((run: unknown) => ({ id: Number(record(run)["id"]), headSha: text(record(run)["head_sha"]) })) : [],
      };
    },
    rerunRun(id) {
      return done(call(["-X", "POST", `repos/${repo}/actions/runs/${id}/rerun`]));
    },
  };
}
