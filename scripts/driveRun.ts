/**
 * The step loop `bun run drive` runs for its step flags: quiet while steps pass, a JSONL row per step
 * when asked, and on a failure every step before it, the failing one and the totals. The first
 * failure stops the run, so a wrong state never costs the screenshots after it.
 */
import { describeStep, type CaptureStep } from "../packages/jgengine/src/templates/captureArgs";
import { withStepDeadline } from "./hangReport";

export interface DriveStepRecord {
  index: number;
  name: string;
  kind: string;
  ms: number;
  /** True for the step that ran; a real boolean per line so a failed step is not inferred. */
  pass: boolean;
  detail: string;
}

export interface DriveStepRunnerDeps {
  run(step: CaptureStep, index: number): Promise<string>;
  line(text: string): void;
  record?(entry: DriveStepRecord): void;
  now(): number;
  virtualNow?(): number;
  /** The graphics tier the page resolved, so the summary states what the run measured. */
  tier?: string | null;
  /**
   * Hard wall-clock budget for one step. A CDP call into a frozen page never rejects by itself, so
   * past this the step fails naming itself instead of the run sitting until the outer guard kills it.
   */
  stepTimeoutMs?(step: CaptureStep, index: number): number;
}

export interface DriveStepSummary {
  passed: number;
  failed: number;
  wallMs: number;
  virtualMs: number;
}

export async function runDriveSteps(steps: readonly CaptureStep[], deps: DriveStepRunnerDeps): Promise<DriveStepSummary> {
  let passed = 0;
  let failed = 0;
  const wallStart = deps.now();
  const virtualStart = deps.virtualNow?.() ?? 0;
  const done: string[] = [];
  try {
    for (const [index, step] of steps.entries()) {
      const startedAt = deps.now();
      const name = describeStep(step);
      let detail: string;
      try {
        const budget = deps.stepTimeoutMs?.(step, index) ?? 0;
        detail = await withStepDeadline(`drive step #${index + 1} ${name}`, budget, () => deps.run(step, index));
      } catch (error) {
        const ms = Math.round(deps.now() - startedAt);
        const detailText = error instanceof Error ? error.message : String(error);
        failed += 1;
        deps.record?.({ index: index + 1, name, kind: step.kind, ms, pass: false, detail: detailText });
        done.push("#" + (index + 1) + " " + name + " FAIL " + ms + "ms — " + detailText);
        throw error;
      }
      const ms = Math.round(deps.now() - startedAt);
      passed += 1;
      deps.record?.({ index: index + 1, name, kind: step.kind, ms, pass: true, detail });
      done.push("#" + (index + 1) + " " + name + " ok" + (detail === "" ? "" : " " + detail) + " " + ms + "ms");
    }
  } finally {
    const wallMs = Math.round(deps.now() - wallStart);
    const virtualMs = deps.virtualNow === undefined ? 0 : Math.round(deps.virtualNow() - virtualStart);
    const totals = wallMs + "ms" + (virtualMs > 0 ? ", " + virtualMs + "ms virtual" : "") + ", tier " + (deps.tier ?? "n/a");
    if (failed === 0) deps.line("drive: " + passed + " step(s) passed in " + totals);
    else {
      for (const line of done) deps.line(line);
      deps.line("drive: FAILED at step " + (passed + 1) + " of " + steps.length + " after " + totals);
    }
  }
  return {
    passed,
    failed,
    wallMs: Math.round(deps.now() - wallStart),
    virtualMs: deps.virtualNow === undefined ? 0 : Math.round(deps.virtualNow() - virtualStart),
  };
}
