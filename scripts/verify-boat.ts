// Where each `verify:fast` step runs: a boat.dev Linux machine, or this PC through a fairshare
// heavy-job slot. Jon's PC is shared with his games and every thread's landing: a gate saw it at
// 100% CPU and suites time out, and lanes queued for hours on the two local slots. So every step
// Linux can run goes to boat, and only what truly needs this PC stays:
//
// - steps that measure this machine (`exclusive`: timing budgets, launch handshakes);
// - steps that boot a game against this PC's asset store (provision, boot probe);
// - test files that skip themselves in CI (`assetTest`, `inCi()`: they read downloaded models)
//   or branch on Windows (`process.platform`, "win32"): CI on Linux never proved them, so a boat
//   run would skip what a local run checks.
//
// Everything else is what CI runs on ubuntu: type-checks, gates and test files. The machine runs
// with `CI=1`, as CI does.
//
// Boat busy (both machines in use, a start window that frees within the hour) is waited for inside
// `runOnBoat`; the Linux steps never move here for that. Boat spent (the day's starts used, a window
// hours away) stops the run: the Linux steps fail as not run, with when boat frees, and never run
// here, or every landing on the PC would run its whole suite at once. Boat unusable (no CLI, not logged in, out of hours, the
// network down, the run broke before any step reported) says why and runs them in the local slot,
// since a landing must still work. While boat runs, this PC holds a slot only for its own steps.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { boatExe, boatMaxMachines, deleteOwnMachinesSync, fairshareExe, realBoatCli, registryPath, runOnBoat, type BoatCli, type RunFacts } from "./boat";
import { READY_MARK, SETUP_FAILED_MARK, writeSnapshot, type Snapshot } from "./boat-snapshot";
import { DONE_MARK, parseFileLine, parseResultLine, parseStartLine, type RemotePlan, type RemoteStep } from "./boat-steps";
import type { RunStepsOptions, ScheduledStep, StepResult } from "./stepScheduler";

/** A test file that imports the CI skip for downloaded models (`games/shared/assetTest.ts`). */
export const MODEL_TEST_SOURCE = /from\s+["'][^"']*\/assetTest(\.ts)?["']/;

/** Why a test that reads this PC's downloaded models runs here: `verify:fast` links those models first. */
export const MODEL_TEST_REASON = "reads this PC's downloaded models (skipped in CI)";
/** A test file that compares `process.platform` with "win32": it checks something only Windows has. */
export const WINDOWS_TEST_SOURCE = /process\.platform\s*[!=]==?\s*["']win32["']|["']win32["']\s*[!=]==?\s*process\.platform/;

/** Commands that boot a game against this PC's asset store and GPU. */
const LOCAL_COMMAND = /(^|\/)(provision-assets|capabilities-probe|load-check|smoke-games|perf-gate|bench-cpu)\.ts$/;

/** A step as placement reads it: the scheduler's fields and the command. */
export interface PlaceableStep extends ScheduledStep {
  command: string[];
  /** Set by whoever built the step: it needs this PC, and why. */
  localBecause?: string | undefined;
}

export type Where = "boat" | "local";

export interface Placement {
  where: Where;
  why: string;
}

/** Why a step must run on this PC, or null when Linux can run it. */
export function localReason(step: PlaceableStep): string | null {
  if (step.localBecause !== undefined) return step.localBecause;
  if (step.exclusive === true) return "measures this machine";
  const script = step.command.find((word) => word.endsWith(".ts"));
  if (script !== undefined && LOCAL_COMMAND.test(script)) return "boots a game against this PC's asset store and GPU";
  return null;
}

/**
 * Each step's place. A step whose prerequisite stays local stays local too, so no step waits on
 * another machine's result.
 */
export function placeSteps<S extends PlaceableStep>(steps: readonly S[]): Map<string, Placement> {
  const placed = new Map<string, Placement>();
  for (const step of steps) {
    const reason = localReason(step);
    placed.set(step.name, reason === null ? { where: "boat", why: "Linux runs it, as CI does" } : { where: "local", why: reason });
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const step of steps) {
      if (placed.get(step.name)?.where !== "boat") continue;
      const need = (step.needs ?? []).find((name) => placed.get(name)?.where === "local");
      if (need !== undefined) {
        placed.set(step.name, { where: "local", why: `needs ${need}, which runs on this PC` });
        changed = true;
      }
    }
    for (const step of steps) {
      if (placed.get(step.name)?.where !== "local") continue;
      for (const need of step.needs ?? []) {
        if (placed.get(need)?.where === "boat") {
          placed.set(need, { where: "local", why: `${step.name} needs it on this PC` });
          changed = true;
        }
      }
    }
  }
  return placed;
}

/** At most this many test files on this PC run without a heavy-job slot, as fairshare lets one test file run. */
export const LIGHT_TEST_FILES = 3;

/** A few test files and nothing else: light work fairshare never makes wait, so it takes no slot. */
export function isLight(group: readonly PlaceableStep[]): boolean {
  let files = 0;
  for (const step of group) {
    if (step.command[0] !== "bun" || step.command[1] !== "test") return false;
    files += step.command.slice(2).filter((word) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(word)).length;
  }
  return files <= LIGHT_TEST_FILES;
}

/** What the receipt keeps about the boat side of a run. */
export interface BoatReceipt {
  status: "passed" | "failed" | "spent" | "unusable" | "broken" | "timed-out" | "off";
  /** The boat machine's id: the run id `boat history`, `boat usage` and the dashboard know. */
  runId?: string | undefined;
  costUsd?: number | undefined;
  seconds?: number | undefined;
  waitedMs?: number | undefined;
  /** The commit the machine checked out, and this checkout's HEAD. */
  commit?: string | undefined;
  head?: string | undefined;
  packBytes?: number | undefined;
  /** Why boat was not used, or why the run broke. */
  why?: string | undefined;
  /** When boat takes starts again, for a spent run whose window boat named. */
  until?: string | undefined;
  steps: string[];
}

export interface PlacedRunInput<S extends PlaceableStep> {
  root: string;
  steps: readonly S[];
  /** Steps at once on this PC. */
  jobs: number;
  failFast: boolean;
  baseRef: string;
  /** Run one step on this PC. */
  runLocal: (step: S) => Promise<StepResult>;
  /** The scheduler for a group of steps (stepScheduler's `runSteps`). */
  schedule: (steps: readonly S[], jobs: number, run: (step: S) => Promise<StepResult>, options: RunStepsOptions) => Promise<StepResult[]>;
  onStart: (step: S, where: Where) => void;
  onSettle: (result: StepResult, where: Where) => void;
  note: (line: string) => void;
  /** The boat CLI; null when there is none. */
  boat: BoatCli | null;
  /** Hold a fairshare heavy-job slot around this PC's own steps. */
  withSlot: <T>(work: () => Promise<T>) => Promise<T>;
  env?: Readonly<Record<string, string | undefined>>;
  /** Writes the push directory; `writeSnapshot` by default. */
  snapshot?: (root: string, baseRef: string) => Snapshot;
  timeoutSeconds?: number;
}

export interface PlacedRun {
  results: StepResult[];
  placement: Map<string, Placement>;
  boat: BoatReceipt;
}

/**
 * verify:fast's exit when boat had no start for its Linux steps (the day's starts used): they did
 * not run anywhere, so the run is unproven, not failed. lane:close says to land again when boat
 * frees, never to run them here.
 */
export const EXIT_BOAT_SPENT = 75;

/** Steps at once on a boat machine: its 4 cores. */
export const BOAT_JOBS = 4;

/** `JG_VERIFY_BOAT=0` keeps every step on this PC (the old path); anything else uses boat when it can. */
export function boatWanted(env: Readonly<Record<string, string | undefined>>): boolean {
  return env["JG_VERIFY_BOAT"] !== "0";
}

/** The command the machine runs in the pushed directory. */
export function remoteCommand(): string[] {
  return ["bash", "-lc", 'bash setup.sh && export PATH="$HOME/.bun/bin:$PATH" && cd repo && CI=1 JGENGINE_SUITE_WRITE=1 bun scripts/boat-steps.ts ../steps.json'];
}

/**
 * Run `steps` where `placeSteps` puts them: the boat group on one machine, the rest on this PC in
 * a heavy-job slot, both at once. A boat failure stops new local steps (`failFast`). Results come
 * back in `steps` order.
 */
export async function runPlaced<S extends PlaceableStep>(input: PlacedRunInput<S>): Promise<PlacedRun> {
  const env = input.env ?? process.env;
  const placement = placeSteps(input.steps);
  const boatSteps = input.steps.filter((step) => placement.get(step.name)?.where === "boat");
  const results = new Map<string, StepResult>();
  const settle = (result: StepResult, where: Where): void => {
    results.set(result.name, result);
    input.onSettle(result, where);
  };
  const runHere = (group: readonly S[], stopWhen?: () => string | null): Promise<StepResult[]> => {
    if (group.length === 0) return Promise.resolve([]);
    const work = (): Promise<StepResult[]> =>
      input.schedule(group, input.jobs, input.runLocal, {
        failFast: input.failFast,
        ...(stopWhen === undefined ? {} : { stopWhen }),
        onStart: (step) => input.onStart(step as S, "local"),
        onSettle: (result) => settle(result, "local"),
      });
    return isLight(group) ? work() : input.withSlot(work);
  };
  const ordered = (): StepResult[] => input.steps.map((step) => results.get(step.name)!);
  const allLocal = async (why: string, status: BoatReceipt["status"]): Promise<PlacedRun> => {
    for (const step of boatSteps) placement.set(step.name, { where: "local", why: `boat: ${why}` });
    await runHere(input.steps);
    return { results: ordered(), placement, boat: { status, why, steps: [] } };
  };

  if (boatSteps.length === 0) return allLocal("no step here needs Linux", "off");
  if (!boatWanted(env)) return allLocal("JG_VERIFY_BOAT=0 keeps every step on this PC", "off");
  if (input.boat === null) {
    input.note("verify:fast: no boat CLI on this PC (~/.ascii/bin/boat.exe, or BOAT_EXE); every step runs here.");
    return allLocal("no boat CLI on this PC", "unusable");
  }

  const localSteps = input.steps.filter((step) => placement.get(step.name)?.where === "local");
  let remoteFailure: string | null = null;

  // Before any local step starts: packing is synchronous, and a child's output would wait on it.
  let snapshot: Snapshot;
  try {
    snapshot = (input.snapshot ?? writeSnapshot)(input.root, input.baseRef);
  } catch (error) {
    const why = `could not pack this checkout for the machine: ${(error as Error).message.split("\n")[0]}`;
    input.note(`verify:fast: ${why}; every step runs here.`);
    return allLocal(why, "unusable");
  }
  const localRun = runHere(localSteps, () => remoteFailure);
  if (snapshot.leftOut.length > 0) input.note(`verify:fast: left off the boat machine because the names look like secrets: ${snapshot.leftOut.join(", ")}`);
  const plan: RemotePlan = {
    jobs: BOAT_JOBS,
    failFast: input.failFast,
    steps: boatSteps.map((step): RemoteStep => ({
      name: step.name,
      command: step.command,
      ...(step.needs === undefined ? {} : { needs: step.needs }),
      ...(step.cost === undefined ? {} : { cost: step.cost }),
      ...(step.first === undefined ? {} : { first: step.first }),
    })),
  };
  writeFileSync(join(snapshot.dir, "steps.json"), `${JSON.stringify(plan)}\n`, "utf8");

  const byName = new Map(boatSteps.map((step) => [step.name, step]));
  const tail: string[] = [];
  let setupFailed: string | null = null;
  let ready = false;
  let done = false;
  const onLine = (line: string): void => {
    const started = parseStartLine(line);
    if (started !== null) {
      const step = byName.get(started);
      if (step !== undefined) input.onStart(step, "boat");
      return;
    }
    const result = parseResultLine(line);
    if (result !== null && byName.has(result.name)) {
      if (result.junit !== undefined) {
        const target = join(input.root, result.junit.path);
        mkdirSync(join(target, ".."), { recursive: true });
        writeFileSync(target, result.junit.xml, "utf8");
      }
      const { junit: _junit, ...plain } = result;
      settle(plain, "boat");
      if (!result.ok && result.blockedBy === undefined && remoteFailure === null) remoteFailure = `${result.name} (on boat)`;
      return;
    }
    const returned = parseFileLine(line);
    if (returned !== null) {
      const target = join(input.root, returned.path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, returned.text, "utf8");
      return;
    }
    if (line.startsWith(READY_MARK)) {
      ready = true;
      input.note(`verify:fast: boat machine ready at ${line.slice(READY_MARK.length).trim().slice(0, 12)}; ${boatSteps.length} step(s) run there`);
      return;
    }
    if (line.startsWith(SETUP_FAILED_MARK)) {
      setupFailed = line.slice(SETUP_FAILED_MARK.length).trim();
      return;
    }
    if (line.startsWith(DONE_MARK)) {
      done = true;
      return;
    }
    tail.push(line);
    if (tail.length > 40) tail.shift();
  };

  const timeoutSeconds = input.timeoutSeconds ?? (Number(env["JG_BOAT_TIMEOUT"]) > 0 ? Number(env["JG_BOAT_TIMEOUT"]) : 1800);
  const registry = registryPath(input.root);
  input.note(`verify:fast: ${boatSteps.length} step(s) to a boat machine (${(snapshot.packBytes / 1e6).toFixed(0)} MB pushed), ${localSteps.length} on this PC`);
  let outcome: Awaited<ReturnType<typeof runOnBoat>>;
  try {
    outcome = await runOnBoat(input.boat, {
      push: snapshot.dir,
      command: remoteCommand(),
      timeoutSeconds,
      what: `verify:fast ${snapshot.branch} ${snapshot.commit.slice(0, 12)}`,
      registry,
      max: boatMaxMachines(env),
      onLine,
      onBoatLine: (line) => tail.push(`[boat] ${line}`),
      note: input.note,
    });
  } finally {
    rmSync(snapshot.dir, { recursive: true, force: true });
  }

  const facts: RunFacts = outcome.kind === "ran" ? outcome.facts : {};
  const receipt: BoatReceipt = {
    status: "passed",
    runId: facts.id,
    costUsd: facts.costUsd,
    seconds: facts.seconds,
    waitedMs: outcome.waitedMs,
    commit: snapshot.commit,
    head: snapshot.head,
    packBytes: snapshot.packBytes,
    steps: boatSteps.map((step) => step.name),
  };
  const missing = boatSteps.filter((step) => !results.has(step.name));

  if (outcome.kind === "spent") {
    const until = outcome.until === undefined ? undefined : new Date(outcome.until).toISOString();
    const when = until === undefined ? "" : ` Boat takes starts again from ${until}.`;
    // The run fails whatever this PC does now: stop its own steps from starting too.
    remoteFailure = "boat had no start for the Linux steps";
    input.note(
      `verify:fast: boat has no start for this run: ${outcome.why}. The ${missing.length} Linux step(s) did not run, and were not run on this PC either.${when} ` +
        "Run again then. Do not set JG_VERIFY_BOAT=0 to get past this: that runs the whole Linux suite on this PC.",
    );
    for (const step of missing) settle({ name: step.name, ok: false, ms: 0, output: `not run: ${outcome.why}.${when}` }, "boat");
    await localRun;
    return { results: ordered(), placement, boat: { ...receipt, status: "spent", why: outcome.why, until, steps: [] } };
  }

  if (outcome.kind === "unusable") {
    input.note(`verify:fast: boat cannot be used: ${outcome.why}. The ${missing.length} Linux step(s) run on this PC instead.`);
    await localRun;
    for (const step of missing) placement.set(step.name, { where: "local", why: `boat: ${outcome.why}` });
    await runHere(missing, () => remoteFailure);
    return { results: ordered(), placement, boat: { ...receipt, status: "unusable", why: outcome.why, steps: [] } };
  }

  if (missing.length > 0) {
    const timedOut = outcome.status === 124;
    const why = timedOut
      ? `the boat run reached its --timeout of ${timeoutSeconds} s`
      : setupFailed !== null
        ? `setting up the machine failed: ${setupFailed}`
        : !ready
          ? `the boat run ended (exit ${outcome.status}) before the machine was ready`
          : `the boat run ended (exit ${outcome.status}) before every step reported`;
    const context = tail.slice(-15).join("\n");
    if (timedOut || (ready && done)) {
      // A hang here would hang on this PC too: report it, do not rerun it.
      for (const step of missing) settle({ name: step.name, ok: false, ms: 0, output: `${why}\n${context}` }, "boat");
      receipt.status = timedOut ? "timed-out" : "failed";
      receipt.why = why;
    } else {
      input.note(`verify:fast: ${why}; the ${missing.length} step(s) it did not report run on this PC.${context.length > 0 ? `\n${context}` : ""}`);
      await localRun;
      for (const step of missing) placement.set(step.name, { where: "local", why: `boat: ${why}` });
      await runHere(missing, () => remoteFailure);
      receipt.status = "broken";
      receipt.why = why;
      receipt.steps = receipt.steps.filter((name) => !missing.some((step) => step.name === name));
    }
  }
  await localRun;
  if (receipt.status === "passed" && boatSteps.some((step) => results.get(step.name)?.ok !== true)) receipt.status = "failed";
  return { results: ordered(), placement, boat: receipt };
}

// ---- The fairshare slot around this PC's own steps ----

/** The holder `fairshare slot` runs: says it holds the slot, then waits for its stdin to close. */
const HOLDER = 'console.log("held"); await Bun.stdin.text();';

/**
 * Hold one fairshare heavy-job slot while `work` runs: the steps this PC runs count as one whole
 * check against the PC's two, and the wait for boat holds none. Work already inside a slot
 * (`FAIRSHARE_HEAVY_HELD`, set by fairshare for what it started) does not take a second.
 */
export async function withHeavySlot<T>(work: () => Promise<T>, options: { note: (line: string) => void; env?: NodeJS.ProcessEnv } = { note: () => {} }): Promise<T> {
  const env = options.env ?? process.env;
  const exe = fairshareExe(env);
  if (exe === null || (env["FAIRSHARE_HEAVY_HELD"] ?? "") !== "") return work();
  const holder = spawn(exe, ["slot", process.execPath, "-e", HOLDER], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const held = await new Promise<boolean>((resolve) => {
    let out = "";
    holder.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      if (out.includes("held")) resolve(true);
    });
    holder.stderr.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) if (line.trim().length > 0) options.note(line.trim());
    });
    holder.on("error", () => resolve(false));
    holder.on("close", () => resolve(false));
  });
  if (!held) {
    options.note("verify:fast: fairshare did not give a heavy-job slot; this PC's steps run without one.");
    return work();
  }
  const before = env["FAIRSHARE_HEAVY_HELD"];
  env["FAIRSHARE_HEAVY_HELD"] = "1";
  try {
    return await work();
  } finally {
    if (before === undefined) delete env["FAIRSHARE_HEAVY_HELD"];
    else env["FAIRSHARE_HEAVY_HELD"] = before;
    holder.stdin.end();
    setTimeout(() => holder.kill(), 5_000).unref();
  }
}

/** The real boat CLI, with this process's machines deleted on Ctrl-C or any exit. */
export function boatForThisRun(root: string, env: Readonly<Record<string, string | undefined>> = process.env): BoatCli | null {
  const exe = boatExe(env);
  if (exe === null) return null;
  const registry = registryPath(root);
  const cleanup = (): void => deleteOwnMachinesSync(exe, registry);
  process.once("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      cleanup();
      process.exit(130);
    });
  }
  return realBoatCli(exe, fairshareExe(env));
}

/** The test files among `files` that must run on this PC, each with its reason. */
export function localTestFiles(root: string, files: readonly string[], read: (path: string) => string = (path) => readFileSync(join(root, path), "utf8")): Map<string, string> {
  const local = new Map<string, string>();
  for (const file of files) {
    let source: string;
    try {
      source = read(file);
    } catch {
      continue;
    }
    if (MODEL_TEST_SOURCE.test(source)) local.set(file, MODEL_TEST_REASON);
    else if (WINDOWS_TEST_SOURCE.test(source)) local.set(file, "checks something only Windows has");
  }
  return local;
}
