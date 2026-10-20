/**
 * The mounted sim driver's per-frame step, registered so the agent bridge can fast-forward the
 * simulation without rendering (`sim_advance`). Headless software rendering runs at well under
 * 1 fps, so timers, waves and economies otherwise never complete inside a drive capture.
 * @internal
 */
export type SimStep = (rawDt: number) => void;

let current: SimStep | null = null;

/** Register the active driver's step; returns the unregister. Last registration wins. @internal */
export function registerSimStepper(step: SimStep): () => void {
  current = step;
  return () => {
    if (current === step) current = null;
  };
}

/**
 * Step the registered simulation `seconds` of real time in `step`-second frames (each frame runs
 * the full driver step: input, movement, `onTick`, behaviors, bound actions). Capped at 2400
 * frames per call. Returns the frames run, or `null` when no driver is mounted.
 * @internal
 */
export function advanceSimulation(seconds: number, step = 0.05): number | null {
  if (current === null) return null;
  const frame = Math.min(0.05, Math.max(0.001, step));
  const frames = Math.min(2400, Math.max(0, Math.ceil(seconds / frame)));
  for (let index = 0; index < frames; index += 1) current(frame);
  return frames;
}
