import { readFileSync, writeFileSync } from "node:fs";

/**
 * What a drive, shoot or pull is doing right now, so a hard timeout can say what hung instead of
 * only that the budget ran out. `guard.ts` hands its child a file path in {@link STEP_FILE_ENV};
 * {@link markStep} keeps that file current, and the guard reads it when it kills the tree.
 */
export const STEP_FILE_ENV = "JG_STEP_FILE";

/** Budget for getting a dev server: a cold Vite boot on a busy machine plus the broker's queue. */
export const SERVER_STEP_MS = 240_000;

export interface StepMark {
  label: string;
  /** Epoch ms the step began. */
  since: number;
  pid: number;
}

let current: StepMark | null = null;

/** Record the step this process is in; cheap enough to call before every phase. */
export function markStep(label: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): void {
  current = { label, since: now, pid: process.pid };
  const path = env[STEP_FILE_ENV];
  if (path === undefined || path === "") return;
  try {
    writeFileSync(path, JSON.stringify(current));
  } catch {
    /* a lost mark costs a vaguer timeout line, never the run */
  }
}

export function currentStep(): StepMark | null {
  return current;
}

export function readStepFile(path: string): StepMark | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StepMark>;
    if (typeof parsed.label !== "string" || typeof parsed.since !== "number") return null;
    return { label: parsed.label, since: parsed.since, pid: typeof parsed.pid === "number" ? parsed.pid : 0 };
  } catch {
    return null;
  }
}

/** One line naming the step that hung and how long it sat there. */
export function describeHang(step: StepMark | null, now = Date.now()): string {
  if (step === null) return "hung before it reported a step";
  return `hung in: ${step.label} (${Math.round((now - step.since) / 1000)}s in that step)`;
}

export class StepTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly ms: number,
  ) {
    super(`${label} hung: no result after ${Math.round(ms / 1000)}s`);
  }
}

/**
 * Run one step under its own deadline. A CDP call into a frozen page or a download whose body
 * stalls never rejects by itself; this turns that into a named failure the caller can report.
 */
export async function withStepDeadline<T>(label: string, ms: number, run: () => Promise<T>): Promise<T> {
  markStep(label);
  if (!Number.isFinite(ms) || ms <= 0) return run();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeoutError(label, ms)), ms);
  });
  try {
    return await Promise.race([run(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
