/** One step a flow ran, for the failure report. */
export interface FlowStepRecord {
  index: number;
  label: string;
  ms: number;
}

/** The step a flow failed at and why, with the probe readings at that moment when the game has a probe. */
export interface FlowFailure {
  index: number;
  label: string;
  message: string;
  probe?: unknown;
}

interface FlowRunBase {
  steps: readonly FlowStepRecord[];
  /** `report(label)` lines, in order. */
  reports: readonly { label: string; probe: unknown }[];
  /** Wall-clock milliseconds the run took. */
  ms: number;
}

/** What a flow run produced: quiet on a pass, every step and the failing one on a failure. */
export type FlowRunReport = (FlowRunBase & { ok: true }) | (FlowRunBase & { ok: false; failure: FlowFailure });

/** A failure already located at a step; the runner reports it as it is.
 * @internal
 */
export class FlowStepFailure extends Error {
  constructor(
    readonly index: number,
    readonly label: string,
    readonly reason: string,
    readonly probe: unknown,
  ) {
    super(`step ${index} (${label}): ${reason}`);
  }
}

/**
 * Numbers and names each step a flow driver runs, so a failure says which step, what it expected and
 * what the probe read, while a passing run prints nothing.
 */
export interface FlowStepper {
  run<T>(label: string, body: () => Promise<T>): Promise<T>;
  readonly records: readonly FlowStepRecord[];
}

/** A stepper whose failures carry the probe readings `readProbe` gives at that moment.
 * @internal shared by the headless and browser runners
 */
export function createFlowStepper(readProbe: () => Promise<unknown>, now: () => number = () => performance.now()): FlowStepper {
  const records: FlowStepRecord[] = [];
  let depth = 0;
  return {
    records,
    async run(label, body) {
      // A step inside a step (a composed helper) is part of its parent, not its own line.
      if (depth > 0) return body();
      const index = records.length + 1;
      const started = now();
      depth += 1;
      try {
        const value = await body();
        records.push({ index, label, ms: Math.round(now() - started) });
        return value;
      } catch (error) {
        records.push({ index, label, ms: Math.round(now() - started) });
        if (error instanceof FlowStepFailure) throw error;
        const reason = error instanceof Error ? error.message : String(error);
        let probe: unknown;
        try {
          probe = await readProbe();
        } catch {
          probe = undefined;
        }
        throw new FlowStepFailure(index, label, reason, probe);
      } finally {
        depth -= 1;
      }
    },
  };
}

/** Finish a run: the report every runner prints from.
 * @internal
 */
export async function runFlowReport(stepper: FlowStepper, reports: { label: string; probe: unknown }[], body: () => Promise<void>, now: () => number = () => performance.now()): Promise<FlowRunReport> {
  const started = now();
  try {
    await body();
    return { ok: true, steps: stepper.records, reports, ms: Math.round(now() - started) };
  } catch (error) {
    const failure: FlowFailure = error instanceof FlowStepFailure
      ? { index: error.index, label: error.label, message: error.reason, ...(error.probe === undefined ? {} : { probe: error.probe }) }
      : { index: stepper.records.length + 1, label: "flow", message: error instanceof Error ? error.message : String(error) };
    return { ok: false, steps: stepper.records, failure, reports, ms: Math.round(now() - started) };
  }
}

/** The lines a run prints: one on a pass; the failing step, its probe and the steps before it on a failure.
 * @internal
 */
export function describeFlowReport(name: string, report: FlowRunReport): string[] {
  const lines = report.reports.map((entry) => `${name}: ${entry.label} ${JSON.stringify(entry.probe)}`);
  if (report.ok) {
    lines.push(`${name}: passed, ${report.steps.length} steps in ${(report.ms / 1000).toFixed(1)}s`);
    return lines;
  }
  const { failure } = report;
  lines.push(`${name}: FAILED at step ${failure.index} (${failure.label})`);
  lines.push(`  ${failure.message}`);
  if (failure.probe !== undefined) lines.push(`  probe: ${JSON.stringify(failure.probe)}`);
  const before = report.steps.filter((step) => step.index < failure.index).slice(-5);
  if (before.length > 0) lines.push(`  steps before it: ${before.map((step) => `#${step.index} ${step.label}`).join(", ")}`);
  return lines;
}
