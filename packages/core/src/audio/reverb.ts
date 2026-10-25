/**
 * How a space rings. `outdoor` is a short, faint tail; `room` a tight one; `hall` long and wide;
 * `cave` long, dark and wet. `none` is dry.
 */
export type ReverbPreset = "none" | "outdoor" | "room" | "hall" | "cave";

/** A world region that rings a set way while the listener is inside it. */
export type ReverbZoneDef =
  | { id: string; preset: ReverbPreset; center: readonly [number, number, number]; radius: number }
  | { id: string; preset: ReverbPreset; min: readonly [number, number, number]; max: readonly [number, number, number] };

/**
 * World reverb for positioned sounds. Authored zones win; outside them the shell listens for walls
 * and a ceiling around the listener (`auto`, default on) and picks `room`, `hall` or `outdoor`.
 */
export interface AudioReverbConfig {
  zones?: readonly ReverbZoneDef[];
  /** Pick a preset from the geometry around the listener when no zone holds it. Default true. */
  auto?: boolean;
  /** Preset outside every zone when `auto` is off or finds nothing. Default "outdoor". */
  fallback?: ReverbPreset;
}

/** The zone holding a point, or null. Spheres and boxes; the first listed wins where they overlap. */
export function reverbZoneAt(zones: readonly ReverbZoneDef[], x: number, y: number, z: number): ReverbZoneDef | null {
  for (const zone of zones) {
    if ("radius" in zone) {
      const dx = x - zone.center[0];
      const dy = y - zone.center[1];
      const dz = z - zone.center[2];
      if (dx * dx + dy * dy + dz * dz <= zone.radius * zone.radius) return zone;
    } else if (x >= zone.min[0] && x <= zone.max[0] && y >= zone.min[1] && y <= zone.max[1] && z >= zone.min[2] && z <= zone.max[2]) {
      return zone;
    }
  }
  return null;
}

/** What the listener's surroundings look like: the ceiling height and how far each wall ray ran. */
export interface EnclosureSample {
  /** Distance to the first surface straight up, or null for open sky. */
  ceiling: number | null;
  /** Distance along each horizontal ray to a wall, null where the ray ran out. */
  walls: readonly (number | null)[];
}

/**
 * Pick a preset from the space around the listener. A roof with walls on most sides is a room, or a
 * hall when they are far; a roof alone (an awning, an overpass) is a room; open sky is outdoor.
 */
export function enclosurePreset(sample: EnclosureSample): ReverbPreset {
  if (sample.ceiling === null) return "outdoor";
  const hits = sample.walls.filter((distance): distance is number => distance !== null);
  if (hits.length * 2 < sample.walls.length) return sample.ceiling < 6 ? "room" : "outdoor";
  const mean = hits.reduce((sum, distance) => sum + distance, 0) / hits.length;
  return mean > 9 || sample.ceiling > 9 ? "hall" : "room";
}
