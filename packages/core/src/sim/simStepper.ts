/**
 * The mounted sim driver's per-frame step, registered so the agent bridge can fast-forward the
 * simulation without rendering (`sim_advance`). Headless software rendering runs at well under
 * 1 fps, so timers, waves and economies otherwise never complete inside a drive capture.
 * @internal
 */
export type SimStep = (rawDt: number) => boolean;

/** What one {@link advanceSimulation} call did: frames that really advanced, and whether play was gated. @internal */
export interface SimAdvanceResult {
  /** Frames the simulation actually stepped; gated frames are never counted. */
  frames: number;
  /** True when a frame found play gated (a menu, a control suspension, the shell's gate) and the advance stopped there. */
  gated: boolean;
}

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
 * batches of {@link FRAMES_PER_YIELD} with a macrotask between batches, so the UI runtime commits what the
 * sim spawned along the way — models for entities created mid-advance mount as they would in play,
 * instead of one burst the renderer never catches up with. Capped at 2400 frames per call.
 * A step that reports play gated advanced nothing, so the advance stops there and reports `gated`
 * with only the frames that ran: a gated frame is never counted as elapsed game time.
 * Resolves to what ran, or `null` when no driver is mounted.
 * @internal
 */
export async function advanceSimulation(seconds: number, step = 0.05, yieldToHost: () => Promise<void> = defaultYield): Promise<SimAdvanceResult | null> {
  if (current === null) return null;
  const frame = Math.min(0.05, Math.max(0.001, step));
  const frames = Math.min(2400, Math.max(0, Math.ceil(seconds / frame)));
  for (let index = 0; index < frames; index += 1) {
    if (current === null) return { frames: index, gated: false };
    if (!current(frame)) return { frames: index, gated: true };
    if ((index + 1) % FRAMES_PER_YIELD === 0 && index + 1 < frames) await yieldToHost();
  }
  return { frames, gated: false };
}

/** Simulated frames between yields to the host (ten game seconds at 0.05 s frames): each yield can cost a full render frame, which headless software rendering spends seconds on. @internal */
export const FRAMES_PER_YIELD = 200;

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
