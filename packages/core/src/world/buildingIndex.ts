import { aabbOverlap, expandAabb, pointInAabb, type Aabb, type Vec2 } from "./geometry";
import type { GeneratedBuilding } from "./buildings";

export interface BuildingHit {
  building: GeneratedBuilding;
  distance: number;
}

export interface BuildingIndex {
  readonly buildings: readonly GeneratedBuilding[];
  at(point: Vec2): GeneratedBuilding | undefined;
  within(area: Aabb): GeneratedBuilding[];
  nearest(point: Vec2): BuildingHit | undefined;
  isInside(point: Vec2): boolean;
  blockers(margin?: number): Aabb[];
  readonly bounds: Aabb | undefined;
}

function centerDistance(point: Vec2, center: Vec2): number {
  const dx = point[0] - center[0];
  const dz = point[1] - center[1];
  return Math.sqrt(dx * dx + dz * dz);
}

function unionBounds(buildings: readonly GeneratedBuilding[]): Aabb | undefined {
  if (buildings.length === 0) return undefined;
  let { minX, minZ, maxX, maxZ } = buildings[0]!.bounds;
  for (let index = 1; index < buildings.length; index += 1) {
    const b = buildings[index]!.bounds;
    if (b.minX < minX) minX = b.minX;
    if (b.minZ < minZ) minZ = b.minZ;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxZ > maxZ) maxZ = b.maxZ;
  }
  return { minX, minZ, maxX, maxZ };
}

export function buildingIndex(buildings: readonly GeneratedBuilding[]): BuildingIndex {
  const bounds = unionBounds(buildings);
  function at(point: Vec2): GeneratedBuilding | undefined {
    let best: GeneratedBuilding | undefined;
    let bestDistance = Infinity;
    for (const building of buildings) {
      if (!pointInAabb(point, building.bounds)) continue;
      const distance = centerDistance(point, building.center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }
    return best;
  }
  return {
    buildings,
    bounds,
    at,
    within(area: Aabb): GeneratedBuilding[] {
      return buildings.filter((building) => aabbOverlap(building.bounds, area));
    },
    nearest(point: Vec2): BuildingHit | undefined {
      let best: BuildingHit | undefined;
      for (const building of buildings) {
        const distance = centerDistance(point, building.center);
        if (best === undefined || distance < best.distance) best = { building, distance };
      }
      return best;
    },
    isInside(point: Vec2): boolean {
      return at(point) !== undefined;
    },
    blockers(margin = 0): Aabb[] {
      return buildings.map((building) =>
        margin === 0 ? building.bounds : expandAabb(building.bounds, margin),
      );
    },
  };
}
