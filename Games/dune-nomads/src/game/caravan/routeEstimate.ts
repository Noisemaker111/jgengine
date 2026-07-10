import type { TerrainField } from "@jgengine/core/world/terrain";
import type { WindVector } from "@jgengine/core/world/wind";

import { computePaceMultiplier, slopeAlongHeading } from "./pace";
import { computeWaterDrainRate, headwindSeverity } from "./water";

export interface RoutePoint {
  x: number;
  z: number;
}

export interface RouteSegmentEstimate {
  distance: number;
  seconds: number;
  water: number;
}

export interface RouteEstimate {
  segments: readonly RouteSegmentEstimate[];
  totalDistance: number;
  totalSeconds: number;
  totalWater: number;
}

export function estimateRouteWaterCost(
  points: readonly RoutePoint[],
  field: TerrainField,
  windVector: WindVector,
  baseSpeed: number,
): RouteEstimate {
  const segments: RouteSegmentEstimate[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance === 0) {
      segments.push({ distance: 0, seconds: 0, water: 0 });
      continue;
    }
    const heading = Math.atan2(dx, dz);
    const midX = (from.x + to.x) / 2;
    const midZ = (from.z + to.z) / 2;
    const slope = slopeAlongHeading(field, midX, midZ, heading);
    const pace = computePaceMultiplier({ slope, windVector, headingRad: heading });
    const speed = Math.max(0.01, baseSpeed * pace.multiplier);
    const seconds = distance / speed;
    const water = computeWaterDrainRate({ speed, headwind: headwindSeverity(pace.windAlignment) }) * seconds;
    segments.push({ distance, seconds, water });
  }
  const totalDistance = segments.reduce((sum, segment) => sum + segment.distance, 0);
  const totalSeconds = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  const totalWater = segments.reduce((sum, segment) => sum + segment.water, 0);
  return { segments, totalDistance, totalSeconds, totalWater };
}
