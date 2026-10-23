/** A world-space volume whose sound bed plays while the listener is inside it. */
export type AmbienceZoneShape =
  | { kind: "sphere"; center: readonly [number, number, number]; radius: number }
  | { kind: "box"; min: readonly [number, number, number]; max: readonly [number, number, number] };

/** One ambience zone: a sound bed keyed to a volume of the scene.
 * @capability ambience-zones a scene declares looping sound beds keyed to world volumes; walking between them crossfades bed levels on the existing buses instead of cutting.
 */
export interface AmbienceZoneDef {
  /** Stable id; the shell retains one looping bed per zone for the engine's lifetime. */
  id: string;
  /** Sound id in the playable's `audio.sounds` catalog. The shell loops it regardless of the sound's `loop` flag. */
  sound: string;
  shape: AmbienceZoneShape;
  /**
   * World units over which the bed fades across the boundary, measured on both sides. Default 4.
   * Two zones that share a boundary hand over their full level exactly across this band.
   */
  crossfade?: number;
  /** Bed level multiplier, 0..1. Default 1. */
  gain?: number;
}

/** One zone's share of the ambience mix at a listener position, 0..1. */
export interface AmbienceWeight {
  id: string;
  weight: number;
}

const DEFAULT_CROSSFADE = 4;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Distance from a point to a zone boundary, positive inside and negative outside.
 * Spheres measure from the surface; boxes use the nearest face.
 */
export function zoneSignedDistance(shape: AmbienceZoneShape, x: number, y: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -Infinity;
  if (shape.kind === "sphere") {
    if (!(shape.radius > 0)) return -Infinity;
    const dx = x - shape.center[0];
    const dy = y - shape.center[1];
    const dz = z - shape.center[2];
    return shape.radius - Math.hypot(dx, dy, dz);
  }
  const min = shape.min;
  const max = shape.max;
  const values = [x, y, z];
  let outsideSquared = 0;
  let nearestFace = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const lo = min[axis]!;
    const hi = max[axis]!;
    const value = values[axis]!;
    if (value < lo) outsideSquared += (lo - value) * (lo - value);
    else if (value > hi) outsideSquared += (value - hi) * (value - hi);
    else nearestFace = Math.min(nearestFace, value - lo, hi - value);
  }
  if (outsideSquared > 0) return -Math.sqrt(outsideSquared);
  return Number.isFinite(nearestFace) ? nearestFace : 0;
}

/**
 * Every zone's mix weight at a listener position. A zone is at full level `crossfade` units
 * inside its boundary, at half level on the boundary and silent `crossfade` units outside, so a
 * listener walking between two zones that share a boundary hears a constant-sum handover.
 * Weights that would sum above 1 (overlapping zones) are normalized so total bed level never
 * exceeds unity. Writes into `out` when given, so a per-frame caller allocates nothing.
 */
export function ambienceWeights(
  zones: readonly AmbienceZoneDef[],
  x: number,
  y: number,
  z: number,
  out: AmbienceWeight[] = [],
): AmbienceWeight[] {
  out.length = 0;
  let total = 0;
  for (const zone of zones) {
    const crossfade = zone.crossfade ?? DEFAULT_CROSSFADE;
    const signed = zoneSignedDistance(zone.shape, x, y, z);
    if (!Number.isFinite(signed)) continue;
    const weight =
      crossfade > 0 ? clamp01(0.5 + signed / (2 * crossfade)) : signed >= 0 ? 1 : 0;
    if (weight <= 0) continue;
    out.push({ id: zone.id, weight });
    total += weight;
  }
  if (total > 1) {
    for (const entry of out) entry.weight /= total;
  }
  return out;
}

/** The loudest zone in a weight list, or null when every zone is silent. */
export function activeAmbienceZone(weights: readonly AmbienceWeight[]): string | null {
  let best: AmbienceWeight | null = null;
  for (const entry of weights) {
    if (best === null || entry.weight > best.weight) best = entry;
  }
  return best !== null && best.weight > 0.01 ? best.id : null;
}
