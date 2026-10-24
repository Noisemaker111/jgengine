import { spawnSync } from "node:child_process";

import { attemptsOf, judgeChecks } from "./ci-status";
import type { RollupEntry } from "./ci-status";

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

export interface SweepPr {
  number: number;
  title: string;
  headRefName: string;
  /** The commit the rollup belongs to, so an attempt on an older push is not judged here. */
  headRefOid?: string | null;
  isDraft?: boolean;
  mergeable?: string;
  autoMergeRequest: unknown;
  statusCheckRollup?: RollupEntry[] | null;
}

export interface ArmState {
  /** Real blockers right now, each one named. */
  red: string[];
  /** Not blocked, just not mergeable yet. */
  waiting: string[];
  verdict: "red" | "wait" | "clean";
}

/** A cancelled or stale attempt produced no result: nothing to fix, but nothing proved either. */
const NO_RESULT_STATES = new Set(["CANCELLED", "STALE"]);

/** Why an armed PR cannot merge right now: failing checks, a conflict, a draft, or CI still running. */
export function armState(pr: SweepPr): ArmState {
  const red: string[] = [];
  const waiting: string[] = [];
  if (pr.isDraft === true) red.push("still a draft");
  if (pr.mergeable === "CONFLICTING") red.push("merge conflict with beta");
  const rollup = pr.statusCheckRollup ?? [];
  const checks = judgeChecks(attemptsOf(rollup), pr.headRefOid ?? undefined);
  const noResult = (check: { state: string }) => NO_RESULT_STATES.has(check.state.toUpperCase());
  for (const check of checks) {
    if (check.bucket !== "fail" || noResult(check)) continue;
    red.push(`${check.name} ${check.state.toLowerCase()}${check.url === "" ? "" : ` ${check.url}`}`);
  }
  const pending = checks.filter((check) => check.bucket === "pending");
  if (pending.length > 0) {
    const runIds = [...new Set(pending.map((check) => check.runId).filter((id): id is number => id !== null))];
    waiting.push(`still running: ${pending.length} of ${checks.length}${runIds.length === 0 ? "" : ` (run ${runIds.join(", ")})`}`);
  }
  const rerun = checks.filter((check) => check.bucket === "fail" && noResult(check));
  if (rerun.length > 0) {
    waiting.push(`cancelled with no result, so a re-run decides: ${rerun.length} of ${checks.length}: ${rerun.map((check) => check.name).join(", ")}`);
  }
  if (pending.length === 0 && rerun.length === 0 && rollup.length === 0) {
    waiting.push("no checks reported yet");
  }
  const verdict = red.length > 0 ? "red" : waiting.length > 0 ? "wait" : "clean";
  return { red, waiting, verdict };
}

export function isArmed(pr: SweepPr): boolean {
  return pr.autoMergeRequest !== null && pr.autoMergeRequest !== undefined;
}

export interface SweepRow {
  pr: SweepPr;
  state: ArmState;
}

export interface SweepReport {
  open: number;
  rows: SweepRow[];
  /** Non-zero while any armed PR is really red, so the command gates a queue. */
  exitCode: number;
}

export function sweep(prs: readonly SweepPr[]): SweepReport {
  const rows = prs.filter(isArmed).map((pr) => ({ pr, state: armState(pr) }));
  return { open: prs.length, rows, exitCode: rows.some((row) => row.state.verdict === "red") ? 1 : 0 };
}

export function label(state: ArmState): string {
  return state.verdict === "red" ? "RED " : state.verdict === "wait" ? "wait" : "ok  ";
}

/** One line per armed PR, then the reasons that line cannot stand alone. */
export function formatText(report: SweepReport): string[] {
  const lines = [`pr:sweep: ${report.open} open PR(s), ${report.rows.length} armed for auto-merge`];
  for (const { pr, state } of report.rows) {
    lines.push(`  ${label(state)} #${pr.number} ${pr.headRefName} - ${pr.title}`);
    for (const reason of state.red) lines.push(`         armed and red: ${reason}`);
    for (const reason of state.waiting) lines.push(`         ${reason}`);
  }
  const red = report.rows.filter((row) => row.state.verdict === "red");
  if (red.length > 0) {
    lines.push(`pr:sweep: ${red.length} armed PR(s) will never merge until fixed: ${red.map((row) => `#${row.pr.number}`).join(", ")}`);
  } else if (report.rows.length > 0) {
    lines.push("pr:sweep: no armed PR is red");
  }
  return lines;
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
        "number,title,headRefName,headRefOid,isDraft,mergeable,autoMergeRequest,statusCheckRollup",
      ],
      repo,
    ),
  ) as SweepPr[];
  const report = sweep(prs);
  if (argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          open: report.open,
          armed: report.rows.map((row) => ({
            number: row.pr.number,
            headRefName: row.pr.headRefName,
            verdict: row.state.verdict,
            red: row.state.red,
            waiting: row.state.waiting,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    for (const line of formatText(report)) console.log(line);
  }
  process.exitCode = report.exitCode;
}
