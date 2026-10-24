/**
 * Refuses to publish a commit whose own CI run is not green.
 *
 * A release fast-forwards `main` to a `beta` commit, so that commit's CI already ran on the
 * merge and again on the `main` push. `publish.yml` starts from that run's completion and reads
 * its verdict here instead of re-running the suite, so the guarantee that a red commit cannot
 * publish is kept and the duplicate run is gone (#2279).
 *
 * Only the `ci.yml` verdict for this exact SHA counts: a green run of another commit, or a run
 * still in progress, is not evidence. A manual `workflow_dispatch` answers the same question,
 * because a hand-started release skips CI just as easily as a bad push does.
 *
 *   bun scripts/check-release-ci.ts --sha <commit> [--repo owner/name]
 *
 * Exit 0 the commit's CI is green, 1 it is not (or cannot be read).
 */
import { execFileSync } from "node:child_process";

export interface CiRun {
  /** Short id or database id, for the message. */
  id: string | number;
  headSha: string;
  status: string;
  conclusion: string | null;
  event: string;
  url?: string;
}

export interface CiVerdict {
  ok: boolean;
  message: string;
}

/**
 * The verdict for `sha`: one completed, successful `ci.yml` run on that commit.
 *
 * A run that is still queued or in progress is not a green run; it is reported with its status
 * so a release that started too early names the wait instead of failing as a mystery.
 */
export function decideCiRuns(runs: readonly CiRun[], sha: string): CiVerdict {
  const mine = runs.filter((run) => run.headSha === sha);
  if (mine.length === 0) {
    return {
      ok: false,
      message: `no CI run found for ${sha.slice(0, 8)} - a release publishes a commit CI has already proved; push it through a PR first`,
    };
  }
  const green = mine.find((run) => run.status === "completed" && run.conclusion === "success");
  if (green !== undefined) {
    return { ok: true, message: `CI ${green.event} run ${green.id} is green on ${sha.slice(0, 8)}${green.url === undefined ? "" : ` (${green.url})`}` };
  }
  const seen = mine
    .map((run) => `${run.event} run ${run.id}: ${run.status}${run.conclusion === null ? "" : `/${run.conclusion}`}`)
    .join("; ");
  return {
    ok: false,
    message: `CI is not green on ${sha.slice(0, 8)}: ${seen} - fix the commit, or let its CI finish, before publishing`,
  };
}

/** The `ci.yml` runs the Actions API reports for `sha`, newest first. */
export function readCiRuns(repo: string, sha: string): CiRun[] {
  const raw = execFileSync(
    "gh",
    ["api", `repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=50`],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 60_000 },
  );
  const parsed = JSON.parse(raw) as {
    workflow_runs?: Array<{
      id: number;
      head_sha: string;
      status: string;
      conclusion: string | null;
      event: string;
      html_url?: string;
    }>;
  };
  return (parsed.workflow_runs ?? []).map((run) => ({
    id: run.id,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    url: run.html_url,
  }));
}

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};

if (import.meta.main) {
  const sha = argValue("--sha") ?? process.env.RELEASE_SHA ?? process.env.GITHUB_SHA;
  const repo = argValue("--repo") ?? process.env.GITHUB_REPOSITORY;
  if (sha === undefined || sha === "") {
    console.error("check-release-ci: FAIL - name the commit to publish with --sha <commit>");
    process.exit(1);
  }
  if (repo === undefined || repo === "") {
    console.error("check-release-ci: FAIL - cannot tell which repo to read; set GITHUB_REPOSITORY or pass --repo owner/name");
    process.exit(1);
  }
  let verdict: CiVerdict;
  try {
    verdict = decideCiRuns(readCiRuns(repo, sha), sha);
  } catch (error) {
    console.error(`check-release-ci: FAIL - cannot read CI runs for ${sha.slice(0, 8)} (${(error as Error).message})`);
    console.error("A release cannot claim a green commit it could not check.");
    process.exit(1);
  }
  console.log(verdict.ok ? `check-release-ci ok: ${verdict.message}` : `check-release-ci FAIL - ${verdict.message}`);
  process.exit(verdict.ok ? 0 : 1);
}
