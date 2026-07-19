/** Inputs to {@link pingOpacity}. */
export interface PingOpacityInput {
  /** Performance-clock ms when the ping first appeared. */
  bornMs: number;
  /** Current performance-clock ms. */
  nowMs: number;
  /** Fade-in duration in ms. Default 220. */
  fadeInMs?: number;
  /** Wall-clock ms remaining until the ping expires; omit for a non-expiring ping. */
  remainingMs?: number;
  /** Fade-out window (ms) before expiry. Default 600. */
  fadeOutMs?: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Alpha for a world ping in `[0, 1]`: ramps up over `fadeInMs` after it appears
 * and ramps back down over `fadeOutMs` before it expires. Pure math so the
 * lifecycle can be unit-tested without an R3F canvas.
 */
export function pingOpacity(input: PingOpacityInput): number {
  const fadeIn = clamp01((input.nowMs - input.bornMs) / (input.fadeInMs ?? 220));
  const fadeOut = input.remainingMs === undefined ? 1 : clamp01(input.remainingMs / (input.fadeOutMs ?? 600));
  return Math.min(fadeIn, fadeOut);
}

/** Vertical bob offset (world units) for a hovering ping arrow at `elapsedSeconds`. */
export function pingBobOffset(elapsedSeconds: number, amplitude = 0.18, speedHz = 1.1): number {
  return Math.sin(elapsedSeconds * speedHz * Math.PI * 2) * amplitude;
}
