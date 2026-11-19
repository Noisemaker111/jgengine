export type ReverbPreset = "none" | "outdoor" | "room" | "hall" | "cave";

export type ReverbZoneDef =
  | { id: string; preset: ReverbPreset; center: readonly [number, number, number]; radius: number }
  | { id: string; preset: ReverbPreset; min: readonly [number, number, number]; max: readonly [number, number, number] };

export interface AudioReverbConfig {
  zones?: readonly ReverbZoneDef[];
  auto?: boolean;
  fallback?: ReverbPreset;
}

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

export interface EnclosureSample {
  ceiling: number | null;
  walls: readonly (number | null)[];
}

export function enclosurePreset(sample: EnclosureSample): ReverbPreset {
  if (sample.ceiling === null) return "outdoor";
  const hits = sample.walls.filter((distance): distance is number => distance !== null);
  if (hits.length * 2 < sample.walls.length) return sample.ceiling < 6 ? "room" : "outdoor";
  const mean = hits.reduce((sum, distance) => sum + distance, 0) / hits.length;
  return mean > 9 || sample.ceiling > 9 ? "hall" : "room";
}
