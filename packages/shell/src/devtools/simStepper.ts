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
 * the full driver step: input, movement, `onTick`, behaviors, bound actions). Frames run in
 * batches of {@link FRAMES_PER_YIELD} with a macrotask between batches, so React commits what the
 * sim spawned along the way — models for entities created mid-advance mount as they would in play,
 * instead of one burst the renderer never catches up with. Capped at 2400 frames per call.
 * Resolves to the frames run, or `null` when no driver is mounted.
 * @internal
 */
export async function advanceSimulation(seconds: number, step = 0.05, yieldToHost: () => Promise<void> = defaultYield): Promise<number | null> {
  if (current === null) return null;
  const frame = Math.min(0.05, Math.max(0.001, step));
  const frames = Math.min(2400, Math.max(0, Math.ceil(seconds / frame)));
  for (let index = 0; index < frames; index += 1) {
    if (current === null) return index;
    current(frame);
    if ((index + 1) % FRAMES_PER_YIELD === 0 && index + 1 < frames) await yieldToHost();
  }
  return frames;
}

/** Simulated frames between yields to the host (ten game seconds at 0.05 s frames): each yield can cost a full render frame, which headless software rendering spends seconds on. @internal */
export const FRAMES_PER_YIELD = 200;

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
