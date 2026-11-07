// Runs on a boat machine, inside the checkout `boat-snapshot.ts` set up: the steps `verify:fast`
// placed on Linux, through the same scheduler as a local run, one result line per step the moment
// it settles, so the PC reads each verdict as it comes and can stop its own steps on a failure.
//
//   bun scripts/boat-steps.ts <steps.json>
//
// Each result is one line: `@@boat-step <json>` with name, ok, ms, blockedBy, the output of a
// failing step (its tail, so one runaway log cannot swamp the line) and the junit report a test
// step wrote, which the PC files where its own run would have. Each game suite report the run rewrote
// comes back as `@@boat-file <json>` (path and text), which the PC writes into the lane for its
// commit, as a local run leaves it there. `@@boat-done <ok>` ends the run.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { runSteps, type ScheduledStep, type StepResult } from "./stepScheduler";

export const STEP_MARK = "@@boat-step";
export const START_MARK = "@@boat-start";
export const DONE_MARK = "@@boat-done";
export const FILE_MARK = "@@boat-file";

/** The output kept of a failing step: its last this many characters. */
export const OUTPUT_TAIL = 200_000;

export interface RemoteStep extends ScheduledStep {
  command: string[];
}

export interface RemotePlan {
  jobs: number;
  failFast: boolean;
  steps: RemoteStep[];
}

export interface RemoteResult extends StepResult {
  /** The junit report a test step wrote (`--reporter-outfile`), when it wrote one. */
  junit?: { path: string; xml: string };
}

/** The `--reporter-outfile=` a command writes, if any. */
export function reportPath(command: readonly string[]): string | null {
  const flag = command.find((word) => word.startsWith("--reporter-outfile="));
  return flag === undefined ? null : flag.slice("--reporter-outfile=".length);
}

/** One result as the line the PC reads. */
export function resultLine(result: RemoteResult): string {
  const output = result.ok ? "" : result.output.length > OUTPUT_TAIL ? `[... ${result.output.length - OUTPUT_TAIL} characters cut]\n${result.output.slice(-OUTPUT_TAIL)}` : result.output;
  return `${STEP_MARK} ${JSON.stringify({ ...result, output })}`;
}

/** The step name a `@@boat-start` line carries, or null for any other line. */
export function parseStartLine(line: string): string | null {
  if (!line.startsWith(START_MARK)) return null;
  try {
    const name = JSON.parse(line.slice(START_MARK.length).trim()) as unknown;
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

/** The result a `@@boat-step` line carries, or null for any other line. */
export function parseResultLine(line: string): RemoteResult | null {
  if (!line.startsWith(STEP_MARK)) return null;
  try {
    const parsed = JSON.parse(line.slice(STEP_MARK.length).trim()) as RemoteResult;
    return typeof parsed.name === "string" && typeof parsed.ok === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

/** A file the run rewrote, carried back to the PC: its path relative to the checkout and its text. */
export interface ReturnedFile {
  path: string;
  text: string;
}

/** Every game's suite report under `root`, by path relative to it (the files a suite test rewrites). */
export function suiteReports(root: string): Map<string, string> {
  const reports = new Map<string, string>();
  const games = join(root, "games");
  if (!existsSync(games)) return reports;
  for (const entry of readdirSync(games, { withFileTypes: true })) {
    const path = `games/${entry.name}/proofs/suite-report.json`;
    if (entry.isDirectory() && existsSync(join(root, path))) reports.set(path, readFileSync(join(root, path), "utf8"));
  }
  return reports;
}

/** The reports in `after` that are new or differ from `before`. */
export function changedFiles(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): ReturnedFile[] {
  return [...after].filter(([path, text]) => before.get(path) !== text).map(([path, text]) => ({ path, text }));
}

/** The file a `@@boat-file` line carries, or null for any other line. */
export function parseFileLine(line: string): ReturnedFile | null {
  if (!line.startsWith(FILE_MARK)) return null;
  try {
    const parsed = JSON.parse(line.slice(FILE_MARK.length).trim()) as ReturnedFile;
    return typeof parsed.path === "string" && typeof parsed.text === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function runOne(step: RemoteStep): Promise<RemoteResult> {
  const started = Date.now();
  const report = reportPath(step.command);
  if (report !== null) mkdirSync(dirname(report), { recursive: true });
  const proc = Bun.spawn(step.command, { stdout: "pipe", stderr: "pipe", env: process.env });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const result: RemoteResult = { name: step.name, ok: code === 0, ms: Date.now() - started, output: `${stdout}${stderr}` };
  if (report !== null && existsSync(report)) result.junit = { path: report, xml: readFileSync(report, "utf8") };
  return result;
}

async function main(argv: readonly string[]): Promise<number> {
  const file = argv[0];
  if (file === undefined) {
    console.error("usage: bun scripts/boat-steps.ts <steps.json>");
    return 2;
  }
  const plan = JSON.parse(readFileSync(file, "utf8")) as RemotePlan;
  const before = suiteReports(process.cwd());
  const results = await runSteps(plan.steps, plan.jobs, runOne, {
    failFast: plan.failFast,
    onStart: (step) => console.log(`${START_MARK} ${JSON.stringify(step.name)}`),
    onSettle: (result) => console.log(resultLine(result as RemoteResult)),
  });
  const ok = results.every((result) => result.ok);
  for (const returned of changedFiles(before, suiteReports(process.cwd()))) console.log(`${FILE_MARK} ${JSON.stringify(returned)}`);
  console.log(`${DONE_MARK} ${ok}`);
  return ok ? 0 : 1;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
