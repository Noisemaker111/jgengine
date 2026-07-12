import type { RoadEnvironmentDescriptor } from "./features";
import { pathLength, type RoadPoint } from "./roads";

function normalAt(path: readonly RoadPoint[], index: number): readonly [number, number] {
  const prev = path[Math.max(0, index - 1)]!;
  const next = path[Math.min(path.length - 1, index + 1)]!;
  const dx = next[0] - prev[0];
  const dz = next[1] - prev[1];
  const length = Math.hypot(dx, dz) || 1;
  return [-dz / length, dx / length];
}

/**
 * Offset a centerline sideways by a signed distance along its local perpendicular — the
 * building block for lanes, curb lines, and sidewalk paths. Positive offsets fall on the
 * left of the direction of travel, negative on the right.
 */
export function offsetPath(path: readonly RoadPoint[], offset: number): readonly RoadPoint[] {
  return path.map((point, index) => {
    const [nx, nz] = normalAt(path, index);
    return [point[0] + nx * offset, point[1] + nz * offset] as const;
  });
}

/** A directed lane derived from a road: an offset centerline plus its direction of travel. */
export interface StreetLane {
  /** Lane centerline, ordered in the direction of travel. */
  path: readonly RoadPoint[];
  /** "forward" runs with the road's declared path order; "reverse" runs against it. */
  direction: "forward" | "reverse";
}

/**
 * Two right-hand-traffic lane centerlines for a road — each offset a quarter of the drivable
 * width from the center and ordered in its direction of travel. Feed a lane's `path` straight
 * into `nav/pathFollow` for traffic AI, or use its endpoints as directed car spawn points.
 */
export function laneCenters(road: RoadEnvironmentDescriptor): readonly [StreetLane, StreetLane] {
  const laneOffset = road.width / 4;
  const forward = offsetPath(road.path, -laneOffset);
  const reverse = offsetPath(road.path, laneOffset);
  return [
    { path: forward, direction: "forward" },
    { path: [...reverse].reverse(), direction: "reverse" },
  ];
}

/** Resolved sidewalk band widths for a road; zero when the road declares no sidewalk. */
export function sidewalkWidthOf(road: RoadEnvironmentDescriptor): number {
  return road.sidewalk === false ? 0 : road.sidewalk.width;
}

/**
 * The two sidewalk walking paths of a road — offset polylines running down the middle of each
 * sidewalk band. Pedestrians spawn and route along these instead of the asphalt.
 */
export function sidewalkPaths(road: RoadEnvironmentDescriptor): readonly (readonly RoadPoint[])[] {
  const width = sidewalkWidthOf(road);
  if (width <= 0) return [];
  const offset = road.width / 2 + width / 2;
  return [offsetPath(road.path, offset), offsetPath(road.path, -offset)];
}

/** A placement anchor on the curb line: position, outward-facing heading, and which side it sits on. */
export interface FurnitureSpot {
  position: RoadPoint;
  /** Yaw (radians, engine `rotationY` convention) facing away from the road. */
  heading: number;
  side: "left" | "right";
  /** Arc-length distance along the road at this spot. */
  along: number;
}

/** Options for {@link furnitureSpots}. */
export interface FurnitureSpotOptions {
  /** Distance between consecutive spots along the road. Default 24. */
  spacing?: number;
  /** Which curb lines to populate. Default "both". */
  sides?: "both" | "left" | "right";
  /** Alternate sides spot-by-spot instead of mirroring every spot. Default true. */
  stagger?: boolean;
  /** Extra outward shift past the curb line (e.g. to center furniture in the sidewalk). Default 0. */
  outset?: number;
}

function pointAlong(path: readonly RoadPoint[], along: number): { point: RoadPoint; tangent: readonly [number, number] } {
  let remaining = along;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const segLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= segLength || i === path.length - 2) {
      const t = segLength <= 0 ? 0 : Math.min(1, remaining / segLength);
      const length = segLength || 1;
      return {
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        tangent: [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
      };
    }
    remaining -= segLength;
  }
  const first = path[0] ?? ([0, 0] as const);
  return { point: first, tangent: [0, 1] };
}

/**
 * Evenly spaced street-furniture anchors along a road's curb lines — streetlights, palms, signs,
 * hydrants, benches. Each spot sits just outside the asphalt (plus `outset`), faces away from
 * the street, and alternates sides by default so lights stagger like a real avenue. This is the
 * answer to "where do I put it": furniture is an asset of the street, never a hand-typed coordinate.
 */
export function furnitureSpots(
  road: RoadEnvironmentDescriptor,
  options: FurnitureSpotOptions = {},
): readonly FurnitureSpot[] {
  const spacing = options.spacing ?? 24;
  const sides = options.sides ?? "both";
  const stagger = options.stagger ?? true;
  const outset = options.outset ?? 0;
  if (spacing <= 0) return [];
  const total = pathLength(road.path);
  const curbOffset = road.width / 2 + 0.6 + outset;
  const spots: FurnitureSpot[] = [];
  let index = 0;
  for (let along = spacing / 2; along < total; along += spacing) {
    const { point, tangent } = pointAlong(road.path, along);
    const normal: readonly [number, number] = [-tangent[1], tangent[0]];
    const wanted: readonly ("left" | "right")[] =
      sides === "both" ? (stagger ? [index % 2 === 0 ? "left" : "right"] : ["left", "right"]) : [sides];
    for (const side of wanted) {
      const sign = side === "left" ? 1 : -1;
      const position: RoadPoint = [point[0] + normal[0] * curbOffset * sign, point[1] + normal[1] * curbOffset * sign];
      spots.push({
        position,
        heading: Math.atan2(normal[0] * sign, normal[1] * sign),
        side,
        along,
      });
    }
    index += 1;
  }
  return spots;
}

/** Options for {@link parkingSpots}. */
export interface ParkingSpotOptions {
  /** Distance between consecutive parked-car anchors. Default 18. */
  spacing?: number;
  /** Which side(s) of the street to line with parking. Default "both". */
  sides?: "both" | "left" | "right";
}

/** A curbside parking anchor: position at the road edge and a heading parallel to the street. */
export interface ParkingSpot {
  position: RoadPoint;
  /** Yaw (radians) aligned with the direction of travel on that side (right-hand traffic). */
  heading: number;
  side: "left" | "right";
}

/**
 * Curbside parking anchors along a road: hugging the edge of the asphalt, headed parallel to the
 * street in that side's direction of travel. Spawn parked vehicles here instead of eyeballing
 * coordinates in the middle of the carriageway.
 */
export function parkingSpots(
  road: RoadEnvironmentDescriptor,
  options: ParkingSpotOptions = {},
): readonly ParkingSpot[] {
  const spacing = options.spacing ?? 18;
  const sides = options.sides ?? "both";
  if (spacing <= 0) return [];
  const total = pathLength(road.path);
  const edgeOffset = road.width / 2 - 1.2;
  const spots: ParkingSpot[] = [];
  for (let along = spacing; along < total - spacing / 2; along += spacing) {
    const { point, tangent } = pointAlong(road.path, along);
    const normal: readonly [number, number] = [-tangent[1], tangent[0]];
    const wanted: readonly ("left" | "right")[] = sides === "both" ? ["left", "right"] : [sides];
    for (const side of wanted) {
      const sign = side === "left" ? 1 : -1;
      const dir = side === "left" ? 1 : -1;
      spots.push({
        position: [point[0] + normal[0] * edgeOffset * sign, point[1] + normal[1] * edgeOffset * sign],
        heading: Math.atan2(tangent[0] * dir, tangent[1] * dir),
        side,
      });
    }
  }
  return spots;
}

/**
 * A deterministic point on one of a road's sidewalks at a normalized position — `side` picks the
 * band, `fraction` (0..1) picks how far along. The canonical pedestrian spawn helper.
 */
export function sidewalkPoint(
  road: RoadEnvironmentDescriptor,
  side: "left" | "right",
  fraction: number,
): RoadPoint | null {
  const paths = sidewalkPaths(road);
  const path = side === "left" ? paths[0] : paths[1];
  if (path === undefined) return null;
  const along = Math.max(0, Math.min(1, fraction)) * pathLength(path);
  return pointAlong(path, along).point;
}
