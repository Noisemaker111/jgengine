import { spawnSync } from "node:child_process";

/**
 * Which open PRs are armed for auto-merge but red, and on which check.
 *
 * An armed PR with a failed check waits forever: GitHub never merges it and nothing retries, so
 * it rots until someone looks. This makes that state one command with a non-zero exit.
 *
 *   bun run pr:sweep
 *   bun run pr:sweep --json
 *   bun run pr:sweep --repo Noisemaker111/jgengine
 */

export interface Check {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string | null;
  state?: string;
  detailsUrl?: string;
  targetUrl?: string;
}

export interface SweepPr {
  number: number;
  title: string;
  headRefName: string;
  isDraft?: boolean;
  mergeable?: string;
  autoMergeRequest: unknown;
  statusCheckRollup?: Check[] | null;
}

export interface ArmState {
  red: string[];
  waiting: string[];
}

const FAILED = new Set(["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);

function checkName(check: Check): string {
  return check.name ?? check.context ?? "unnamed check";
}

function checkUrl(check: Check): string {
  return check.detailsUrl ?? check.targetUrl ?? "";
}

/** Why an armed PR cannot merge right now: failing checks, a conflict, a draft, or CI still running. */
export function armState(pr: SweepPr): ArmState {
  const red: string[] = [];
  const waiting: string[] = [];
  if (pr.isDraft === true) red.push("still a draft");
  if (pr.mergeable === "CONFLICTING") red.push("merge conflict with beta");
  let running = 0;
  let cancelled = 0;
  for (const check of pr.statusCheckRollup ?? []) {
    const verdict = check.conclusion ?? check.state ?? "";
    if (FAILED.has(verdict)) {
      const url = checkUrl(check);
      red.push(`${checkName(check)} ${verdict.toLowerCase()}${url === "" ? "" : ` ${url}`}`);
    } else if (verdict === "CANCELLED") {
      // A push to the branch cancels the run it superseded; the newer run decides, so this is not red.
      cancelled += 1;
    } else if (verdict === "" || verdict === "PENDING" || verdict === "IN_PROGRESS" || verdict === "QUEUED" || check.status !== undefined && check.status !== "COMPLETED") {
      running += 1;
    }
  }
  if (running > 0) waiting.push(`${running} check(s) still running`);
  else if (cancelled > 0) waiting.push(`${cancelled} cancelled check(s) from a superseded run`);
  else if ((pr.statusCheckRollup ?? []).length === 0) waiting.push("no checks reported yet");
  return { red, waiting };
}

export function isArmed(pr: SweepPr): boolean {
  return pr.autoMergeRequest !== null && pr.autoMergeRequest !== undefined;
}

function gh(args: string[], repo: string | null): string {
  const full = repo === null ? args : [...args, "--repo", repo];
  const out = spawnSync("gh", full, { encoding: "utf8", timeout: 60_000 });
  if (out.error !== undefined) throw new Error(`gh ${full.join(" ")} failed: ${out.error.message}`);
  if (out.status !== 0) throw new Error(`gh ${full.join(" ")} failed: ${out.stderr.trim()}`);
  return out.stdout;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const repoIndex = argv.indexOf("--repo");
  const repo = repoIndex === -1 ? null : (argv[repoIndex + 1] ?? null);
  const prs = JSON.parse(
    gh(
      [
        "pr",
        "list",
        "--state",
        "open",
        "--limit",
        "100",
        "--json",
        "number,title,headRefName,isDraft,mergeable,autoMergeRequest,statusCheckRollup",
      ],
      repo,
    ),
  ) as SweepPr[];
  const armed = prs.filter(isArmed);
  const rows = armed.map((pr) => ({ pr, state: armState(pr) }));
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ open: prs.length, armed: rows.map((row) => ({ number: row.pr.number, headRefName: row.pr.headRefName, ...row.state })) }, null, 2));
  } else {
    console.log(`pr:sweep: ${prs.length} open PR(s), ${armed.length} armed for auto-merge`);
    for (const { pr, state } of rows) {
      const label = state.red.length > 0 ? "RED " : state.waiting.length > 0 ? "wait" : "ok  ";
      console.log(`  ${label} #${pr.number} ${pr.headRefName} - ${pr.title}`);
      for (const reason of state.red) console.log(`         armed and red: ${reason}`);
      for (const reason of state.waiting) console.log(`         ${reason}`);
    }
    const red = rows.filter((row) => row.state.red.length > 0);
    if (red.length > 0) {
      console.log(`pr:sweep: ${red.length} armed PR(s) will never merge until fixed: ${red.map((row) => `#${row.pr.number}`).join(", ")}`);
    } else if (armed.length > 0) {
      console.log("pr:sweep: no armed PR is red");
    }
  }
  process.exitCode = rows.some((row) => row.state.red.length > 0) ? 1 : 0;
}
