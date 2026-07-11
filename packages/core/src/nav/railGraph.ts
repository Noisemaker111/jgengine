import type { Waypoint } from "./pathFollow";

export interface RailNode {
  id: string;
  at: Waypoint;
}

export interface RailEdge {
  id: string;
  from: string;
  to: string;
  /** Intermediate shape points between the two node positions (curves, sidings). */
  via?: readonly Waypoint[];
}

export interface RailGraphConfig {
  nodes: readonly RailNode[];
  edges: readonly RailEdge[];
}

export interface ResolvedRailEdge {
  id: string;
  from: string;
  to: string;
  points: readonly Waypoint[];
  length: number;
}

/**
 * A directed graph of track segments with junction switch-throw semantics — the topological seam
 * `nav/navGrid`'s walkable cells can't express. Each node with several out-edges is a switch whose
 * thrown edge decides where traffic exits; riders (`createRailRider`) run along edge polylines and
 * take the thrown edge at every junction.
 */
export interface RailGraph {
  node(id: string): RailNode | null;
  edge(id: string): ResolvedRailEdge | null;
  edges(): readonly string[];
  /** Out-edge ids leaving a node, in declaration order. */
  outEdges(nodeId: string): readonly string[];
  /** The edge a rider leaves this node on — the thrown switch, defaulting to the first declared out-edge; `null` at a dead end. */
  thrownEdge(nodeId: string): string | null;
  /** Throw the switch at `nodeId` to `edgeId`; `false` unless `edgeId` leaves that node. */
  throwSwitch(nodeId: string, edgeId: string): boolean;
}

export interface RailRiderConfig {
  edgeId: string;
  /** Arc-length position along the starting edge; default `0`. */
  s?: number;
  /** World units per second; mutate via `setSpeed`. */
  speed: number;
}

export interface RailRiderPose {
  position: Waypoint;
  /** Yaw (radians) of the travel direction, matching engine `rotationY`. */
  heading: number;
  edgeId: string;
  /** Arc-length along the current edge. */
  s: number;
  /** True once the rider stops at a node with no thrown out-edge. */
  atDeadEnd: boolean;
}

export interface RailRider {
  advance(dt: number): RailRiderPose;
  pose(): RailRiderPose;
  setSpeed(speed: number): void;
  /** Teleport onto an edge (a respawn or re-rail); throws on an unknown edge. */
  place(edgeId: string, s?: number): void;
}

function segmentLengths(points: readonly Waypoint[]): { lengths: number[]; total: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    lengths.push(length);
    total += length;
  }
  return { lengths, total };
}

export function createRailGraph(config: RailGraphConfig): RailGraph {
  const nodes = new Map<string, RailNode>();
  for (const node of config.nodes) {
    if (nodes.has(node.id)) throw new Error(`duplicate rail node: ${node.id}`);
    nodes.set(node.id, node);
  }
  const edges = new Map<string, ResolvedRailEdge>();
  const outByNode = new Map<string, string[]>();
  const switches = new Map<string, string>();
  const edgeOrder: string[] = [];
  for (const edge of config.edges) {
    if (edges.has(edge.id)) throw new Error(`duplicate rail edge: ${edge.id}`);
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (from === undefined || to === undefined) {
      throw new Error(`rail edge "${edge.id}" references unknown node "${from === undefined ? edge.from : edge.to}"`);
    }
    const points: Waypoint[] = [from.at, ...(edge.via ?? []), to.at];
    const { total } = segmentLengths(points);
    edges.set(edge.id, { id: edge.id, from: edge.from, to: edge.to, points, length: total });
    edgeOrder.push(edge.id);
    const out = outByNode.get(edge.from) ?? [];
    out.push(edge.id);
    outByNode.set(edge.from, out);
    if (!switches.has(edge.from)) switches.set(edge.from, edge.id);
  }

  return {
    node: (id) => nodes.get(id) ?? null,
    edge: (id) => edges.get(id) ?? null,
    edges: () => edgeOrder.slice(),
    outEdges: (nodeId) => outByNode.get(nodeId) ?? [],
    thrownEdge: (nodeId) => switches.get(nodeId) ?? null,
    throwSwitch(nodeId, edgeId) {
      const out = outByNode.get(nodeId);
      if (out === undefined || !out.includes(edgeId)) return false;
      switches.set(nodeId, edgeId);
      return true;
    },
  };
}

export function createRailRider(graph: RailGraph, config: RailRiderConfig): RailRider {
  let edge = graph.edge(config.edgeId);
  if (edge === null) throw new Error(`unknown rail edge: ${config.edgeId}`);
  let s = Math.max(0, Math.min(config.s ?? 0, edge.length));
  let speed = config.speed;
  let deadEnd = false;

  function poseOn(current: ResolvedRailEdge, arc: number): RailRiderPose {
    const { lengths } = segmentLengths(current.points);
    let remaining = arc;
    for (let i = 0; i < lengths.length; i += 1) {
      const length = lengths[i]!;
      if (remaining <= length || i === lengths.length - 1) {
        const a = current.points[i]!;
        const b = current.points[i + 1]!;
        const fraction = length <= 1e-9 ? 0 : Math.min(1, remaining / length);
        return {
          position: [
            a[0] + (b[0] - a[0]) * fraction,
            a[1] + (b[1] - a[1]) * fraction,
            a[2] + (b[2] - a[2]) * fraction,
          ],
          heading: Math.atan2(b[0] - a[0], b[2] - a[2]),
          edgeId: current.id,
          s: arc,
          atDeadEnd: deadEnd,
        };
      }
      remaining -= length;
    }
    const last = current.points[current.points.length - 1]!;
    return { position: last, heading: 0, edgeId: current.id, s: arc, atDeadEnd: deadEnd };
  }

  return {
    advance(dt) {
      if (deadEnd || dt <= 0 || speed <= 0) return poseOn(edge!, s);
      let budget = speed * dt;
      let guard = 64;
      while (budget > 1e-9 && guard > 0) {
        guard -= 1;
        const room = edge!.length - s;
        if (budget < room) {
          s += budget;
          budget = 0;
          break;
        }
        budget -= room;
        const nextId = graph.thrownEdge(edge!.to);
        if (nextId === null) {
          s = edge!.length;
          deadEnd = true;
          break;
        }
        edge = graph.edge(nextId)!;
        s = 0;
      }
      return poseOn(edge!, s);
    },
    pose: () => poseOn(edge!, s),
    setSpeed(next) {
      speed = next;
    },
    place(edgeId, arc = 0) {
      const next = graph.edge(edgeId);
      if (next === null) throw new Error(`unknown rail edge: ${edgeId}`);
      edge = next;
      s = Math.max(0, Math.min(arc, next.length));
      deadEnd = false;
    },
  };
}
