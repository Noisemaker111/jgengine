// `gh pr ...` talks GraphQL. Cloud sessions reach GitHub through a proxy that answers GraphQL with 403
// while REST works, and every landing there stopped at "gh pr create failed". `withRestFallback` wraps
// one gh runner: the first `gh pr` call GraphQL refuses switches that runner to the REST API for every
// later `gh pr` call, translating the verbs the landing scripts use into `gh api` calls.
//
// Auto-merge has no REST endpoint, so `pr merge --auto` still fails over REST; land then adds the
// `land:queue` label (over REST), which the queue reads as ready the same way.
import { spawnSync } from "node:child_process";

import type { RollupEntry } from "./ci-status";

export interface GhRun {
  status: number;
  stdout: string;
  stderr: string;
}

export type GhRunner = (args: string[]) => GhRun;

/** True when gh failed because GraphQL itself was refused (HTTP 403, or an integration without access). */
export function graphqlRefused(run: GhRun): boolean {
  if (run.status === 0) return false;
  const text = `${run.stderr}\n${run.stdout}`;
  return /graphql/i.test(text) && /\b403\b|forbidden|not accessible/i.test(text);
}

/** `owner/repo` from a remote URL: github.com over https or ssh, or a proxy whose path ends in it. */
export function repoFromRemote(remote: string): string | null {
  const trimmed = remote.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match = /[:/]([^/:]+)\/([^/:]+)$/.exec(trimmed);
  return match === null ? null : `${match[1]}/${match[2]}`;
}

/** `owner/repo` of the checkout at `cwd`, read from its origin remote. */
export function originRepo(cwd: string): string | null {
  const remote = spawnSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", timeout: 30_000 });
  return remote.status === 0 ? repoFromRemote(remote.stdout ?? "") : null;
}

/** One REST pull request, narrowed to the fields the translation reads. */
interface RestPull {
  number: number;
  html_url: string;
  state: string;
  title: string;
  body: string | null;
  draft?: boolean;
  merged_at?: string | null;
  updated_at?: string;
  mergeable_state?: string;
  auto_merge?: unknown;
  labels?: { name: string }[];
  head: { ref: string; sha: string; repo?: { full_name?: string } | null };
  base: { ref: string; repo?: { full_name?: string } | null };
}

interface RestCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string | null;
  details_url?: string | null;
  html_url?: string | null;
  head_sha?: string;
}

function ok(stdout: string): GhRun {
  return { status: 0, stdout, stderr: "" };
}

function fail(stderr: string): GhRun {
  return { status: 1, stdout: "", stderr };
}

/** The flag values a `gh pr` call carries, plus its positional arguments. */
function readFlags(args: readonly string[]): { positional: string[]; flags: Map<string, string[]>; switches: Set<string> } {
  const valued = new Set(["--base", "-B", "--head", "-H", "--title", "-t", "--body", "-b", "--state", "-s", "--limit", "-L", "--json", "--add-label", "-R", "--repo"]);
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  const switches = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (valued.has(arg)) {
      const value = args[i + 1] ?? "";
      flags.set(arg, [...(flags.get(arg) ?? []), value]);
      i += 1;
    } else if (arg.startsWith("-")) switches.add(arg);
    else positional.push(arg);
  }
  return { positional, flags, switches };
}

function flag(flags: Map<string, string[]>, ...names: string[]): string | undefined {
  for (const name of names) {
    const values = flags.get(name);
    if (values !== undefined && values.length > 0) return values[values.length - 1];
  }
  return undefined;
}

function stateOf(pull: RestPull): string {
  if (pull.merged_at !== null && pull.merged_at !== undefined) return "MERGED";
  return pull.state === "open" ? "OPEN" : "CLOSED";
}

function rollupOf(runs: readonly RestCheckRun[]): RollupEntry[] {
  return runs.map((run) => ({
    __typename: "CheckRun",
    name: run.name,
    status: run.status.toUpperCase(),
    conclusion: run.conclusion === null ? null : run.conclusion.toUpperCase(),
    startedAt: run.started_at ?? null,
    detailsUrl: run.details_url ?? run.html_url ?? "",
    headSha: run.head_sha ?? null,
  }));
}

/** The GraphQL-shaped fields `gh pr view/list --json` would have printed, from one REST pull. */
function fieldsOf(pull: RestPull, rollup: () => RollupEntry[]): Record<string, unknown> {
  const headRepo = pull.head.repo?.full_name;
  const baseRepo = pull.base.repo?.full_name;
  return {
    number: pull.number,
    url: pull.html_url,
    title: pull.title,
    body: pull.body ?? "",
    state: stateOf(pull),
    isDraft: pull.draft === true,
    isCrossRepository: headRepo !== undefined && baseRepo !== undefined && headRepo !== baseRepo,
    headRefName: pull.head.ref,
    headRefOid: pull.head.sha,
    baseRefName: pull.base.ref,
    updatedAt: pull.updated_at ?? null,
    mergeStateStatus: (pull.mergeable_state ?? "unknown").toUpperCase(),
    autoMergeRequest: pull.auto_merge === null || pull.auto_merge === undefined ? null : { enabledAt: null },
    labels: (pull.labels ?? []).map((label) => ({ name: label.name })),
    get statusCheckRollup() {
      return rollup();
    },
  };
}

function pick(fields: Record<string, unknown>, wanted: string | undefined): Record<string, unknown> {
  if (wanted === undefined) return fields;
  const out: Record<string, unknown> = {};
  for (const name of wanted.split(",").map((part) => part.trim()).filter(Boolean)) out[name] = fields[name];
  return out;
}

/**
 * Translate one `gh pr <verb>` call into REST calls through `api` (a runner whose args start with
 * `api`). Returns what gh itself would have printed for the verbs land, the queue, batch and
 * ci:status use; any other verb fails and says so.
 */
export function restPr(args: readonly string[], repo: string, gh: GhRunner): GhRun {
  const { positional, flags, switches } = readFlags(args.slice(1));
  const verb = positional[0];
  const target = flag(flags, "-R", "--repo") ?? repo;
  const json = <T>(run: GhRun): T | GhRun => {
    if (run.status !== 0) return run;
    try {
      return JSON.parse(run.stdout || "null") as T; // type-escape: gh api prints the REST shape named by T
    } catch (error) {
      return fail(`unreadable REST answer: ${String(error)}`);
    }
  };
  const isRun = (value: unknown): value is GhRun =>
    typeof value === "object" && value !== null && "status" in value && "stderr" in value && "stdout" in value;
  const checks = (sha: string): RollupEntry[] => {
    const answer = json<{ check_runs?: RestCheckRun[] }>(gh(["api", `repos/${target}/commits/${sha}/check-runs?per_page=100`]));
    return isRun(answer) || answer === null ? [] : rollupOf(answer.check_runs ?? []);
  };
  const owner = target.split("/")[0] ?? "";

  if (verb === "list") {
    const head = flag(flags, "--head", "-H");
    const base = flag(flags, "--base", "-B");
    const state = (flag(flags, "--state", "-s") ?? "open").toLowerCase();
    const limit = Math.min(Math.max(Number(flag(flags, "--limit", "-L") ?? "30") || 30, 1), 100);
    const query = [`state=${state === "merged" ? "closed" : state}`, `per_page=${limit}`];
    if (head !== undefined) query.push(`head=${encodeURIComponent(head.includes(":") ? head : `${owner}:${head}`)}`);
    if (base !== undefined) query.push(`base=${encodeURIComponent(base)}`);
    const pulls = json<RestPull[]>(gh(["api", `repos/${target}/pulls?${query.join("&")}`]));
    if (isRun(pulls)) return pulls;
    const rows = (pulls ?? [])
      .filter((pull) => state !== "merged" || stateOf(pull) === "MERGED")
      .map((pull) => pick(fieldsOf(pull, () => checks(pull.head.sha)), flag(flags, "--json")));
    return ok(JSON.stringify(rows));
  }

  if (verb === "create") {
    const fields = ["-f", `base=${flag(flags, "--base", "-B") ?? ""}`, "-f", `head=${flag(flags, "--head", "-H") ?? ""}`];
    fields.push("-f", `title=${flag(flags, "--title", "-t") ?? ""}`, "-f", `body=${flag(flags, "--body", "-b") ?? ""}`);
    const created = json<RestPull>(gh(["api", "-X", "POST", `repos/${target}/pulls`, ...fields]));
    if (isRun(created)) return created;
    return created === null ? fail("REST create returned nothing") : ok(`${created.html_url}\n`);
  }

  const number = positional[1];
  if (number === undefined || !/^\d+$/.test(number)) return fail(`gh pr ${verb ?? ""} over REST needs a PR number`);

  if (verb === "view") {
    const pull = json<RestPull>(gh(["api", `repos/${target}/pulls/${number}`]));
    if (isRun(pull)) return pull;
    if (pull === null) return fail(`REST view of #${number} returned nothing`);
    return ok(JSON.stringify(pick(fieldsOf(pull, () => checks(pull.head.sha)), flag(flags, "--json"))));
  }

  if (verb === "edit") {
    const label = flag(flags, "--add-label");
    if (label !== undefined) {
      const labelled = gh(["api", "-X", "POST", `repos/${target}/issues/${number}/labels`, "-f", `labels[]=${label}`]);
      if (labelled.status !== 0) return labelled;
    }
    const patch: string[] = [];
    const title = flag(flags, "--title", "-t");
    const body = flag(flags, "--body", "-b");
    if (title !== undefined) patch.push("-f", `title=${title}`);
    if (body !== undefined) patch.push("-f", `body=${body}`);
    if (patch.length > 0) {
      const edited = gh(["api", "-X", "PATCH", `repos/${target}/pulls/${number}`, ...patch]);
      if (edited.status !== 0) return edited;
    }
    return ok(`https://github.com/${target}/pull/${number}\n`);
  }

  if (verb === "merge") {
    if (switches.has("--auto")) return fail("GraphQL is refused here and auto-merge has no REST endpoint");
    const method = switches.has("--squash") ? "squash" : switches.has("--rebase") ? "rebase" : "merge";
    const merged = gh(["api", "-X", "PUT", `repos/${target}/pulls/${number}/merge`, "-f", `merge_method=${method}`]);
    return merged.status === 0 ? ok(`merged #${number}\n`) : merged;
  }

  return fail(`gh pr ${verb ?? ""} has no REST translation`);
}

/**
 * Wrap a gh runner so `gh pr` calls fall back to REST once GraphQL refuses one. `repo` names the
 * repository (`owner/name`) and is only asked when the fallback is needed.
 */
export function withRestFallback(gh: GhRunner, repo: () => string | null, note: (line: string) => void = () => {}): GhRunner {
  let rest = false;
  return (args) => {
    if (args[0] !== "pr") return gh(args);
    if (!rest) {
      const answer = gh(args);
      if (!graphqlRefused(answer)) return answer;
      rest = true;
      note("GitHub refused GraphQL (403); using the REST API for the rest of this run");
    }
    const slug = repo();
    if (slug === null) return fail("GraphQL was refused and the repository could not be read from the origin remote");
    return restPr(args, slug, gh);
  };
}
