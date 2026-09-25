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
 * @internal — the audio engine applies this; game code sets rate through `ctx.game.audio.setLoop`.
 */
export function clampLoopRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_LOOP_RATE, Math.max(MIN_LOOP_RATE, rate));
}

/**
 * Clamp a loop gain multiplier into `0`–`1`. Non-finite input falls back to `0` (silence) so a
 * stray NaN never blasts a loop to full volume.
 * @internal — the audio engine applies this; game code sets gain through `ctx.game.audio.setLoop`.
 */
export function clampLoopGain(gain: number): number {
  if (!Number.isFinite(gain)) return 0;
  return Math.min(1, Math.max(0, gain));
}

/** Lowest live filter cutoff, Hz. */
export const MIN_LOOP_CUTOFF = 10;
/** Highest live filter cutoff, Hz; the engine also caps it at the context's Nyquist frequency. */
export const MAX_LOOP_CUTOFF = 22050;

/**
 * Clamp a loop filter cutoff into `MIN_LOOP_CUTOFF`–`min(MAX_LOOP_CUTOFF, nyquist)` Hz. Non-finite input
 * falls back to `fallback` (the open, transparent end of that filter).
 * @internal — the audio engine applies this; game code sets cutoffs through `ctx.game.audio.setLoop`.
 */
export function clampLoopCutoff(hz: number, fallback: number, nyquist = MAX_LOOP_CUTOFF): number {
  const max = Math.min(MAX_LOOP_CUTOFF, nyquist);
  if (!Number.isFinite(hz)) return Math.min(max, Math.max(MIN_LOOP_CUTOFF, fallback));
  return Math.min(max, Math.max(MIN_LOOP_CUTOFF, hz));
}

/** Smoothed listener velocity estimate from per-frame camera positions. @internal */
export interface ListenerVelocityTrack {
  last: { x: number; y: number; z: number } | null;
  velocity: { x: number; y: number; z: number };
}

/** @internal */
export function createListenerVelocityTrack(): ListenerVelocityTrack {
  return { last: null, velocity: { x: 0, y: 0, z: 0 } };
}

/** Camera jumps faster than this (world units/s) are cuts or teleports, not motion, and reset the estimate. */
const MAX_LISTENER_SPEED = 400;

/**
 * Advance the listener velocity estimate by one frame: the position delta over `dt`, eased with a
 * ~50 ms time constant so frame-time jitter does not warble doppler. A cut resets it to zero.
 * @internal
 */
export function stepListenerVelocity(
  track: ListenerVelocityTrack,
  position: { x: number; y: number; z: number },
  dt: number,
): { x: number; y: number; z: number } {
  const last = track.last;
  track.last = { x: position.x, y: position.y, z: position.z };
  if (last === null || !(dt > 0)) return track.velocity;
  const vx = (position.x - last.x) / dt;
  const vy = (position.y - last.y) / dt;
  const vz = (position.z - last.z) / dt;
  if (Math.hypot(vx, vy, vz) > MAX_LISTENER_SPEED) {
    track.velocity = { x: 0, y: 0, z: 0 };
    return track.velocity;
  }
  const blend = 1 - Math.exp(-dt / 0.05);
  const v = track.velocity;
  track.velocity = { x: v.x + (vx - v.x) * blend, y: v.y + (vy - v.y) * blend, z: v.z + (vz - v.z) * blend };
  return track.velocity;
}
