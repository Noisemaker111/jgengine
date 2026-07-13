export type Easing = (t: number) => number;

/** Linearly interpolate from `from` to `to` by fraction `t` (unclamped). */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Constrain `t` to the unit range `[0, 1]`. */
export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Smooth Hermite interpolation of `t` across `[0, 1]`, easing both ends. */
export function smoothstep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

export function easeInQuad(t: number): number {
  const c = clamp01(t);
  return c * c;
}

export function easeOutQuad(t: number): number {
  const c = clamp01(t);
  return 1 - (1 - c) * (1 - c);
}

export function easeInOutQuad(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 2 * c * c : 1 - ((-2 * c + 2) ** 2) / 2;
}

export function easeInCubic(t: number): number {
  const c = clamp01(t);
  return c * c * c;
}

export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - (1 - c) ** 3;
}

export function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - ((-2 * c + 2) ** 3) / 2;
}

const BACK_OVERSHOOT = 1.70158;

export function easeOutBack(t: number): number {
  const c = clamp01(t);
  const s = BACK_OVERSHOOT + 1;
  return 1 + s * (c - 1) ** 3 + BACK_OVERSHOOT * (c - 1) ** 2;
}

const ELASTIC_PERIOD = (2 * Math.PI) / 3;

export function easeOutElastic(t: number): number {
  const c = clamp01(t);
  if (c === 0 || c === 1) return c;
  return 2 ** (-10 * c) * Math.sin((c * 10 - 0.75) * ELASTIC_PERIOD) + 1;
}

export function tween(from: number, to: number, t: number, easing: Easing = smoothstep): number {
  return lerp(from, to, easing(clamp01(t)));
}

export function timedProgress(startedAt: number, now: number, durationMs: number): number {
  if (durationMs <= 0) return now >= startedAt ? 1 : 0;
  return clamp01((now - startedAt) / durationMs);
}
