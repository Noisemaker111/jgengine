import { attemptsOf, judgeChecks } from "./ci-status";
import type { RollupEntry } from "./ci-status";
import { checkoutGitHub, ghCli, gitHub, type GitHub } from "./github";
import { QUEUE_LABEL } from "./land";

/**
 * Which open PRs are handed to the landing queue (the `land:queue` label) but red, and on which check.
 *
 * A queued PR with a failed check waits forever: the queue never merges it and nothing retries, so
 * it rots until someone looks. This makes that state one command with a non-zero exit.
 *
 *   bun run ci:status --sweep
 *   bun run ci:status --sweep --json
 *   bun run ci:status --sweep --repo Noisemaker111/jgengine
 */

export interface SweepPr {
  number: number;
  title: string;
  headRefName: string;
  /** The commit the rollup belongs to, so an attempt on an older push is not judged here. */
  headRefOid?: string | null;
  isDraft?: boolean;
  /** GitHub's merge state: `DIRTY` is a conflict with the base. */
  mergeStateStatus?: string;
  labels: string[];
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

/** Why a queued PR cannot merge right now: failing checks, a conflict, a draft, or CI still running. */
export function armState(pr: SweepPr): ArmState {
  const red: string[] = [];
  const waiting: string[] = [];
  if (pr.isDraft === true) red.push("still a draft");
  if (pr.mergeStateStatus === "DIRTY") red.push("merge conflict with beta");
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

export function isQueued(pr: Pick<SweepPr, "labels">): boolean {
  return pr.labels.includes(QUEUE_LABEL);
}

export interface SweepRow {
  pr: SweepPr;
  state: ArmState;
}

export interface SweepReport {
  open: number;
  rows: SweepRow[];
  /** Non-zero while any queued PR is really red, so the command gates a queue. */
  exitCode: number;
}

export function sweep(prs: readonly SweepPr[], open: number = prs.length): SweepReport {
  const rows = prs.filter(isQueued).map((pr) => ({ pr, state: armState(pr) }));
  return { open, rows, exitCode: rows.some((row) => row.state.verdict === "red") ? 1 : 0 };
}

export function armStateLabel(state: ArmState): string {
  return state.verdict === "red" ? "RED " : state.verdict === "wait" ? "wait" : "ok  ";
}

/** One line per queued PR, then the reasons that line cannot stand alone. */
export function formatText(report: SweepReport): string[] {
  const lines = [`ci:status --sweep: ${report.open} open PR(s), ${report.rows.length} in the landing queue`];
  for (const { pr, state } of report.rows) {
    lines.push(`  ${armStateLabel(state)} #${pr.number} ${pr.headRefName} - ${pr.title}`);
    for (const reason of state.red) lines.push(`         queued and red: ${reason}`);
    for (const reason of state.waiting) lines.push(`         ${reason}`);
  }
  const red = report.rows.filter((row) => row.state.verdict === "red");
  if (red.length > 0) {
    lines.push(`ci:status --sweep: ${red.length} queued PR(s) will never merge until fixed: ${red.map((row) => `#${row.pr.number}`).join(", ")}`);
  } else if (report.rows.length > 0) {
    lines.push("ci:status --sweep: no queued PR is red");
  }
  return lines;
}

/**
 * Every open PR, with merge state and checks read only for the queued ones: a list answer has no
 * merge state, so each queued PR is read on its own.
 */
export function readSweep(github: GitHub): SweepReport {
  const listed = github.listPulls({ state: "open", limit: 100 });
  if (!listed.ok) throw new Error(`listing open PRs failed: ${listed.error}`);
  const queued: SweepPr[] = [];
  for (const row of listed.value.filter(isQueued)) {
    const view = github.pull(row.number);
    const pull = view.ok ? view.value : row;
    const checks = github.checks(pull.headRefOid);
    if (!checks.ok) throw new Error(`reading checks on #${pull.number} failed: ${checks.error}`);
    queued.push({ ...pull, statusCheckRollup: checks.value });
  }
  return sweep(queued, listed.value.length);
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const repoIndex = argv.indexOf("--repo");
  const repo = repoIndex === -1 ? null : (argv[repoIndex + 1] ?? null);
  const report = readSweep(repo === null ? checkoutGitHub(process.cwd()) : gitHub(ghCli(), repo));
  if (argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          open: report.open,
          queued: report.rows.map((row) => ({
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
