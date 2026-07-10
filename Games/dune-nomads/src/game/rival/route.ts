import { pathFromNav, type Waypoint } from "@jgengine/core/nav/pathFollow";
import type { TerrainField } from "@jgengine/core/world/terrain";

import type { RivalWaypoint } from "./personalities";

export const RIVAL_BASE_SPEED = 16;

export function buildRivalWaypoints(points: readonly RivalWaypoint[], field: TerrainField): readonly Waypoint[] {
  return pathFromNav(
    points.map((point) => [point.x, point.z] as const),
    field,
    0.4,
  );
}
