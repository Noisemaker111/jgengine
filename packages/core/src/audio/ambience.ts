import { clamp01 } from "../math/scalar";
import { clampLoopGain } from "./loopParams";

/**
 * A world-space volume whose sound bed plays while the listener is inside it. `elsewhere` has no
 * volume: it fills whatever share of its layer the other zones leave, so a bed plays on the open
 * ground between authored volumes and hands over to them across their crossfade.
 */
export type AmbienceZoneShape =
  | { kind: "sphere"; center: readonly [number, number, number]; radius: number }
  | { kind: "box"; min: readonly [number, number, number]; max: readonly [number, number, number] }
  | { kind: "elsewhere" };

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
  /** Bed level multiplier, 0..1. Default 1. A game scales it live with `ctx.game.audio.zoneLevel`. */
  gain?: number;
  /**
   * Mix layer. Zones in one layer share the mix: their weights normalize together and an
   * `elsewhere` zone fills that layer's remainder. Beds in different layers (wind under distant
   * machinery) mix independently. Default `""`.
   */
  layer?: string;
}

/** One zone's share of the ambience mix at a listener position, 0..1. */
export interface AmbienceWeight {
  id: string;
  weight: number;
}

const DEFAULT_CROSSFADE = 4;

/**
 * Distance from a point to a zone boundary, positive inside and negative outside.
 * Spheres measure from the surface; boxes use the nearest face; `elsewhere` is everywhere.
 */
export function zoneSignedDistance(shape: AmbienceZoneShape, x: number, y: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -Infinity;
  if (shape.kind === "elsewhere") return Infinity;
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

const layerOf = (zone: AmbienceZoneDef): string => zone.layer ?? "";

/**
 * Every zone's mix weight at a listener position. A zone is at full level `crossfade` units
 * inside its boundary, at half level on the boundary and silent `crossfade` units outside, so a
 * listener walking between two zones that share a boundary hears a constant-sum handover.
 * Within one {@link AmbienceZoneDef.layer}, weights that would sum above 1 (overlapping zones)
 * are normalized so that layer never exceeds unity, and the layer's `elsewhere` zone takes the
 * share the rest leave. Writes into `out` when given, so a per-frame caller reuses the list.
 */
export function ambienceWeights(
  zones: readonly AmbienceZoneDef[],
  x: number,
  y: number,
  z: number,
  out: AmbienceWeight[] = [],
): AmbienceWeight[] {
  out.length = 0;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return out;
  for (let index = 0; index < zones.length; index += 1) {
    const layer = layerOf(zones[index]!);
    // The first zone of each layer resolves that whole layer.
    let first = true;
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (layerOf(zones[earlier]!) === layer) { first = false; break; }
    }
    if (!first) continue;
    const start = out.length;
    let total = 0;
    let fill: AmbienceZoneDef | null = null;
    for (let member = index; member < zones.length; member += 1) {
      const zone = zones[member]!;
      if (layerOf(zone) !== layer) continue;
      if (zone.shape.kind === "elsewhere") {
        fill ??= zone;
        continue;
      }
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
      for (let entry = start; entry < out.length; entry += 1) out[entry]!.weight /= total;
    } else if (fill !== null && total < 1) {
      out.push({ id: fill.id, weight: 1 - total });
    }
  }
  return out;
}

/**
 * A zone bed's level: its mix `weight`, the authored `zone.gain` and the game's live multiplier
 * `live` (clamped to `0..1`; a non-finite value is silence). The engine ramps the bed toward it.
 *
 * @capability ambience-live-level a game drives a zone bed's loudness from world state (gusts, a storm, a reactor spooling) while the bed keeps its positional crossfade.
 */
export function ambienceBedLevel(zone: AmbienceZoneDef, weight: number, live = 1): number {
  return weight * (zone.gain ?? 1) * clampLoopGain(live);
}

/** The loudest zone in a weight list, or null when every zone is silent. */
export function activeAmbienceZone(weights: readonly AmbienceWeight[]): string | null {
  let best: AmbienceWeight | null = null;
  for (const entry of weights) {
    if (best === null || entry.weight > best.weight) best = entry;
  }
  return best !== null && best.weight > 0.01 ? best.id : null;
}
