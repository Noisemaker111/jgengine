// @skill jgengine-world
export { lerp, clamp01, smoothstep } from "../anim/easing";

/** @internal */
export function length2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/**
 * Length of the vector (x, y, z) as `sqrt(x*x + y*y + z*z)`: {@link length2} in three dimensions. V8's
 * `Math.hypot` also copies its arguments into a fresh array on every call, garbage a per-agent loop
 * makes thousands of times a second.
 * @internal
 */
export function length3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** Constrain a value to the inclusive `[min, max]` range.
 * @internal
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** @internal */
export function inverseLerp(from: number, to: number, value: number): number {
  return from === to ? 0 : (value - from) / (to - from);
}

/** Map `value` from the `[inMin, inMax]` range onto `[outMin, outMax]`, optionally clamped to the output range.
 * @internal
 */
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

/** @internal */
export function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** @internal */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** @internal */
export function wrap(value: number, min: number, max: number): number {
  const span = max - min;
  return span <= 0 ? min : min + mod(value - min, span);
}
