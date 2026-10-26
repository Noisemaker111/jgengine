import type { RoadEnvironmentDescriptor } from "../world/features";
import { offsetPath, polylineLength, type RoadPoint } from "./roads";

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
  const total = polylineLength(road.path);
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
  const total = polylineLength(road.path);
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
 * Signed planar distance from `(x, z)` to the nearest road *surface edge* across every segment of
 * every road (#1051): negative inside the asphalt (magnitude = how far in from the closest edge, so
 * `-width/2` on the centerline), `~0` right at the curb, and positive off the road (the gap to the
 * nearest edge). Point-to-segment distance minus the road's half width, minimised over all segments —
 * the "am I on the road, and by how much" seam driving grip, tyre audio, and off-road penalties.
 *
 * Allocation-free per call (only scalars — no arrays or objects) so a per-tick car sim can sample it
 * on the hot path; degenerate roads (fewer than two path points) contribute nothing, and with no road
 * surface at all it returns {@link Number.POSITIVE_INFINITY} (everywhere is off-road).
 */
export function distanceToRoadEdge(
  roads: readonly RoadEnvironmentDescriptor[],
  x: number,
  z: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (let r = 0; r < roads.length; r += 1) {
    const road = roads[r]!;
    const path = road.path;
    if (path.length < 2) continue;
    const half = road.width / 2;
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      const abx = b[0] - a[0];
      const abz = b[1] - a[1];
      const lengthSq = abx * abx + abz * abz;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / lengthSq));
      const px = a[0] + abx * t;
      const pz = a[1] + abz * t;
      const edge = Math.hypot(x - px, z - pz) - half;
      if (edge < best) best = edge;
    }
  }
  return best;
}

/** Grip levels and blend width for {@link roadSurfaceSampler}; each field is optional and defaulted. */
export interface RoadSurfaceOptions {
  /** Grip multiplier on the asphalt. Default 1. */
  onRoad?: number;
  /** Grip multiplier once fully off the road past the shoulder. Default 0.72. */
  offRoad?: number;
  /** Width (world units) of the blend band outside the curb from full to off-road grip. Default 3. */
  shoulder?: number;
}

/**
 * A `surfaceFriction`-compatible sampler (the `(x, z) => grip` hook a kinematic car reads each tick)
 * that turns road geometry into grip (#1051): full `onRoad` grip on the asphalt, a monotonic linear ramp
 * down across a `shoulder`-wide band at the curb, and flat `offRoad` grip beyond it — so a car that
 * clips onto the grass loses bite progressively instead of snapping. Closes over {@link
 * distanceToRoadEdge}, so the returned sampler is itself allocation-free per call.
 */
export function roadSurfaceSampler(
  roads: readonly RoadEnvironmentDescriptor[],
  options: RoadSurfaceOptions = {},
): (x: number, z: number) => number {
  const onRoad = options.onRoad ?? 1;
  const offRoad = options.offRoad ?? 0.72;
  const shoulder = options.shoulder ?? 3;
  return (x, z) => {
    const edge = distanceToRoadEdge(roads, x, z);
    if (edge <= 0) return onRoad;
    if (shoulder <= 0 || edge >= shoulder) return offRoad;
    return onRoad + (offRoad - onRoad) * (edge / shoulder);
  };
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
  const along = Math.max(0, Math.min(1, fraction)) * polylineLength(path);
  return pointAlong(path, along).point;
}

// ---------------------------------------------------------------------------
// Road junctions: where authored roads cross. The welded surfaces and their paint are
// built from these by `buildTrimmedIntersections` / `buildIntersectionMarkings` in `roads.ts`.
// ---------------------------------------------------------------------------

/** A single arm of a junction: the road width plus the outward direction the road leaves the center. */
export interface RoadApproach {
  /** Unit vector pointing from the junction center outward along the road arm. */
  direction: readonly [number, number];
  /** Drivable width of the road on this arm. */
  width: number;
}

/** A welded road intersection: a patch center/radius plus the arms that feed it. */
export interface RoadJunction {
  /** World XZ center of the intersection. */
  center: RoadPoint;
  /** Radius of the covering patch (covers the crossing ribbons). */
  radius: number;
  /** Representative surface elevation (max of the participating roads). */
  elevation: number;
  /** Representative asphalt color (the widest participating road's color). */
  color: string;
  /** Outward arms leaving the junction — one per road direction that continues past the center. */
  approaches: readonly RoadApproach[];
}

/** Options for {@link findRoadJunctions}. */
export interface RoadJunctionOptions {
  /** Roads weld only when their elevations differ by at most this much. Default 0.12. */
  elevationBand?: number;
  /** Crossing points closer than this merge into a single junction. Default 6. */
  mergeDistance?: number;
  /** Hard cap on junctions returned so detection stays bounded. Default 256. */
  maxJunctions?: number;
  /** Extra scale on the patch radius past the widest arm's half-width. Default 1.15. */
  radiusScale?: number;
}

interface JunctionArm {
  roadIndex: number;
  direction: readonly [number, number];
  width: number;
}

interface JunctionCandidate {
  x: number;
  z: number;
  radius: number;
  elevation: number;
  color: string;
  colorWidth: number;
  arms: JunctionArm[];
}

const EPS = 1e-6;

/** Intersection point of segments a→b and c→d, or null when they don't cross (endpoints included). */
function segmentIntersection(
  a: RoadPoint,
  b: RoadPoint,
  c: RoadPoint,
  d: RoadPoint,
): RoadPoint | null {
  const r0 = b[0] - a[0];
  const r1 = b[1] - a[1];
  const s0 = d[0] - c[0];
  const s1 = d[1] - c[1];
  const denom = r0 * s1 - r1 * s0;
  if (Math.abs(denom) < EPS) return null; // parallel or degenerate
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / denom;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return [a[0] + r0 * t, a[1] + r1 * t];
}

function unit(dx: number, dz: number): readonly [number, number] {
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len];
}

/**
 * Add the arms a road contributes at junction point `p`: the road continues past `p` in each
 * direction that still has centerline beyond it, so a mid-path crossing yields two opposing arms
 * and a road that terminates at `p` (a T-junction) yields only the one inward arm.
 */
function armsAt(path: readonly RoadPoint[], p: RoadPoint, width: number, roadIndex: number): JunctionArm[] {
  const arms: JunctionArm[] = [];
  // Nearest vertex "before" (toward path start) and "after" (toward path end) of p.
  // Walk the path measuring where p falls; use the two adjacent tangents.
  let hitSeg = -1;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const lengthSq = abx * abx + abz * abz;
    const t = lengthSq === 0 ? 0 : ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / lengthSq;
    const px = a[0] + abx * Math.max(0, Math.min(1, t));
    const pz = a[1] + abz * Math.max(0, Math.min(1, t));
    if (Math.hypot(p[0] - px, p[1] - pz) < 1e-3) {
      hitSeg = i;
      break;
    }
  }
  if (hitSeg < 0) return arms;
  const a = path[hitSeg]!;
  const b = path[hitSeg + 1]!;
  const forward = unit(b[0] - a[0], b[1] - a[1]);
  const atStart = Math.hypot(p[0] - path[0]![0], p[1] - path[0]![1]) < 1e-3;
  const atEnd = Math.hypot(p[0] - path[path.length - 1]![0], p[1] - path[path.length - 1]![1]) < 1e-3;
  // Arm toward path end exists unless p sits exactly at the end.
  if (!atEnd) arms.push({ roadIndex, direction: forward, width });
  // Arm toward path start exists unless p sits exactly at the start.
  if (!atStart) arms.push({ roadIndex, direction: [-forward[0], -forward[1]], width });
  return arms;
}

function mergeArm(arms: JunctionArm[], arm: JunctionArm): void {
  for (const existing of arms) {
    if (existing.roadIndex === arm.roadIndex) {
      const dot = existing.direction[0] * arm.direction[0] + existing.direction[1] * arm.direction[1];
      if (dot > 0.985) return; // same road, near-identical direction — already have this arm
    }
  }
  arms.push(arm);
}

/**
 * Detect welded intersections across a set of roads: wherever two road centerlines cross (or a road
 * terminates on another) within the same elevation band, emit a {@link RoadJunction} whose patch
 * covers the crossing ribbons. Nearby crossings merge into one junction. Deterministic and bounded —
 * O(roads² · segments²) with a `maxJunctions` cap — so a scene builds its intersections once.
 */
export function findRoadJunctions(
  roads: readonly RoadEnvironmentDescriptor[],
  options: RoadJunctionOptions = {},
): readonly RoadJunction[] {
  const elevationBand = options.elevationBand ?? 0.12;
  const mergeDistance = options.mergeDistance ?? 6;
  const maxJunctions = options.maxJunctions ?? 256;
  const radiusScale = options.radiusScale ?? 1.15;
  const mergeSq = mergeDistance * mergeDistance;
  const candidates: JunctionCandidate[] = [];

  const emit = (p: RoadPoint, ri: number, ci: number): void => {
    if (candidates.length >= maxJunctions && findNear(candidates, p, mergeSq) === null) return;
    const roadA = roads[ri]!;
    const roadB = roads[ci]!;
    const half = Math.max(roadA.width, roadB.width) / 2;
    const radius = half * radiusScale;
    const elevation = Math.max(roadA.elevation, roadB.elevation);
    const wider = roadA.width >= roadB.width ? roadA : roadB;
    const near = findNear(candidates, p, mergeSq);
    const arms: JunctionArm[] = [
      ...armsAt(roadA.path, p, roadA.width, ri),
      ...armsAt(roadB.path, p, roadB.width, ci),
    ];
    if (near === null) {
      const merged: JunctionArm[] = [];
      for (const arm of arms) mergeArm(merged, arm);
      candidates.push({
        x: p[0],
        z: p[1],
        radius,
        elevation,
        color: wider.color,
        colorWidth: wider.width,
        arms: merged,
      });
    } else {
      near.radius = Math.max(near.radius, radius);
      near.elevation = Math.max(near.elevation, elevation);
      if (wider.width > near.colorWidth) {
        near.color = wider.color;
        near.colorWidth = wider.width;
      }
      for (const arm of arms) mergeArm(near.arms, arm);
    }
  };

  for (let i = 0; i < roads.length; i += 1) {
    const roadA = roads[i]!;
    if (roadA.path.length < 2) continue;
    for (let j = i + 1; j < roads.length; j += 1) {
      const roadB = roads[j]!;
      if (roadB.path.length < 2) continue;
      if (Math.abs(roadA.elevation - roadB.elevation) > elevationBand) continue;
      for (let si = 0; si < roadA.path.length - 1; si += 1) {
        for (let sj = 0; sj < roadB.path.length - 1; sj += 1) {
          const hit = segmentIntersection(
            roadA.path[si]!,
            roadA.path[si + 1]!,
            roadB.path[sj]!,
            roadB.path[sj + 1]!,
          );
          if (hit !== null) emit(hit, i, j);
        }
      }
    }
  }

  return candidates.map((c) => ({
    center: [c.x, c.z] as RoadPoint,
    radius: c.radius,
    elevation: c.elevation,
    color: c.color,
    approaches: c.arms.map((arm) => ({ direction: arm.direction, width: arm.width })),
  }));
}

function findNear(candidates: JunctionCandidate[], p: RoadPoint, mergeSq: number): JunctionCandidate | null {
  for (const c of candidates) {
    const dx = c.x - p[0];
    const dz = c.z - p[1];
    if (dx * dx + dz * dz <= mergeSq) return c;
  }
  return null;
}
