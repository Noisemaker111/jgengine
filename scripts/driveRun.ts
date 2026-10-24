/**
 * The step loop `bun run drive` runs: one line per step as it happens, a JSONL row beside it when
 * asked, and a summary of passed/failed/wall/virtual time. The first failure stops the run, so a
 * wrong state never costs the screenshots after it.
 */
import { describeStep, type CaptureStep } from "../packages/jgengine/src/templates/captureArgs";
import { conditionMatches } from "../packages/jgengine/src/templates/driveSteps";

/** An assert mismatch: the step line prints the actual value, and the message names the contract. */
export class AssertionMismatch extends Error {
  constructor(readonly actual: unknown, message: string) {
    super(message);
  }
}

/** One step's outcome, the same shape `--log` writes as a JSONL line. */
export interface DriveStepRecord {
  index: number;
  name: string;
  kind: string;
  ms: number;
  /** True for the step that ran; a real boolean per line so a failed step is not inferred. */
  pass: boolean;
  detail: string;
}

/** What the loop needs from its host: the step work, its two output sinks and a clock. */
export interface DriveStepRunnerDeps {
  /** Do one step's work and return its timing detail ("before 18ms after 21ms"). */
  run(step: CaptureStep, index: number): Promise<string>;
  /** Where a human reads the run: one line per step, then the summary. */
  line(text: string): void;
  /** Where a later agent reads it without scrolling stdout: one row per step. */
  record?(entry: DriveStepRecord): void;
  /** Wall clock; a lockstep recording also reports virtual time. */
  now(): number;
  virtualNow?(): number;
  /** The graphics tier the page resolved, so the summary states what the run measured. */
  tier?: string | null;
}

/** Totals for the run, printed before a failure leaves the function. */
export interface DriveStepSummary {
  passed: number;
  failed: number;
  wallMs: number;
  virtualMs: number;
}

const FAIL = "FAIL";

/**
 * Run steps in order and stop at the first failure, logging every step either way. The summary
 * prints from a `finally`, so a failing run still reports what it got through.
 */
export async function runDriveSteps(steps: readonly CaptureStep[], deps: DriveStepRunnerDeps): Promise<DriveStepSummary> {
  let passed = 0;
  let failed = 0;
  const wallStart = deps.now();
  const virtualStart = deps.virtualNow?.() ?? 0;
  let summary: DriveStepSummary | undefined;
  try {
    for (const [index, step] of steps.entries()) {
      const startedAt = deps.now();
      const name = describeStep(step);
      let detail: string;
      try {
        detail = await deps.run(step, index);
      } catch (error) {
        const ms = Math.round(deps.now() - startedAt);
        const detailText = error instanceof Error ? error.message : String(error);
        failed += 1;
        deps.record?.({ index: index + 1, name, kind: step.kind, ms, pass: false, detail: detailText });
        deps.line(
          "#" + (index + 1) + " " + name + " FAIL" +
            (error instanceof AssertionMismatch ? " actual=" + JSON.stringify(error.actual ?? null) : "") + " " + ms + "ms" +
            (error instanceof AssertionMismatch ? "" : " — " + detailText),
        );
        throw error;
      }
      const ms = Math.round(deps.now() - startedAt);
      passed += 1;
      deps.record?.({ index: index + 1, name, kind: step.kind, ms, pass: true, detail });
      deps.line("#" + (index + 1) + " " + name + " ok" + (detail === "" ? "" : " " + detail) + " total " + ms + "ms");
    }
  } finally {
    summary = {
      passed,
      failed,
      wallMs: Math.round(deps.now() - wallStart),
      virtualMs: deps.virtualNow === undefined ? 0 : Math.round(deps.virtualNow() - virtualStart),
    };
    deps.line("drive: step summary");
    deps.line("  passed   " + summary.passed);
    deps.line("  failed   " + summary.failed);
    deps.line("  wall     " + summary.wallMs + "ms");
    deps.line("  virtual  " + summary.virtualMs + "ms");
    deps.line("  tier     " + (deps.tier ?? "n/a"));
  }
  return summary;
}

/** An assert step, narrowed: the page expression, the value that must match and why. */
export type DriveAssertStep = Extract<CaptureStep, { kind: "assert" }>;

/**
 * Evaluate an assert once and, when it is not the expected value, fail with the actual one. No
 * polling: a contract that is false right now is a failure, not something to wait out.
 */
export async function evaluateAssertStep(
  session: { evaluate(expression: string, options?: { awaitPromise?: boolean }): Promise<unknown> },
  step: DriveAssertStep,
): Promise<unknown> {
  let actual: unknown;
  try {
    actual = await session.evaluate("(async () => (" + step.expression + "))()", { awaitPromise: true });
  } catch (error) {
    throw new Error("assert " + JSON.stringify(step.expression) + " threw " + (error instanceof Error ? error.message : String(error)));
  }
  if (!conditionMatches(actual, step.expected)) {
    throw new AssertionMismatch(
      actual,
      "assert " + JSON.stringify(step.expression) + " is " + JSON.stringify(step.expected) + ", actual " + JSON.stringify(actual ?? null) +
        (step.note === undefined ? "" : " — " + step.note),
    );
  }
  return actual;
}
