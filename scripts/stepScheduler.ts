// The one scheduler for a set of commands with prerequisites: `verify:fast`, `bun run gen` and
// `bun run check` all hand it their steps.

/** What the scheduler reads of a step; callers add their own fields. */
export interface ScheduledStep {
  name: string;
  /** Steps by name that must finish first; a step whose prerequisite failed is reported failed, never green. */
  needs?: string[] | undefined;
  /** Runs with the machine to itself: nothing else is in flight while it runs. */
  exclusive?: boolean | undefined;
  /** Rough seconds, used only for start order: the heaviest runnable step starts first. */
  cost?: number | undefined;
  /**
   * Starts before every step without it, whatever the costs. The cheap checks that fail most
   * often (types, drift gates) carry it, so a mistake surfaces in seconds, not after the tests.
   */
  first?: boolean | undefined;
}

/** Exit code of a step that could not decide on this machine right now (`StepResult.unjudged`). */
export const EXIT_UNJUDGED = 3;

export interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  output: string;
  /** Prerequisites that failed, or the step that stopped a fail-fast run, when this step never ran. */
  blockedBy?: string[];
  /** True when a fail-fast run killed this step part-way: its result says nothing about it. */
  stopped?: boolean;
  /**
   * Why a step that cannot decide on this machine right now (a wall-clock guard on a PC other work
   * keeps busy) neither passed nor failed. Such a step does not fail the run and is never
   * remembered as passed, so the next run tries it again.
   */
  unjudged?: string;
}

export interface RunStepsOptions {
  /**
   * Stop at the first failure. The `first` steps still all run, since they take seconds and an
   * author wants every type error at once; every other step not started yet is reported not run,
   * and the ones in flight are told to stop through the signal handed to `run`.
   */
  failFast?: boolean;
}

/**
 * Run every step with at most `jobs` in flight, a step starting only once its
 * `needs` have settled, not merely started. A step whose prerequisite failed is
 * reported `blockedBy` and never run, so nothing is skipped silently and its
 * dependants fail too. Results come back in `steps` order whatever finished first.
 */
export async function runSteps<S extends ScheduledStep>(
  steps: readonly S[],
  jobs: number,
  run: (step: S, signal: AbortSignal) => Promise<StepResult>,
  options: RunStepsOptions = {},
): Promise<StepResult[]> {
  const names = new Set(steps.map((step) => step.name));
  for (const step of steps) {
    for (const need of step.needs ?? []) {
      if (!names.has(need)) throw new Error(`${step.name} needs ${need}, which is not a step`);
    }
  }

  const resolved = new Map<string, (result: StepResult) => void>();
  const settled = new Map<string, Promise<StepResult>>();
  for (const step of steps) {
    settled.set(step.name, new Promise<StepResult>((resolve) => resolved.set(step.name, resolve)));
  }
  /** Every name was checked above, so a missing one is a bug in this function, not in the caller. */
  const settledOf = (name: string): Promise<StepResult> => {
    const promise = settled.get(name);
    if (promise === undefined) throw new Error(`no step named ${name}`);
    return promise;
  };
  const results = new Map<string, StepResult>();
  const pending = [...steps];
  const inFlight = new Map<string, Promise<StepResult>>();
  const abort = new AbortController();
  const never = new AbortController().signal;
  let stoppedBy: string | null = null;
  const isDone = (name: string): boolean => results.has(name);
  const rank = (step: S): number => (step.first === true ? 1_000_000 : 0) + (step.cost ?? 1);
  /** The first-tier step, else the heaviest, whose prerequisites are done. */
  const runnable = (): number => {
    let best = -1;
    let bestRank = -1;
    pending.forEach((step, index) => {
      if (!(step.needs ?? []).every(isDone)) return;
      if (best < 0 || rank(step) > bestRank) {
        best = index;
        bestRank = rank(step);
      }
    });
    return best;
  };

  const settle = (result: StepResult): void => {
    results.set(result.name, result);
    resolved.get(result.name)?.(result);
    if (options.failFast === true && !result.ok && stoppedBy === null && result.blockedBy === undefined && result.stopped !== true) {
      stoppedBy = result.name;
      abort.abort();
    }
  };

  const lanes = Math.max(1, Math.min(jobs, pending.length));
  let machineHeld = false;
  let turns = 0;
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (;;) {
        // A lane that waits for a prerequisite loops once per turn. Far more turns than
        // steps means nothing can ever start again, so fail with the state instead of
        // spinning a core forever.
        turns += 1;
        if (turns > 50_000) {
          throw new Error(
            `the scheduler stopped making progress; pending ${pending.map((step) => step.name).join(", ")}; ` +
              `in flight ${[...inFlight.keys()].join(", ")}`,
          );
        }
        if (stoppedBy !== null) {
          const stopped = pending.filter((step) => step.first !== true);
          const kept = pending.filter((step) => step.first === true);
          pending.splice(0, pending.length, ...kept);
          for (const step of stopped) {
            settle({ name: step.name, ok: false, ms: 0, output: `not run: stopped after ${stoppedBy} failed`, blockedBy: [stoppedBy] });
          }
        }
        const index = runnable();
        if (index >= 0) {
          const [step] = pending.splice(index, 1);
          if (step === undefined) continue;
          const blockedBy = (step.needs ?? []).filter((need) => results.get(need)?.ok !== true);
          if (blockedBy.length > 0) {
            settle({ name: step.name, ok: false, ms: 0, output: `not run: ${blockedBy.join(", ")} failed`, blockedBy });
            continue;
          }
          const wantsMachine = step.exclusive === true;
          if (inFlight.size > 0 && (wantsMachine || machineHeld)) {
            pending.unshift(step);
            await Promise.race([...inFlight.values()]);
            continue;
          }
          if (wantsMachine) machineHeld = true;
          inFlight.set(step.name, settledOf(step.name));
          const result = await run(step, step.first === true ? never : abort.signal);
          inFlight.delete(step.name);
          if (wantsMachine) machineHeld = false;
          settle(result);
          continue;
        }
        if (pending.length === 0) return;
        // Only unsettled prerequisites: racing an already-resolved need would return at
        // once and leave this lane spinning instead of waiting for the one still running.
        const waiting = pending.flatMap((step) => (step.needs ?? []).filter((need) => !isDone(need)));
        if (waiting.length === 0) continue;
        await Promise.race(waiting.map(settledOf));
      }
    }),
  );
  return steps.map((step) => {
    const result = results.get(step.name);
    if (result === undefined) throw new Error(`${step.name} never settled`);
    return result;
  });
}
