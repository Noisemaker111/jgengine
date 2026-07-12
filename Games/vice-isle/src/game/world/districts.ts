export const WORLD_W = 640;
export const WORLD_D = 640;
export const SHORE_X = -210;

export interface District {
  id: string;
  label: string;
  center: readonly [number, number];
  radius: number;
}

export const DISTRICTS: readonly District[] = [
  { id: "ocean_drive", label: "Ocean Drive", center: [-170, 0], radius: 110 },
  { id: "downtown", label: "Downtown Vice", center: [40, -60], radius: 120 },
  { id: "port_carmine", label: "Port Carmine", center: [130, 190], radius: 100 },
  { id: "palm_heights", label: "Palm Heights", center: [70, -240], radius: 90 },
];

export interface RoadSegment {
  from: readonly [number, number];
  to: readonly [number, number];
}

export const ROADS: readonly RoadSegment[] = [
  { from: [-180, -280], to: [-180, 280] },
  { from: [-60, -280], to: [-60, 280] },
  { from: [60, -280], to: [60, 280] },
  { from: [180, -280], to: [180, 280] },
  { from: [-180, -240], to: [180, -240] },
  { from: [-180, -120], to: [180, -120] },
  { from: [-180, 0], to: [180, 0] },
  { from: [-180, 120], to: [180, 120] },
  { from: [-180, 240], to: [180, 240] },
];

export const TRAFFIC_LOOPS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [-180, -120],
    [60, -120],
    [60, 120],
    [-180, 120],
  ],
  [
    [-60, 0],
    [180, 0],
    [180, 240],
    [-60, 240],
  ],
  [
    [-180, -240],
    [180, -240],
    [180, 0],
    [-180, 0],
  ],
];

export function districtAt(x: number, z: number): District | null {
  let best: District | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const d of DISTRICTS) {
    const dist = Math.hypot(x - d.center[0], z - d.center[1]);
    if (dist < d.radius && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

export function roadPoints(spacing: number): readonly (readonly [number, number])[] {
  const points: (readonly [number, number])[] = [];
  for (const seg of ROADS) {
    const dx = seg.to[0] - seg.from[0];
    const dz = seg.to[1] - seg.from[1];
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.round(length / spacing));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      points.push([seg.from[0] + dx * t, seg.from[1] + dz * t]);
    }
  }
  return points;
}

export const PLAYER_SPAWN: readonly [number, number, number] = [-176, 0, 24];
export const MARCO_POS: readonly [number, number, number] = [52, 0, -52];
export const GUNSHOP_POS: readonly [number, number, number] = [-52, 0, 8];
export const GARAGE_POS: readonly [number, number, number] = [-68, 0, 116];
export const DOCK_FIGHT_CENTER: readonly [number, number, number] = [130, 0, 196];
export const BRIEFCASE_POS: readonly [number, number, number] = [142, 0, 208];
