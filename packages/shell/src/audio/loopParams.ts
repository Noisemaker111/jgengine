/**
 * Pure clamps for retained-loop live control (#1051). Kept dependency-free so the
 * playback-rate/gain windows are one testable source of truth the audio engine reads.
 */

/** Lowest live playback-rate multiplier (two octaves below authored pitch). */
export const MIN_LOOP_RATE = 0.25;
/** Highest live playback-rate multiplier (two octaves above authored pitch). */
export const MAX_LOOP_RATE = 4;

/**
 * Clamp a loop playback-rate multiplier into the safe pitch window `MIN_LOOP_RATE`–`MAX_LOOP_RATE`
 * (1 = authored pitch). Non-finite input (NaN/±Infinity) falls back to the authored `1`.
 */
export function clampLoopRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_LOOP_RATE, Math.max(MIN_LOOP_RATE, rate));
}

/**
 * Clamp a loop gain multiplier into `0`–`1`. Non-finite input falls back to `0` (silence) so a
 * stray NaN never blasts a loop to full volume.
 */
export function clampLoopGain(gain: number): number {
  if (!Number.isFinite(gain)) return 0;
  return Math.min(1, Math.max(0, gain));
}
