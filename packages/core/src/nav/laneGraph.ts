import type { EditorDocument, EditorMarker, EditorPath } from "../editor/types";
import type { Waypoint } from "./pathFollow";

const EPSILON = 1e-6;
const DEFAULT_LANE_WIDTH = 3.4;
const DEFAULT_SPEED = 13;
const DEFAULT_STOP_LINE = 6;
const DEFAULT_JOIN_RADIUS = 3;
const DEFAULT_SPEED_BY_LEVEL: Readonly<Record<string, number>> = {
  boulevard: 18,
  avenue: 16,
  street: 13,
  lane: 9,
};

/** A junction where lane spans meet. */
export interface LaneNode {
  id: string;
  at: Waypoint;
}

/** One directed lane span to resolve into the graph. */
export interface LaneEdgeConfig {
  id: string;
  /** World-space centerline, in travel order. */
  points: readonly Waypoint[];
  /** Junction ids; omitted endpoints are joined geometrically by {@link LaneGraphConfig.joinRadius}. */
  from?: string;
  to?: string;
  /** Speed limit in world units per second. */
  speed?: number;
  width?: number;
  /** Ids of the parallel lanes on either side, used for lane changes. */
  left?: string;
  right?: string;
  /** Arc positions, in metres, of parking spots on this lane. */
  parking?: readonly number[];
  /** Allowed as a traffic spawn point. */
  entry?: boolean;
  /** Allowed as a traffic removal point. */
  exit?: boolean;
}

/** Signal timing for one intersection; phases list the in-lanes each green window serves. */
export interface LaneSignalProgram {
  greenSeconds: number;
  yellowSeconds: number;
  /** Red-for-all interval between phases. Default 0. */
  allRedSeconds?: number;
  /**
   * In-lane ids served by each green phase, in cycle order. Omitted lets the traffic runtime derive
   * them: one green per line of travel, so opposite approaches share a window.
   */
  phases?: readonly (readonly string[])[];
}

/** How an intersection resolves which approach may enter next. */
export type LaneRightOfWay = "signal" | "priority";

/** Right-of-way and signal timing for one authored crossing. */
export interface LaneIntersectionConfig {
  node: string;
  /** Default `"priority"` (first come, first served) unless a signal program is given. */
  kind?: LaneRightOfWay;
  signal?: LaneSignalProgram;
  /** Metres before the lane end where a car holds at the stop line. Default 6. */
  stopLine?: number;
  /** Seconds the signal cycle is shifted, to unsynchronize a street of intersections. Default 0. */
  offsetSeconds?: number;
}

/** A resolved lane span: centerline, arc lengths, limit and adjacency. */
export interface LaneSpan {
  id: string;
  from: string;
  to: string;
  points: readonly Waypoint[];
  /** Per-segment lengths; one fewer than `points`. */
  segmentLengths: readonly number[];
  length: number;
  speed: number;
  width: number;
  left: string | null;
  right: string | null;
  parking: readonly number[];
  entry: boolean;
  exit: boolean;
}

/** A resolved crossing: the lanes that feed it, the lanes that leave it, and its right-of-way. */
export interface LaneIntersection {
  node: string;
  at: Waypoint;
  kind: LaneRightOfWay;
  inLanes: readonly string[];
  outLanes: readonly string[];
  stopLine: number;
  signal: LaneSignalProgram | null;
  offsetSeconds: number;
}

/** A parking spot projected onto one lane at an arc position. */
export interface LaneSpot {
  id: string;
  lane: string;
  /** Arc, in metres, along the lane where a car stands parked. */
  arc: number;
}

/** World pose of a lane at an arc position. */
export interface LanePose {
  laneId: string;
  arc: number;
  position: Waypoint;
  /** Yaw of travel, matching engine `rotationY`. */
  heading: number;
}

/** The authored lane graph: junctions, directed spans, crossings and parking spots. */
export interface LaneGraphConfig {
  /** Junction positions; lanes may name them in `from`/`to` instead of joining by geometry. */
  nodes?: readonly LaneNode[];
  lanes: readonly LaneEdgeConfig[];
  intersections?: readonly LaneIntersectionConfig[];
  spots?: readonly LaneSpot[];
  /** Distance within which two lane endpoints are the same junction. Default 3. */
  joinRadius?: number;
}

/**
 * Authored lane topology: junctions, directed spans with speed limits and arc lengths, crossings with
 * their right-of-way, and parking spots. Positions come from the spans themselves, so a traffic
 * runtime never re-derives geometry or runs a path search per vehicle.
 */
export interface LaneGraph {
  node(id: string): LaneNode | null;
  lane(id: string): LaneSpan | null;
  laneIds(): readonly string[];
  nodeIds(): readonly string[];
  outLanes(nodeId: string): readonly string[];
  inLanes(nodeId: string): readonly string[];
  intersection(nodeId: string): LaneIntersection | null;
  intersections(): readonly LaneIntersection[];
  spots(): readonly LaneSpot[];
  spot(id: string): LaneSpot | null;
  /** Lanes a car may spawn on: an authored entry, or a lane whose start has no inbound traffic. */
  entries(): readonly string[];
  /** Lanes that leave the graph: an authored exit, or a lane that ends where nothing continues. */
  exits(): readonly string[];
  /** World pose at `arc` metres, shifted `lateral` metres to the driver's left. */
  pose(laneId: string, arc: number, lateral?: number): LanePose | null;
  /** Arc on `laneId` nearest a world XZ point, clamped to the span. */
  project(laneId: string, x: number, z: number): number;
  /** Travel heading at `arc` along a lane, in radians. */
  heading(laneId: string, arc: number): number;
}

function segmentLengths(points: readonly Waypoint[]): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    lengths.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return lengths;
}

function totalLength(lengths: readonly number[]): number {
  let total = 0;
  for (const length of lengths) total += length;
  return total;
}

/** Interpolated world point and heading at `arc` along a polyline. */
function samplePolyline(points: readonly Waypoint[], lengths: readonly number[], arc: number): { at: Waypoint; heading: number } {
  const clamped = Math.max(0, Math.min(arc, totalLength(lengths)));
  let remaining = clamped;
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i]!;
    const a = points[i]!;
    const b = points[i + 1]!;
    if (remaining <= length || i === lengths.length - 1) {
      const t = length <= EPSILON ? 0 : Math.min(1, remaining / length);
      return {
        at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
        heading: Math.atan2(b[0] - a[0], b[2] - a[2]),
      };
    }
    remaining -= length;
  }
  const only = points[0] ?? ([0, 0, 0] as Waypoint);
  return { at: only, heading: 0 };
}

/** Fallback heading for a degenerate polyline, from the span's declared endpoints. */
function endpointHeading(a: Waypoint, b: Waypoint): number {
  return Math.atan2(b[0] - a[0], b[2] - a[2]);
}

/**
 * Write the world pose at `arc` along a lane into a caller-owned record — the allocation-free form
 * {@link LaneGraph.pose} wraps, for a runtime that poses hundreds of cars per tick.
 * @internal
 */
export function lanePoseInto(
  lane: LaneSpan,
  arc: number,
  lateral: number,
  out: { x: number; y: number; z: number; heading: number },
): void {
  const sample = samplePolyline(lane.points, lane.segmentLengths, arc);
  const forwardX = Math.sin(sample.heading);
  const forwardZ = Math.cos(sample.heading);
  out.x = sample.at[0] + forwardZ * lateral;
  out.y = sample.at[1];
  out.z = sample.at[2] - forwardX * lateral;
  out.heading = sample.heading;
}

interface NodeCluster {
  id: string;
  at: Waypoint;
}

function nodeKeyAt(point: Waypoint): string {
  return `@${point[0].toFixed(1)},${point[2].toFixed(1)}`;
}

function joinNodes(
  lanes: readonly { index: number; fromPoint: Waypoint; toPoint: Waypoint; from?: string; to?: string }[],
  explicit: ReadonlyMap<string, Waypoint>,
  joinRadius: number,
): { from: string[]; to: string[]; nodes: Map<string, NodeCluster> } {
  interface End {
    point: Waypoint;
    declared?: string;
  }
  const ends: End[] = [];
  for (const lane of lanes) {
    ends.push({ point: lane.fromPoint, ...(lane.from === undefined ? {} : { declared: lane.from }) });
    ends.push({ point: lane.toPoint, ...(lane.to === undefined ? {} : { declared: lane.to }) });
  }
  for (const [id, at] of explicit) ends.push({ point: at, declared: id });

  const parent = ends.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    let walk = index;
    while (parent[walk] !== root) {
      const next = parent[walk]!;
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const joins = joinRadius * joinRadius;
  for (let i = 0; i < ends.length; i += 1) {
    for (let j = i + 1; j < ends.length; j += 1) {
      const a = ends[i]!;
      const b = ends[j]!;
      // An endpoint pinned to a junction id joins only that junction; two different declared
      // junctions stay distinct even when they sit close together.
      if (a.declared !== undefined && b.declared !== undefined && a.declared !== b.declared) continue;
      const dx = a.point[0] - b.point[0];
      const dz = a.point[2] - b.point[2];
      if (dx * dx + dz * dz <= joins) union(i, j);
    }
  }

  const nodes = new Map<string, NodeCluster>();
  const idOfRoot = new Map<number, string>();
  const membersOfRoot = new Map<number, End[]>();
  for (let i = 0; i < ends.length; i += 1) {
    const root = find(i);
    const group = membersOfRoot.get(root);
    if (group === undefined) membersOfRoot.set(root, [ends[i]!]);
    else group.push(ends[i]!);
  }
  const taken = new Set<string>(explicit.keys());
  for (const [root, members] of membersOfRoot) {
    const declared = members.find((member) => member.declared !== undefined)?.declared;
    let id = declared;
    if (id === undefined) {
      id = nodeKeyAt(members[0]!.point);
      if (taken.has(id)) {
        let suffix = 2;
        while (taken.has(`${id}#${suffix}`)) suffix += 1;
        id = `${id}#${suffix}`;
      }
    }
    taken.add(id);
    idOfRoot.set(root, id);
    nodes.set(id, { id, at: members[0]!.point });
  }

  const fromIds = new Array<string>(lanes.length);
  const toIds = new Array<string>(lanes.length);
  for (const lane of lanes) {
    fromIds[lane.index] = idOfRoot.get(find(lane.index * 2))!;
    toIds[lane.index] = idOfRoot.get(find(lane.index * 2 + 1))!;
  }
  return { from: fromIds, to: toIds, nodes };
}

/**
 * Resolve authored spans into lane topology. Endpoints join by declared node id, else by an explicit
 * node within `joinRadius`, else by shared position; a junction with two or more inbound lanes becomes
 * an intersection so its right-of-way is resolved once here rather than per car.
 */
function resolveLaneGraph(config: LaneGraphConfig): ResolvedLaneGraph {
  const joinRadius = Math.max(0.05, config.joinRadius ?? DEFAULT_JOIN_RADIUS);
  const explicitNodes = new Map<string, Waypoint>();
  for (const node of config.nodes ?? []) {
    if (explicitNodes.has(node.id)) throw new Error(`duplicate lane node: ${node.id}`);
    explicitNodes.set(node.id, node.at);
  }

  const seenLaneIds = new Set<string>();
  const raw: {
    index: number;
    fromPoint: Waypoint;
    toPoint: Waypoint;
    from?: string;
    to?: string;
  }[] = [];
  const lanes: LaneSpan[] = [];
  config.lanes.forEach((lane, index) => {
    if (seenLaneIds.has(lane.id)) throw new Error(`duplicate lane: ${lane.id}`);
    seenLaneIds.add(lane.id);
    if (lane.points.length < 2) throw new Error(`lane "${lane.id}" needs at least two points`);
    const lengths = segmentLengths(lane.points);
    const length = totalLength(lengths);
    if (!(length > EPSILON)) throw new Error(`lane "${lane.id}" has zero length`);
    lanes.push({
      id: lane.id,
      from: "",
      to: "",
      points: lane.points,
      segmentLengths: lengths,
      length,
      speed: lane.speed ?? DEFAULT_SPEED,
      width: lane.width ?? DEFAULT_LANE_WIDTH,
      left: lane.left ?? null,
      right: lane.right ?? null,
      parking: (lane.parking ?? []).map((arc) => Math.max(0, Math.min(arc, length))),
      entry: lane.entry ?? false,
      exit: lane.exit ?? false,
    });
    raw.push({
      index,
      fromPoint: lane.points[0]!,
      toPoint: lane.points[lane.points.length - 1]!,
      from: lane.from,
      to: lane.to,
    });
  });

  const joined = joinNodes(raw, explicitNodes, joinRadius);
  const laneOf = new Map<string, LaneSpan>();
  lanes.forEach((lane, index) => {
    lane.from = joined.from[index]!;
    lane.to = joined.to[index]!;
    laneOf.set(lane.id, lane);
  });

  const outByNode = new Map<string, string[]>();
  const inByNode = new Map<string, string[]>();
  for (const lane of lanes) {
    const out = outByNode.get(lane.from) ?? [];
    out.push(lane.id);
    outByNode.set(lane.from, out);
    const inbound = inByNode.get(lane.to) ?? [];
    inbound.push(lane.id);
    inByNode.set(lane.to, inbound);
  }
  const nodeIds = [...joined.nodes.keys()].sort();
  for (const id of nodeIds) {
    outByNode.get(id)?.sort();
    inByNode.get(id)?.sort();
  }

  const intersections = new Map<string, LaneIntersection>();
  const addIntersection = (next: LaneIntersection): void => {
    intersections.set(next.node, next);
  };
  for (const lane of lanes) {
    for (const [field, declared] of [
      ["left", lane.left],
      ["right", lane.right],
    ] as const) {
      if (declared !== null && !laneOf.has(declared)) {
        throw new Error(`lane "${lane.id}" ${field} names unknown lane "${declared}"`);
      }
    }
  }

  const explicitIntersections = new Map<string, LaneIntersectionConfig>();
  for (const entry of config.intersections ?? []) {
    if (!joined.nodes.has(entry.node)) throw new Error(`intersection names unknown node "${entry.node}"`);
    explicitIntersections.set(entry.node, entry);
  }

  const buildIntersection = (nodeId: string, entry: LaneIntersectionConfig | undefined): LaneIntersection => {
    const inbound = inByNode.get(nodeId) ?? [];
    const outbound = outByNode.get(nodeId) ?? [];
    const signal = entry?.signal ?? null;
    if (signal !== null) {
      const phases = signal.phases ?? inbound.map((id) => [id]);      for (const phase of phases) {
        for (const laneId of phase) {
          if (!inbound.includes(laneId)) {
            throw new Error(`signal phase at node "${nodeId}" names lane "${laneId}", which does not enter it`);
          }
        }
      }
      if (phases.length === 0) throw new Error(`signal at node "${nodeId}" has no phases`);
    }
    const shortestInbound = inbound.reduce((shortest, laneId) => {
      const lane = laneOf.get(laneId)!;
      return Math.min(shortest, lane.length);
    }, Number.POSITIVE_INFINITY);
    const requested = Math.max(0, entry?.stopLine ?? DEFAULT_STOP_LINE);
    const stopLine = Number.isFinite(shortestInbound) ? Math.min(requested, shortestInbound * 0.5) : requested;
    return {
      node: nodeId,
      at: joined.nodes.get(nodeId)?.at ?? [0, 0, 0],
      kind: entry?.kind ?? (signal !== null ? "signal" : "priority"),
      inLanes: inbound,
      outLanes: outbound,
      stopLine,
      signal,
      offsetSeconds: entry?.offsetSeconds ?? 0,
    };
  };

  for (const nodeId of nodeIds) {
    const inbound = inByNode.get(nodeId) ?? [];
    const outbound = outByNode.get(nodeId) ?? [];
    if (inbound.length === 0 || outbound.length === 0) continue;
    const entry = explicitIntersections.get(nodeId);
    if (entry === undefined && inbound.length < 2) continue;
    addIntersection(buildIntersection(nodeId, entry));
  }

  const spots: LaneSpot[] = [];
  const seenSpotIds = new Set<string>();
  const addSpot = (spot: LaneSpot): void => {
    if (seenSpotIds.has(spot.id)) throw new Error(`duplicate parking spot: ${spot.id}`);
    seenSpotIds.add(spot.id);
    const lane = laneOf.get(spot.lane);
    if (lane === undefined) throw new Error(`parking spot "${spot.id}" names unknown lane "${spot.lane}"`);
    spots.push({ id: spot.id, lane: spot.lane, arc: Math.max(0, Math.min(spot.arc, lane.length)) });
  };
  for (const spot of config.spots ?? []) addSpot(spot);
  for (const lane of lanes) {
    lane.parking.forEach((arc, index) => addSpot({ id: `${lane.id}:parking:${index}`, lane: lane.id, arc }));
  }
  const spotOf = new Map(spots.map((spot) => [spot.id, spot]));

  const entries: string[] = [];
  const exits: string[] = [];
  for (const lane of lanes) {
    const inboundAtStart = inByNode.get(lane.from) ?? [];
    if (lane.entry || inboundAtStart.length === 0) entries.push(lane.id);
    const outboundAtEnd = outByNode.get(lane.to) ?? [];
    if (lane.exit || outboundAtEnd.length === 0) exits.push(lane.id);
  }
  entries.sort();
  exits.sort();

  return { nodeIds, nodes: joined.nodes, laneIds: lanes.map((lane) => lane.id), laneOf, outByNode, inByNode, intersections, spots, spotOf, entries, exits };
}

interface ResolvedLaneGraph {
  nodeIds: string[];
  nodes: Map<string, NodeCluster>;
  laneIds: string[];
  laneOf: Map<string, LaneSpan>;
  outByNode: Map<string, string[]>;
  inByNode: Map<string, string[]>;
  intersections: Map<string, LaneIntersection>;
  spots: LaneSpot[];
  spotOf: Map<string, LaneSpot>;
  entries: string[];
  exits: string[];
}

/**
 * Read handle over the graph resolved once at construction. The build mutates its working set; this
 * object never changes, so a save system rebuilds it from the scene document instead of serializing it.
 *
 * @capability lane-graph directed lane topology with junctions, signals and parking for vehicle traffic
 */
export function createLaneGraph(config: LaneGraphConfig): LaneGraph {
  const resolved = resolveLaneGraph(config);
  const { nodeIds, laneIds, laneOf, outByNode, inByNode, intersections, spots, spotOf, entries, exits } = resolved;
  const nodes = resolved.nodes;

  return {
    node: (id) => {
      const node = nodes.get(id);
      return node === undefined ? null : { id: node.id, at: node.at };
    },
    lane: (id) => laneOf.get(id) ?? null,
    laneIds: () => laneIds.slice(),
    nodeIds: () => nodeIds.slice(),
    outLanes: (nodeId) => outByNode.get(nodeId) ?? [],
    inLanes: (nodeId) => inByNode.get(nodeId) ?? [],
    intersection: (nodeId) => intersections.get(nodeId) ?? null,
    intersections: () => [...intersections.values()],
    spots: () => spots.slice(),
    spot: (id) => spotOf.get(id) ?? null,
    entries: () => entries.slice(),
    exits: () => exits.slice(),
    pose(laneId, arc, lateral = 0) {
      const lane = laneOf.get(laneId);
      if (lane === undefined) return null;
      const out = { x: 0, y: 0, z: 0, heading: 0 };
      lanePoseInto(lane, arc, lateral, out);
      return { laneId, arc, position: [out.x, out.y, out.z], heading: out.heading };
    },
    project(laneId, x, z) {
      const lane = laneOf.get(laneId);
      if (lane === undefined) return 0;
      let bestArc = 0;
      let bestSq = Number.POSITIVE_INFINITY;
      let travelled = 0;
      for (let i = 0; i < lane.segmentLengths.length; i += 1) {
        const a = lane.points[i]!;
        const b = lane.points[i + 1]!;
        const dx = b[0] - a[0];
        const dz = b[2] - a[2];
        const lengthSq = dx * dx + dz * dz;
        const t = lengthSq <= EPSILON ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / lengthSq));
        const px = a[0] + dx * t;
        const pz = a[2] + dz * t;
        const distSq = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (distSq < bestSq) {
          bestSq = distSq;
          bestArc = travelled + lane.segmentLengths[i]! * t;
        }
        travelled += lane.segmentLengths[i]!;
      }
      return bestArc;
    },
    heading(laneId, arc) {
      const lane = laneOf.get(laneId);
      if (lane === undefined) return 0;
      if (lane.segmentLengths.length === 0) {
        return endpointHeading(lane.points[0]!, lane.points[lane.points.length - 1]!);
      }
      return samplePolyline(lane.points, lane.segmentLengths, arc).heading;
    },
  };
}

/** How the document reader recognizes authored lane content. */
export interface LaneGraphDocumentOptions {
  /** Path kinds authored as one directed lane each. Default `["traffic_lane"]`. */
  laneKinds?: readonly string[];
  /** Path kinds authored as a two-way road centerline, expanded into a lane per direction. Default `["road"]`. */
  roadKinds?: readonly string[];
  /** Marker kinds that carry an intersection's right-of-way in `meta`. Default `["traffic_intersection"]`. */
  intersectionKinds?: readonly string[];
  /** Marker kinds that place a parking spot. Default `["traffic_parking"]`. */
  parkingKinds?: readonly string[];
  /** Distance within which lane endpoints and markers join a junction. Default 3. */
  joinRadius?: number;
  /** Speed limit, in world units per second, by authored `meta.level`. */
  speedByLevel?: Readonly<Record<string, number>>;
  /** Speed limit for a path with no recognized level. Default 13. */
  defaultSpeed?: number;
}

function metaNumber(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metaBoolean(meta: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = meta?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function pathSpeed(path: EditorPath, options: LaneGraphDocumentOptions): number {
  const declared = metaNumber(path.meta, "speed");
  if (declared !== undefined) return declared;
  const level = path.meta?.level;
  const byLevel = options.speedByLevel ?? DEFAULT_SPEED_BY_LEVEL;
  if (typeof level === "string" && byLevel[level] !== undefined) return byLevel[level]!;
  return options.defaultSpeed ?? DEFAULT_SPEED;
}

function toWaypoints(points: readonly { x: number; y: number; z: number }[]): Waypoint[] {
  return points.map((point) => [point.x, point.y, point.z] as Waypoint);
}

/** Bend a centerline `lateral` metres to its left, keeping both endpoints pinned to the junctions. */
function offsetCenterline(points: readonly Waypoint[], lateral: number): Waypoint[] {
  if (points.length < 2 || lateral === 0) return points.map((point) => [point[0], point[1], point[2]] as Waypoint);
  const out: Waypoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    if (i === 0 || i === points.length - 1) {
      out.push([point[0], point[1], point[2]]);
      continue;
    }
    const previous = points[i - 1]!;
    const next = points[i + 1]!;
    const heading = Math.atan2(next[0] - previous[0], next[2] - previous[2]);
    out.push([point[0] + Math.cos(heading) * lateral, point[1], point[2] - Math.sin(heading) * lateral]);
  }
  return out;
}

function cumulativeArcs(points: readonly Waypoint[]): number[] {
  const arcs = [0];
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]!;
    const point = points[i]!;
    arcs.push(arcs[i - 1]! + Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]));
  }
  return arcs;
}

interface CenterlineIndex {
  cell: number;
  buckets: Map<string, { pathId: string; x: number; z: number }[]>;
}

function indexCenterlines(paths: readonly { id: string; points: readonly Waypoint[] }[], radius: number): CenterlineIndex {
  const buckets = new Map<string, { pathId: string; x: number; z: number }[]>();
  const key = (cx: number, cz: number): string => `${cx},${cz}`;
  for (const path of paths) {
    for (const point of path.points) {
      const cx = Math.floor(point[0] / radius);
      const cz = Math.floor(point[2] / radius);
      const bucket = buckets.get(key(cx, cz));
      const entry = { pathId: path.id, x: point[0], z: point[2] };
      if (bucket === undefined) buckets.set(key(cx, cz), [entry]);
      else bucket.push(entry);
    }
  }
  return { cell: radius, buckets };
}

/**
 * Interior vertices that another centerline passes through: those are junctions the road crosses, and
 * splitting there is what turns a street centerline into lane spans that meet at a crossing.
 */
function junctionCuts(index: CenterlineIndex, pathId: string, points: readonly Waypoint[]): number[] {
  const radiusSq = index.cell * index.cell;
  const cuts: number[] = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i]!;
    const cx = Math.floor(point[0] / index.cell);
    const cz = Math.floor(point[2] / index.cell);
    let shared = false;
    for (let dx = -1; dx <= 1 && !shared; dx += 1) {
      for (let dz = -1; dz <= 1 && !shared; dz += 1) {
        for (const other of index.buckets.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (other.pathId === pathId) continue;
          const ddx = other.x - point[0];
          const ddz = other.z - point[2];
          if (ddx * ddx + ddz * ddz <= radiusSq) {
            shared = true;
            break;
          }
        }
      }
    }
    if (shared) cuts.push(i);
  }
  return cuts;
}


function nearestLaneAt(
  graph: LaneGraph,
  x: number,
  z: number,
  limit: number,
): { lane: string; arc: number; distance: number } | null {
  let best: { lane: string; arc: number; distance: number } | null = null;
  for (const laneId of graph.laneIds()) {
    const arc = graph.project(laneId, x, z);
    const pose = graph.pose(laneId, arc);
    if (pose === null) continue;
    const distance = Math.hypot(pose.position[0] - x, pose.position[2] - z);
    if (distance > limit) continue;
    if (best === null || distance < best.distance) best = { lane: laneId, arc, distance };
  }
  return best;
}

function signalFromMeta(meta: Record<string, unknown> | undefined): LaneSignalProgram | null {
  const raw = meta?.signal;
  if (raw === undefined || raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const green = metaNumber(record, "greenSeconds") ?? metaNumber(record, "green") ?? 12;
  const yellow = metaNumber(record, "yellowSeconds") ?? metaNumber(record, "yellow") ?? 3;
  const allRed = metaNumber(record, "allRedSeconds") ?? metaNumber(record, "allRed");
  const rawPhases = record.phases;
  let phases: string[][] | undefined;
  if (Array.isArray(rawPhases)) {
    phases = rawPhases.map((phase) => (Array.isArray(phase) ? phase.filter((entry): entry is string => typeof entry === "string") : []));
  }
  return {
    greenSeconds: green,
    yellowSeconds: yellow,
    ...(allRed === undefined ? {} : { allRedSeconds: allRed }),
    ...(phases === undefined ? {} : { phases }),
  };
}

/**
 * Read a lane graph out of an authored scene document. `traffic_lane` paths are one directed lane each;
 * `road` paths (the editor's street bake) become a lane per direction, offset onto their own side of
 * the road; `traffic_intersection` markers carry a signal program and right-of-way in `meta`;
 * `traffic_parking` markers place parking spots. Runtime positions come from the paths, so editing a
 * road moves its traffic instead of leaving a duplicate lane behind.
 *
 * @capability lane-graph-from-scene read an authored lane graph, signals and parking out of the scene document
 */
export function laneGraphFromDocument(
  doc: Pick<EditorDocument, "paths" | "markers">,
  options: LaneGraphDocumentOptions = {},
): LaneGraph {
  const laneKinds = new Set(options.laneKinds ?? ["traffic_lane"]);
  const roadKinds = new Set(options.roadKinds ?? ["road"]);
  const intersectionKinds = new Set(options.intersectionKinds ?? ["traffic_intersection", "traffic_signal"]);
  const parkingKinds = new Set(options.parkingKinds ?? ["traffic_parking"]);
  const laneWidth = DEFAULT_LANE_WIDTH;
  const joinRadius = Math.max(0.5, options.joinRadius ?? DEFAULT_JOIN_RADIUS);
  const lanes: LaneEdgeConfig[] = [];

  const consumed: { path: EditorPath; points: Waypoint[] }[] = [];
  for (const path of doc.paths) {
    if (path.points.length < 2) continue;
    if (!laneKinds.has(path.kind) && !roadKinds.has(path.kind)) continue;
    consumed.push({ path, points: toWaypoints(path.points) });
  }
  const centerlines = indexCenterlines(
    consumed.map((entry) => ({ id: entry.path.id, points: entry.points })),
    joinRadius,
  );

  /** Cut a centerline into the runs between junctions, as `[first,last]` point index pairs. */
  const runsOf = (pathId: string, points: readonly Waypoint[]): [number, number][] => {
    const cuts = junctionCuts(centerlines, pathId, points);
    const runs: [number, number][] = [];
    let start = 0;
    for (const cut of cuts) {
      if (cut > start) runs.push([start, cut]);
      start = cut;
    }
    if (start < points.length - 1) runs.push([start, points.length - 1]);
    return runs;
  };

  /** Parking arcs authored along the centerline, moved into one run's own arc space. */
  const parkingForRun = (
    arcs: readonly number[],
    arcsAt: readonly number[],
    runStart: number,
    runEnd: number,
    pathLength: number,
    reverse: boolean,
  ): number[] => {
    const from = reverse ? pathLength - arcsAt[runEnd]! : arcsAt[runStart]!;
    const to = reverse ? pathLength - arcsAt[runStart]! : arcsAt[runEnd]!;
    const out: number[] = [];
    for (const arc of arcs) {
      const position = reverse ? pathLength - arc : arc;
      if (position < from - 1e-6 || position > to + 1e-6) continue;
      out.push(position - from);
    }
    return out;
  };

  for (const { path, points } of consumed) {
    const width = path.width ?? laneWidth;
    const speed = pathSpeed(path, options);
    const entry = metaBoolean(path.meta, "entry") ?? false;
    const exit = metaBoolean(path.meta, "exit") ?? false;
    const authoredParking = Array.isArray(path.meta?.parking)
      ? path.meta.parking.filter((arc): arc is number => typeof arc === "number" && Number.isFinite(arc))
      : [];
    const arcsAt = cumulativeArcs(points);
    const pathLength = arcsAt[arcsAt.length - 1]!;
    const runs = runsOf(path.id, points);
    const split = runs.length > 1;

    const push = (baseId: string, run: [number, number]): void => {
      lanes.push({
        id: baseId,
        points: points.slice(run[0], run[1] + 1),
        speed,
        width,
        parking: parkingForRun(authoredParking, arcsAt, run[0], run[1], pathLength, false),
        entry: entry && run[0] === 0,
        exit: exit && run[1] === points.length - 1,
      });
    };

    if (laneKinds.has(path.kind)) {
      runs.forEach((run, index) => {
        push(index === 0 ? path.id : `${path.id}#${index + 1}`, run);
        if (split) return;
        const lane = lanes[lanes.length - 1]!;
        lane.left = typeof path.meta?.left === "string" ? path.meta.left : undefined;
        lane.right = typeof path.meta?.right === "string" ? path.meta.right : undefined;
      });
      continue;
    }

    const half = Math.max(0, width / 2 - laneWidth / 2);
    runs.forEach((run, index) => {
      const forwardId = index === 0 ? `${path.id}:f` : `${path.id}:f#${index + 1}`;
      const reverseId = index === 0 ? `${path.id}:r` : `${path.id}:r#${index + 1}`;
      const slice = points.slice(run[0], run[1] + 1);
      lanes.push({
        id: forwardId,
        points: offsetCenterline(slice, half),
        speed,
        width: laneWidth,
        left: reverseId,
        parking: parkingForRun(authoredParking, arcsAt, run[0], run[1], pathLength, false),
        entry: entry && run[0] === 0,
        exit: exit && run[1] === points.length - 1,
      });
      lanes.push({
        id: reverseId,
        points: offsetCenterline([...slice].reverse(), half),
        speed,
        width: laneWidth,
        left: forwardId,
        parking: parkingForRun(authoredParking, arcsAt, run[0], run[1], pathLength, true),
        entry: entry && run[0] === 0,
        exit: exit && run[1] === points.length - 1,
      });
    });
  }

  const intersectionMarkers = doc.markers.filter((marker) => intersectionKinds.has(marker.kind));
  const nodes = intersectionMarkers.map((marker) => ({
    id: marker.id,
    at: [marker.position.x, marker.position.y, marker.position.z] as Waypoint,
  }));
  const preliminary = createLaneGraph({ lanes, joinRadius, nodes });

  const intersections: LaneIntersectionConfig[] = [];
  for (const marker of intersectionMarkers) {
    const hit = nearestNode(preliminary, marker, joinRadius * 1.5);
    if (hit === null) continue;
    const signal = signalFromMeta(marker.meta) ?? (marker.kind === "traffic_signal" ? { greenSeconds: 12, yellowSeconds: 3 } : null);
    const declaredKind = marker.meta?.rightOfWay;
    const stopLine = metaNumber(marker.meta, "stopLine");
    const offsetSeconds = metaNumber(marker.meta, "offsetSeconds");
    intersections.push({
      node: hit,
      kind: declaredKind === "signal" || declaredKind === "priority" ? declaredKind : signal === null ? "priority" : "signal",
      ...(signal === null ? {} : { signal }),
      ...(stopLine === undefined ? {} : { stopLine }),
      ...(offsetSeconds === undefined ? {} : { offsetSeconds }),
    });
  }

  const spots: LaneSpot[] = [];
  for (const marker of doc.markers.filter((entry) => parkingKinds.has(entry.kind))) {
    const hit = nearestLaneAt(preliminary, marker.position.x, marker.position.z, joinRadius * 2);
    if (hit === null) continue;
    spots.push({ id: marker.id, lane: hit.lane, arc: hit.arc });
  }

  return createLaneGraph({ lanes, joinRadius, intersections, spots, nodes });
}

function nearestNode(graph: LaneGraph, marker: EditorMarker, limit: number): string | null {
  let best: string | null = null;
  let bestDistance = limit;
  for (const nodeId of graph.nodeIds()) {
    const node = graph.node(nodeId)!;
    const distance = Math.hypot(node.at[0] - marker.position.x, node.at[2] - marker.position.z);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = nodeId;
    }
  }
  return best;
}
