import {
  type Vec3,
  closestPointOnSegmentXZ,
  perpendicularOf,
  polylineCumulative,
  polylineLength,
  tangentAlong,
} from "./canyonMath";

export const MAIN_NODE_COUNT = 17;
export const MAIN_Z_STEP = 95;
export const MAIN_WAVE_AMPLITUDE = 55;
export const MAIN_WAVE_FREQ = 0.55;
export const MAIN_WAVE_FREQ_2 = 1.27;
export const MAIN_FLOOR_RELIEF = 1.5;
export const MAIN_CORRIDOR_WIDTH = 13;
export const BORDER_NODE_INDEX = MAIN_NODE_COUNT - 1;

const MAIN_Z_CENTER_OFFSET = ((MAIN_NODE_COUNT - 1) * MAIN_Z_STEP) / 2;

function mainNodePosition(index: number): Vec3 {
  const z = index * MAIN_Z_STEP - MAIN_Z_CENTER_OFFSET;
  const x =
    Math.sin(index * MAIN_WAVE_FREQ) * MAIN_WAVE_AMPLITUDE +
    Math.sin(index * MAIN_WAVE_FREQ_2) * MAIN_WAVE_AMPLITUDE * 0.28;
  const y = Math.sin(index * 0.35) * MAIN_FLOOR_RELIEF;
  return [x, y, z];
}

export interface CanyonNode {
  readonly id: string;
  readonly index: number;
  readonly position: Vec3;
}

export const mainNodes: readonly CanyonNode[] = Array.from({ length: MAIN_NODE_COUNT }, (_, index) => ({
  id: `main-${index}`,
  index,
  position: mainNodePosition(index),
}));

export const mainPolyline: readonly Vec3[] = mainNodes.map((node) => node.position);
export const mainCumulative: readonly number[] = polylineCumulative(mainPolyline);
export const TOTAL_MAIN_LENGTH = polylineLength(mainPolyline);

function tangentAtNode(index: number): readonly [number, number] {
  const prev = mainNodePosition(Math.max(0, index - 1));
  const next = mainNodePosition(Math.min(MAIN_NODE_COUNT - 1, index + 1));
  return tangentAlong(prev, next);
}

function perpAtNode(index: number): readonly [number, number] {
  return perpendicularOf(tangentAtNode(index));
}

export type CanyonBranchKind = "fork" | "shortcut" | "deadend";

interface BranchSpec {
  readonly id: string;
  readonly kind: CanyonBranchKind;
  readonly fromIndex: number;
  readonly toIndex: number | null;
  readonly side: 1 | -1;
  readonly label: string;
}

const BRANCH_SPECS: readonly BranchSpec[] = [
  { id: "fork-1", kind: "fork", fromIndex: 2, toIndex: 4, side: 1, label: "Dry Wash Bend" },
  { id: "fork-2", kind: "fork", fromIndex: 5, toIndex: 7, side: -1, label: "Split Table Bypass" },
  { id: "fork-3", kind: "fork", fromIndex: 8, toIndex: 10, side: 1, label: "Devil's Elbow" },
  { id: "fork-4", kind: "fork", fromIndex: 11, toIndex: 13, side: -1, label: "Rimrock Cut" },
  { id: "fork-5", kind: "fork", fromIndex: 13, toIndex: 15, side: 1, label: "Hollow Ridge Loop" },
  { id: "shortcut-1", kind: "shortcut", fromIndex: 1, toIndex: 4, side: -1, label: "Shadow Slot" },
  { id: "shortcut-2", kind: "shortcut", fromIndex: 3, toIndex: 6, side: 1, label: "Widow's Crack" },
  { id: "shortcut-3", kind: "shortcut", fromIndex: 6, toIndex: 9, side: -1, label: "Tumbleweed Gate" },
  { id: "shortcut-4", kind: "shortcut", fromIndex: 8, toIndex: 12, side: 1, label: "Blind Fault" },
  { id: "shortcut-5", kind: "shortcut", fromIndex: 10, toIndex: 13, side: -1, label: "Angled Rake" },
  { id: "shortcut-6", kind: "shortcut", fromIndex: 12, toIndex: 16, side: 1, label: "Last Gasp Slot" },
  { id: "deadend-1", kind: "deadend", fromIndex: 4, toIndex: null, side: -1, label: "Broad Mouth" },
  { id: "deadend-2", kind: "deadend", fromIndex: 9, toIndex: null, side: 1, label: "Open Throat" },
  { id: "deadend-3", kind: "deadend", fromIndex: 13, toIndex: null, side: -1, label: "Wide Hollow" },
];

const BRANCH_DEPTH: Record<CanyonBranchKind, number> = { fork: 70, shortcut: 85, deadend: 50 };
const BRANCH_WIDTH: Record<CanyonBranchKind, number> = { fork: 11, shortcut: 9.5, deadend: 8 };

function buildThroughWaypoints(spec: BranchSpec): readonly Vec3[] {
  const from = mainNodePosition(spec.fromIndex);
  const to = mainNodePosition(spec.toIndex as number);
  const [px, pz] = perpAtNode(spec.fromIndex);
  const depth = BRANCH_DEPTH[spec.kind] * spec.side;
  const mid1: Vec3 = [
    from[0] + (to[0] - from[0]) * 0.33 + px * depth,
    from[1] + (to[1] - from[1]) * 0.33,
    from[2] + (to[2] - from[2]) * 0.33 + pz * depth,
  ];
  const mid2: Vec3 = [
    from[0] + (to[0] - from[0]) * 0.66 + px * depth * 0.72,
    from[1] + (to[1] - from[1]) * 0.66,
    from[2] + (to[2] - from[2]) * 0.66 + pz * depth * 0.72,
  ];
  return [from, mid1, mid2, to];
}

function buildDeadendWaypoints(spec: BranchSpec): readonly Vec3[] {
  const from = mainNodePosition(spec.fromIndex);
  const [px, pz] = perpAtNode(spec.fromIndex);
  const [tx, tz] = tangentAtNode(spec.fromIndex);
  const depth = BRANCH_DEPTH.deadend;
  const mid: Vec3 = [
    from[0] + px * depth * 0.55 * spec.side + tx * depth * 0.2,
    from[1],
    from[2] + pz * depth * 0.55 * spec.side + tz * depth * 0.2,
  ];
  const end: Vec3 = [
    from[0] + px * depth * spec.side + tx * depth * 0.05,
    from[1],
    from[2] + pz * depth * spec.side + tz * depth * 0.05,
  ];
  return [from, mid, end];
}

export interface CanyonBranch {
  readonly id: string;
  readonly kind: CanyonBranchKind;
  readonly fromIndex: number;
  readonly toIndex: number | null;
  readonly waypoints: readonly Vec3[];
  readonly width: number;
  readonly deceptive: boolean;
  readonly inviting: boolean;
  readonly passable: boolean;
  readonly label: string;
}

export const canyonBranches: readonly CanyonBranch[] = BRANCH_SPECS.map((spec) => ({
  id: spec.id,
  kind: spec.kind,
  fromIndex: spec.fromIndex,
  toIndex: spec.toIndex,
  waypoints: spec.kind === "deadend" ? buildDeadendWaypoints(spec) : buildThroughWaypoints(spec),
  width: BRANCH_WIDTH[spec.kind],
  deceptive: spec.kind === "shortcut",
  inviting: spec.kind === "deadend",
  passable: spec.toIndex !== null,
  label: spec.label,
}));

export const forkBranches: readonly CanyonBranch[] = canyonBranches.filter((branch) => branch.kind === "fork");
export const shortcutBranches: readonly CanyonBranch[] = canyonBranches.filter((branch) => branch.kind === "shortcut");
export const deadendBranches: readonly CanyonBranch[] = canyonBranches.filter((branch) => branch.kind === "deadend");
export const deceptiveBranchIds: ReadonlySet<string> = new Set(shortcutBranches.map((branch) => branch.id));
export const branchById: ReadonlyMap<string, CanyonBranch> = new Map(canyonBranches.map((branch) => [branch.id, branch]));

export interface CanyonEdge {
  readonly id: string;
  readonly branchId: string;
  readonly kind: "main" | CanyonBranchKind;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly width: number;
}

function edgesFromChain(
  points: readonly Vec3[],
  branchId: string,
  kind: "main" | CanyonBranchKind,
  width: number,
): CanyonEdge[] {
  const edges: CanyonEdge[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    edges.push({ id: `${branchId}-e${i}`, branchId, kind, a: points[i], b: points[i + 1], width });
  }
  return edges;
}

export const canyonEdges: readonly CanyonEdge[] = [
  ...edgesFromChain(mainPolyline, "main", "main", MAIN_CORRIDOR_WIDTH),
  ...canyonBranches.flatMap((branch) => edgesFromChain(branch.waypoints, branch.id, branch.kind, branch.width)),
];

export interface NearestCanyonPoint {
  readonly edge: CanyonEdge;
  readonly point: Vec3;
  readonly distance: number;
  readonly t: number;
}

export function nearestCanyonPoint(position: Vec3): NearestCanyonPoint {
  let best: NearestCanyonPoint | null = null;
  for (const edge of canyonEdges) {
    const hit = closestPointOnSegmentXZ(position, edge.a, edge.b);
    if (best === null || hit.distance < best.distance) {
      best = { edge, point: hit.point, distance: hit.distance, t: hit.t };
    }
  }
  return best as NearestCanyonPoint;
}

export function constrainToCanyon(position: Vec3): { position: Vec3; nearest: NearestCanyonPoint } {
  const nearest = nearestCanyonPoint(position);
  if (nearest.distance <= nearest.edge.width) return { position, nearest };
  const dx = position[0] - nearest.point[0];
  const dz = position[2] - nearest.point[2];
  const length = Math.hypot(dx, dz) || 1;
  const clamped: Vec3 = [
    nearest.point[0] + (dx / length) * nearest.edge.width,
    position[1],
    nearest.point[2] + (dz / length) * nearest.edge.width,
  ];
  return { position: clamped, nearest };
}

export function nearestMainDistance(position: Vec3): number {
  let best = { distance: Number.POSITIVE_INFINITY, mainDistance: 0 };
  for (let i = 0; i < mainPolyline.length - 1; i += 1) {
    const hit = closestPointOnSegmentXZ(position, mainPolyline[i], mainPolyline[i + 1]);
    if (hit.distance < best.distance) {
      const segmentLength = mainCumulative[i + 1] - mainCumulative[i];
      best = { distance: hit.distance, mainDistance: mainCumulative[i] + segmentLength * hit.t };
    }
  }
  return best.mainDistance;
}
