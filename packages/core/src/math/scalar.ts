export { lerp, clamp01, smoothstep } from "../anim/easing";

/** Constrain a value to the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Fraction of the way `value` sits between `from` and `to`; inverse of `lerp`. Returns 0 when the span is empty. */
export function inverseLerp(from: number, to: number, value: number): number {
  return from === to ? 0 : (value - from) / (to - from);
}

/** Map `value` from the `[inMin, inMax]` range onto `[outMin, outMax]`, optionally clamped to the output range. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  clamped = false,
): number {
  const t = inMin === inMax ? 0 : (value - inMin) / (inMax - inMin);
  const mapped = outMin + (outMax - outMin) * t;
  if (!clamped) return mapped;
  const lo = Math.min(outMin, outMax);
  const hi = Math.max(outMin, outMax);
  return mapped < lo ? lo : mapped > hi ? hi : mapped;
}

/** Euclidean modulo that always returns a non-negative result in `[0, modulus)`, unlike the `%` operator. */
export function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Step `current` toward `target` by at most `maxDelta`, without overshooting. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** Wrap `value` into the half-open range `[min, max)`, cycling past either edge. */
export function wrap(value: number, min: number, max: number): number {
  const span = max - min;
  return span <= 0 ? min : min + mod(value - min, span);
}
