/** How a radial impulse fades from the blast center to its edge. */
export type RadialFalloff = "linear" | "quadratic" | "none";

/** A radial push: the impulse vector plus the 0..1 falloff sampled at the target. */
export interface RadialImpulse {
  /** Impulse along the first axis (direction × magnitude). */
  x: number;
  /** Impulse along the second axis (direction × magnitude). */
  y: number;
  /** Impulse magnitude = `power` × `falloff`. */
  magnitude: number;
  /** Falloff weight at the target, 1 at the center down to 0 at the radius. */
  falloff: number;
}

/** Options for {@link radialImpulse}. */
export interface RadialImpulseOptions {
  /** Falloff shape. Defaults to `"linear"` (`1 − d/r`). */
  falloff?: RadialFalloff;
}

function falloffAt(distance: number, radius: number, shape: RadialFalloff): number {
  const linear = 1 - distance / radius;
  if (shape === "none") return 1;
  if (shape === "quadratic") return linear * linear;
  return linear;
}

/**
 * Point-source radial impulse pushing a `target` away from a blast `source`: full `power` at the center
 * fading to zero at `radius`. Returns `null` when the target sits at or beyond the radius (unaffected),
 * so callers can early-out. At the exact center the direction is zero. This is the explosion/knockback/
 * shockwave push — every arena game hand-rolled the distance, falloff, and normalize.
 */
export function radialImpulse(
  source: readonly [number, number],
  target: readonly [number, number],
  radius: number,
  power: number,
  options: RadialImpulseOptions = {},
): RadialImpulse | null {
  if (radius <= 0) return null;
  const dx = target[0] - source[0];
  const dy = target[1] - source[1];
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return null;
  const falloff = falloffAt(distance, radius, options.falloff ?? "linear");
  const magnitude = power * falloff;
  const invLen = distance > 1e-6 ? 1 / distance : 0;
  return { x: dx * invLen * magnitude, y: dy * invLen * magnitude, magnitude, falloff };
}
