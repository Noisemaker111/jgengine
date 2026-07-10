import { normalizeAngleDeg } from "../shared/vec2";

export const ZONE_IDS = ["east", "center", "west"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export const ZONE_LABELS: Record<ZoneId, string> = {
  east: "East Cut",
  center: "Center Channel",
  west: "West Reach",
};

export const ZONE_CENTROID_ANGLE_DEG: Record<ZoneId, number> = {
  east: 0,
  center: 120,
  west: 240,
};

export function zoneAt(x: number, z: number): ZoneId {
  const angleDeg = normalizeAngleDeg((Math.atan2(z, x) * 180) / Math.PI);
  if (angleDeg < 60 || angleDeg >= 300) return "east";
  if (angleDeg < 180) return "center";
  return "west";
}

export function zoneCentroid(id: ZoneId, radius: number): readonly [number, number] {
  const rad = (ZONE_CENTROID_ANGLE_DEG[id] * Math.PI) / 180;
  return [Math.cos(rad) * radius, Math.sin(rad) * radius];
}
