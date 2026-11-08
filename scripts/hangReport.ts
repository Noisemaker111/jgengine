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
  /** Ms this process has spent waiting in a queue (the perf lock), which deadlines give back. */
  pausedMs?: number;
  /** Epoch ms the wait in progress began. */
  pausedSince?: number;
}

let current: StepMark | null = null;
let pausedMs = 0;
let pausedSince: number | null = null;

/** Record the step this process is in; cheap enough to call before every phase. */
export function markStep(label: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()): void {
  current = { label, since: now, pid: process.pid, ...(pausedMs > 0 ? { pausedMs } : {}), ...(pausedSince === null ? {} : { pausedSince }) };
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
    return {
      label: parsed.label,
      since: parsed.since,
      pid: typeof parsed.pid === "number" ? parsed.pid : 0,
      ...(typeof parsed.pausedMs === "number" ? { pausedMs: parsed.pausedMs } : {}),
      ...(typeof parsed.pausedSince === "number" ? { pausedSince: parsed.pausedSince } : {}),
    };
  } catch {
    return null;
  }
}

/** Start waiting in a queue: the wait is marked as the step, and deadlines stop counting until {@link endPause}. */
export function beginPause(label: string, now = Date.now()): void {
  if (pausedSince === null) pausedSince = now;
  markStep(label, process.env, now);
}

export function endPause(now = Date.now()): void {
  if (pausedSince === null) return;
  pausedMs += now - pausedSince;
  pausedSince = null;
  if (current !== null) markStep(current.label, process.env, now);
}

/** Every ms a step mark says its process has waited in a queue, the wait in progress included. */
export function pausedTotal(step: StepMark | null, now = Date.now()): number {
  if (step === null) return 0;
  return (step.pausedMs ?? 0) + (step.pausedSince === undefined ? 0 : Math.max(0, now - step.pausedSince));
}

/**
 * A deadline that gives back time spent waiting in a queue: when it fires, any pause that
 * `readPaused` reports since it was armed pushes it back by that much, so a run queued behind
 * another timed run is never killed for the wait. Returns the cancel.
 */
export function pausableDeadline(ms: number, readPaused: () => number, onExpire: () => void, options: { unref?: boolean } = {}): () => void {
  let credited = readPaused();
  let timer: ReturnType<typeof setTimeout>;
  const arm = (delay: number): void => {
    timer = setTimeout(() => {
      const paused = readPaused();
      if (paused > credited) {
        const extra = paused - credited;
        credited = paused;
        arm(extra);
        return;
      }
      onExpire();
    }, delay);
    if (options.unref === true) timer.unref?.();
  };
  arm(ms);
  return () => clearTimeout(timer);
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
