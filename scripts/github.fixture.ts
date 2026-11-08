// An in-memory GitHub REST API behind a fake `gh`, for the landing scripts' tests. It answers only
// `gh api`: any other gh command fails the call, so a test also proves a script took the one path.
import { gitHub, type GhRun, type GhRunner, type GitHub } from "./github";

export interface FakePull {
  number: number;
  head: string;
  base?: string;
  title?: string;
  body?: string;
  sha?: string;
  state?: "open" | "closed";
  merged?: boolean;
  draft?: boolean;
  labels?: string[];
  /** REST `mergeable_state`: `clean`, `behind`, `dirty`, ... */
  mergeableState?: string;
  updatedAt?: string;
  crossRepo?: boolean;
}

export interface FakeCheck {
  name: string;
  status?: "queued" | "in_progress" | "completed";
  conclusion?: string | null;
  startedAt?: string;
  url?: string;
}

export interface FakeRun {
  id: number;
  branch: string;
  headSha: string;
}

export interface FakeCall {
  method: string;
  path: string;
  fields: Record<string, string>;
}

export interface FakeGitHub {
  github: GitHub;
  gh: GhRunner;
  /** Every `gh api` call, in order. */
  calls: FakeCall[];
  pulls: Map<number, FakePull>;
  /** Check runs per commit sha; a test changes them between polls. */
  checks: Record<string, FakeCheck[]>;
  comments: { number: number; body: string }[];
}

export function fakeGitHub(seed: {
  repo?: string;
  pulls?: FakePull[];
  /** Check runs per commit sha. */
  checks?: Record<string, FakeCheck[]>;
  runs?: FakeRun[];
  /** The number the next opened PR gets (its head sha is `sha-<number>`). */
  nextNumber?: number;
  /** A stderr for a call that should fail, e.g. a 403 or a merge GitHub refuses. */
  fail?: (call: FakeCall) => string | undefined;
} = {}): FakeGitHub {
  const repo = seed.repo ?? "me/game";
  const owner = repo.split("/")[0] ?? "";
  const pulls = new Map((seed.pulls ?? []).map((pull) => [pull.number, { ...pull }]));
  const checks: Record<string, FakeCheck[]> = { ...seed.checks };
  const calls: FakeCall[] = [];
  const comments: { number: number; body: string }[] = [];

  const ok = (value: unknown): GhRun => ({ status: 0, stdout: value === null ? "" : JSON.stringify(value), stderr: "" });
  const refuse = (stderr: string): GhRun => ({ status: 1, stdout: "", stderr });
  // A list answer carries no merge state; only a single-PR read does.
  const rest = (pull: FakePull, listed = false): unknown => ({
    number: pull.number,
    html_url: `https://github.com/${repo}/pull/${pull.number}`,
    title: pull.title ?? `PR ${pull.number}`,
    body: pull.body ?? "",
    state: pull.state ?? "open",
    merged_at: pull.merged === true ? "2026-11-02T00:00:00Z" : null,
    draft: pull.draft === true,
    head: { ref: pull.head, sha: pull.sha ?? `sha-${pull.number}`, repo: { full_name: pull.crossRepo === true ? "fork/game" : repo } },
    base: { ref: pull.base ?? "beta", repo: { full_name: repo } },
    updated_at: pull.updatedAt ?? "2026-11-02T00:00:00Z",
    ...(listed ? {} : { mergeable_state: pull.mergeableState ?? "unknown" }),
    labels: (pull.labels ?? []).map((name) => ({ name })),
  });

  const gh: GhRunner = (args) => {
    if (args[0] !== "api") return refuse(`the fake gh serves only \`gh api\`, not \`gh ${args.join(" ")}\``);
    const call: FakeCall = { method: "GET", path: "", fields: {} };
    for (let at = 1; at < args.length; at += 1) {
      const arg = args[at] ?? "";
      if (arg === "-X") call.method = args[(at += 1)] ?? "GET";
      else if (arg === "-f") {
        const field = args[(at += 1)] ?? "";
        const split = field.indexOf("=");
        call.fields[field.slice(0, split)] = field.slice(split + 1);
      } else call.path = arg;
    }
    calls.push(call);
    const failed = seed.fail?.(call);
    if (failed !== undefined) return refuse(failed);

    const [route = "", query = ""] = call.path.split("?");
    const params = new URLSearchParams(query);
    const prefix = `repos/${repo}/`;
    if (!route.startsWith(prefix)) return refuse(`HTTP 404: no repository at ${call.path}`);
    const parts = route.slice(prefix.length).split("/");
    const number = Number(parts[1]);
    const pull = pulls.get(number);

    if (parts[0] === "pulls" && parts.length === 1 && call.method === "GET") {
      const state = params.get("state") ?? "open";
      const head = params.get("head");
      const base = params.get("base");
      const limit = Number(params.get("per_page") ?? "30");
      const rows = [...pulls.values()]
        .filter((row) => state === "all" || (row.state ?? "open") === state)
        .filter((row) => head === null || `${owner}:${row.head}` === head)
        .filter((row) => base === null || (row.base ?? "beta") === base)
        .sort((a, b) => b.number - a.number)
        .slice(0, limit)
        .map((row) => rest(row, true));
      return ok(rows);
    }
    if (parts[0] === "pulls" && parts.length === 1 && call.method === "POST") {
      const created: FakePull = {
        number: Math.max(seed.nextNumber ?? 1, ...[...pulls.keys()].map((key) => key + 1)),
        head: call.fields["head"] ?? "",
        base: call.fields["base"] ?? "beta",
        title: call.fields["title"] ?? "",
        body: call.fields["body"] ?? "",
      };
      pulls.set(created.number, created);
      return ok(rest(created));
    }
    if (parts[0] === "pulls" && parts.length === 2 && pull !== undefined) {
      if (call.method === "GET") return ok(rest(pull));
      if (call.method === "PATCH") {
        if (call.fields["title"] !== undefined) pull.title = call.fields["title"];
        if (call.fields["body"] !== undefined) pull.body = call.fields["body"];
        if (call.fields["state"] === "closed") pull.state = "closed";
        return ok(rest(pull));
      }
    }
    if (parts[0] === "pulls" && parts[2] === "merge" && call.method === "PUT" && pull !== undefined) {
      // GitHub merges only while the head is the sha the caller names.
      const head = pull.sha ?? `sha-${pull.number}`;
      if (call.fields["sha"] !== undefined && call.fields["sha"] !== head) return refuse("HTTP 409: Head branch was modified. Review and try the merge again.");
      pull.merged = true;
      pull.state = "closed";
      return ok({ merged: true, sha: `merge-${pull.number}` });
    }
    if (parts[0] === "issues" && parts[2] === "comments" && call.method === "POST" && pull !== undefined) {
      comments.push({ number, body: call.fields["body"] ?? "" });
      return ok({ id: comments.length });
    }
    if (parts[0] === "commits" && parts[2] === "check-runs") {
      const sha = parts[1] ?? "";
      return ok({
        check_runs: (checks[sha] ?? []).map((check) => ({
          name: check.name,
          status: check.status ?? "completed",
          conclusion: check.conclusion === undefined ? "success" : check.conclusion,
          started_at: check.startedAt ?? "2026-11-02T00:00:00Z",
          details_url: check.url ?? "",
          head_sha: sha,
        })),
      });
    }
    if (parts[0] === "actions" && parts[1] === "runs" && parts.length === 2) {
      const branch = params.get("branch");
      const limit = Number(params.get("per_page") ?? "30");
      const runs = (seed.runs ?? []).filter((run) => branch === null || run.branch === branch).slice(0, limit);
      return ok({ workflow_runs: runs.map((run) => ({ id: run.id, head_sha: run.headSha })) });
    }
    return refuse(`HTTP 404: the fake has no ${call.method} ${call.path}`);
  };

  return { github: gitHub(gh, repo, () => {}), gh, calls, pulls, checks, comments };
}
