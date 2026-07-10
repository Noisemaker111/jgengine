import type { TerrainFlattenMask } from "@jgengine/core/world/features";

export interface Village {
  readonly id: string;
  readonly name: string;
  readonly position: readonly [number, number];
  readonly elevation: number;
  readonly radius: number;
  readonly buildingCount: number;
  readonly maxStories: number;
}

export const VILLAGES: readonly Village[] = [
  { id: "northpoint", name: "Northpoint", position: [60, 40], elevation: -1.0, radius: 10, buildingCount: 4, maxStories: 2 },
  { id: "saltmarsh", name: "Saltmarsh", position: [-55, 50], elevation: 0.4, radius: 10, buildingCount: 4, maxStories: 2 },
  { id: "highstead", name: "Highstead", position: [-50, -55], elevation: 2.2, radius: 9, buildingCount: 4, maxStories: 2 },
  { id: "ridgehome", name: "Ridgehome", position: [0, 0], elevation: 4.5, radius: 12, buildingCount: 6, maxStories: 3 },
];

export const HOME_VILLAGE_ID = "ridgehome";

export function villageById(id: string): Village {
  const found = VILLAGES.find((village) => village.id === id);
  if (found === undefined) throw new Error(`courier-zero: unknown village "${id}"`);
  return found;
}

export function distanceBetweenVillages(aId: string, bId: string): number {
  const a = villageById(aId).position;
  const b = villageById(bId).position;
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export interface RouteWaypoint {
  readonly position: readonly [number, number];
  readonly radius: number;
}

export interface CausewayRoute {
  readonly id: string;
  readonly name: string;
  readonly elevation: number;
  readonly waypoints: readonly RouteWaypoint[];
}

function chain(
  from: readonly [number, number],
  to: readonly [number, number],
  steps: number,
  radius: number,
): RouteWaypoint[] {
  const points: RouteWaypoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push({
      position: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
      radius,
    });
  }
  return points;
}

const NORTHPOINT = villageById("northpoint").position;
const SALTMARSH = villageById("saltmarsh").position;
const HIGHSTEAD = villageById("highstead").position;
const RIDGEHOME = villageById("ridgehome").position;

export const CAUSEWAYS: readonly CausewayRoute[] = [
  { id: "east_causeway", name: "East Causeway", elevation: 0.0, waypoints: chain(RIDGEHOME, NORTHPOINT, 4, 6) },
  { id: "old_ferry_road", name: "Old Ferry Road", elevation: -0.5, waypoints: chain(SALTMARSH, HIGHSTEAD, 4, 6) },
];

export const RIDGE_ROUTE: CausewayRoute = {
  id: "high_ridge",
  name: "High Ridge Route",
  elevation: 3.0,
  waypoints: chain(RIDGEHOME, HIGHSTEAD, 4, 5),
};

export const ALL_ROUTES: readonly CausewayRoute[] = [...CAUSEWAYS, RIDGE_ROUTE];

export function terrainFlattenMasks(): TerrainFlattenMask[] {
  const masks: TerrainFlattenMask[] = VILLAGES.map((village) => ({
    center: village.position,
    radius: village.radius,
    height: village.elevation,
    falloff: 6,
  }));
  for (const route of ALL_ROUTES) {
    for (const waypoint of route.waypoints) {
      masks.push({ center: waypoint.position, radius: waypoint.radius, height: route.elevation, falloff: 4 });
    }
  }
  return masks;
}
