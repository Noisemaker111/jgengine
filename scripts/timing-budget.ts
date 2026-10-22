/**
 * Wall-clock ceilings for CPU benchmarks, gated only by `bun run bench:cpu`
 * (CI's `perf` job), never by the unit suite. A shared runner throttles
 * mid-test - the nav crowd suite measured 0.90 ms ticks, then a 4.5 ms p50 on
 * the same run - so a ceiling on the median fails a merge for the runner's
 * neighbours rather than for the code. The measurement itself stays in
 * `bun test`, and its number prints on every run.
 *
 * Two things keep the gate about the code:
 *
 * - It reads the fastest sampled window. A throttled run still has its
 *   normal-speed ticks, so a busy runner passes.
 * - It scales each budget by how slow this machine is right now, measured by
 *   the reference loop below. A runner with slower cores, or one busy for the
 *   whole run, raises the budget by the same factor instead of failing.
 *
 * Each call site documents its budget and the baseline that budget came from;
 * a regression budget is about 2x the fastest window measured on the recording
 * machine, so a doubling is what the gate catches.
 */

export const TIMING_GATE_ENV = "JG_TIMING_GATE";

export const timingGateOn = (): boolean => process.env[TIMING_GATE_ENV] === "1";

/**
 * Fastest of seven runs of a fixed numeric loop on the machine that recorded
 * the baselines (Windows 11 desktop, 2026-10-22).
 */
const REFERENCE_MS = 24.6;

/** Keep a slowdown-tolerant ceiling while still failing a genuine regression. */
const MAX_MACHINE_FACTOR = 4;

function referenceRun(): number {
  const started = performance.now();
  let acc = 0;
  for (let i = 0; i < 1_500_000; i += 1) acc += Math.sqrt(i + (acc % 7));
  return acc === Number.POSITIVE_INFINITY ? Number.NaN : performance.now() - started;
}

/** This machine's current speed relative to the recording machine, clamped. */
export function machineFactor(): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < 7; run += 1) fastest = Math.min(fastest, referenceRun());
  const factor = fastest / REFERENCE_MS;
  return Math.min(MAX_MACHINE_FACTOR, Math.max(1, factor));
}

function timingLine(label: string, numbers: string, detail?: string): string {
  const suffix = detail === undefined ? "" : ` ${detail}`;
  return timingGateOn()
    ? `timing gate: ${label} ${numbers}${suffix}`
    : `timing (measured only, ${TIMING_GATE_ENV}=1 gates it): ${label} ${numbers}${suffix}`;
}

function regressed(label: string, why: string): Error {
  return new Error(
    `${label} regressed: ${why}. Budget and baseline are documented at the call site; ` +
      "raise one only with a measured baseline.",
  );
}

/**
 * Print one measured timing and, in the benchmark job, fail when the fastest
 * window exceeds `budgetMs` scaled for this machine. Returns the fastest window
 * so a relative check can reuse it.
 */
export function gateTimingMs(
  label: string,
  samples: readonly number[],
  budgetMs: number,
  detail?: string,
): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const best = sorted[0] ?? Number.NaN;
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  const max = sorted[sorted.length - 1] ?? Number.NaN;
  const factor = timingGateOn() ? machineFactor() : 1;
  const allowed = budgetMs * factor;
  const numbers =
    `best ${best.toFixed(3)} ms of a ${allowed.toFixed(3)} ms budget ` +
    `(p50 ${p50.toFixed(3)}, max ${max.toFixed(3)}, x${factor.toFixed(2)} machine)`;
  console.log(timingLine(label, numbers, detail));
  if (timingGateOn() && !(best <= allowed)) {
    throw regressed(label, `best ${best.toFixed(3)} ms over the ${allowed.toFixed(3)} ms budget`);
  }
  return best;
}

/**
 * Gate an ordering between two timings measured in the same run. Both slow
 * together on a loaded machine, so the ratio survives load while a lost
 * optimisation does not.
 */
export function gateTimingRatio(
  label: string,
  measuredMs: number,
  referenceMs: number,
  detail?: string,
): void {
  const numbers = `${measuredMs.toFixed(3)} ms against ${referenceMs.toFixed(3)} ms`;
  console.log(timingLine(label, numbers, detail));
  if (timingGateOn() && !(measuredMs < referenceMs)) {
    throw regressed(label, `${measuredMs.toFixed(3)} ms is not faster than ${referenceMs.toFixed(3)} ms`);
  }
}
