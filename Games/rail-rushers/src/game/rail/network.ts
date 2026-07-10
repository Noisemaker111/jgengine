export type NodeId = string;
export type EdgeId = string;
export type NodeKind = "station" | "junction" | "waypoint";
export type EdgeKind = "track" | "tunnel" | "trestle";
export type ThrowState = "normal" | "reverse";
export type ThrowStates = Record<NodeId, ThrowState>;

export interface RailNode {
  id: NodeId;
  kind: NodeKind;
  label: string;
  position: readonly [number, number];
  junctionIndex?: number;
}

export interface RailEdge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
  singleTrack: boolean;
}

export const RAIL_NODES: readonly RailNode[] = [
  { id: "depot", kind: "station", label: "Depot", position: [0, -130] },
  { id: "j1", kind: "junction", label: "Junction 1", position: [0, -105], junctionIndex: 1 },
  { id: "lowdale", kind: "station", label: "Lowdale", position: [-38, -85] },
  { id: "gorge", kind: "waypoint", label: "Gorge Bend", position: [34, -85] },
  { id: "j2", kind: "junction", label: "Junction 2", position: [0, -60], junctionIndex: 2 },
  { id: "j3", kind: "junction", label: "Junction 3", position: [0, -25], junctionIndex: 3 },
  { id: "ridge2", kind: "waypoint", label: "Highline", position: [30, -10] },
  { id: "j4", kind: "junction", label: "Junction 4", position: [0, 5], junctionIndex: 4 },
  { id: "j5", kind: "junction", label: "Junction 5", position: [0, 35], junctionIndex: 5 },
  { id: "coalridge", kind: "station", label: "Coalridge", position: [-38, 60] },
  { id: "pines", kind: "waypoint", label: "Pine Bypass", position: [34, 60] },
  { id: "j6", kind: "junction", label: "Junction 6", position: [0, 85], junctionIndex: 6 },
  { id: "j7", kind: "junction", label: "Junction 7", position: [0, 110], junctionIndex: 7 },
  { id: "ridge", kind: "waypoint", label: "Switchback Ridge", position: [-32, 140] },
  { id: "switchback2", kind: "waypoint", label: "Steep Grade", position: [32, 140] },
  { id: "j8", kind: "junction", label: "Junction 8", position: [0, 165], junctionIndex: 8 },
  { id: "terminus", kind: "station", label: "Summit Terminus", position: [0, 195] },
];

export const RAIL_EDGES: readonly RailEdge[] = [
  { id: "e-depot-j1", from: "depot", to: "j1", kind: "track", singleTrack: false },
  { id: "e-j1-lowdale", from: "j1", to: "lowdale", kind: "track", singleTrack: false },
  { id: "e-lowdale-j2", from: "lowdale", to: "j2", kind: "track", singleTrack: false },
  { id: "e-j1-gorge", from: "j1", to: "gorge", kind: "track", singleTrack: false },
  { id: "e-gorge-j2", from: "gorge", to: "j2", kind: "track", singleTrack: false },
  { id: "e-j2-j3", from: "j2", to: "j3", kind: "tunnel", singleTrack: true },
  { id: "e-j3-j4", from: "j3", to: "j4", kind: "trestle", singleTrack: true },
  { id: "e-j3-ridge2", from: "j3", to: "ridge2", kind: "track", singleTrack: false },
  { id: "e-ridge2-j4", from: "ridge2", to: "j4", kind: "track", singleTrack: false },
  { id: "e-j4-j5", from: "j4", to: "j5", kind: "track", singleTrack: false },
  { id: "e-j5-coalridge", from: "j5", to: "coalridge", kind: "track", singleTrack: false },
  { id: "e-coalridge-j6", from: "coalridge", to: "j6", kind: "track", singleTrack: false },
  { id: "e-j5-pines", from: "j5", to: "pines", kind: "track", singleTrack: false },
  { id: "e-pines-j6", from: "pines", to: "j6", kind: "track", singleTrack: false },
  { id: "e-j6-j7", from: "j6", to: "j7", kind: "track", singleTrack: false },
  { id: "e-j7-ridge", from: "j7", to: "ridge", kind: "track", singleTrack: false },
  { id: "e-ridge-j8", from: "ridge", to: "j8", kind: "track", singleTrack: false },
  { id: "e-j7-switchback2", from: "j7", to: "switchback2", kind: "track", singleTrack: false },
  { id: "e-switchback2-j8", from: "switchback2", to: "j8", kind: "track", singleTrack: false },
  { id: "e-j8-terminus", from: "j8", to: "terminus", kind: "track", singleTrack: false },
];

export const DEPOT_NODE_ID = "depot";
export const TERMINUS_NODE_ID = "terminus";

export const JUNCTION_NODE_IDS: readonly NodeId[] = RAIL_NODES.filter((n) => n.kind === "junction").map(
  (n) => n.id,
);

export interface JunctionLayout {
  trunk: EdgeId;
  branches: readonly [EdgeId, EdgeId];
}

const JUNCTION_LAYOUT: Readonly<Record<NodeId, JunctionLayout>> = {
  j1: { trunk: "e-depot-j1", branches: ["e-j1-lowdale", "e-j1-gorge"] },
  j2: { trunk: "e-j2-j3", branches: ["e-lowdale-j2", "e-gorge-j2"] },
  j3: { trunk: "e-j2-j3", branches: ["e-j3-j4", "e-j3-ridge2"] },
  j4: { trunk: "e-j4-j5", branches: ["e-j3-j4", "e-ridge2-j4"] },
  j5: { trunk: "e-j4-j5", branches: ["e-j5-coalridge", "e-j5-pines"] },
  j6: { trunk: "e-j6-j7", branches: ["e-coalridge-j6", "e-pines-j6"] },
  j7: { trunk: "e-j6-j7", branches: ["e-j7-ridge", "e-j7-switchback2"] },
  j8: { trunk: "e-j8-terminus", branches: ["e-ridge-j8", "e-switchback2-j8"] },
};

const NODE_BY_ID = new Map<NodeId, RailNode>(RAIL_NODES.map((n) => [n.id, n]));
const EDGE_BY_ID = new Map<EdgeId, RailEdge>(RAIL_EDGES.map((e) => [e.id, e]));

const EDGES_AT_NODE = new Map<NodeId, RailEdge[]>();
for (const node of RAIL_NODES) EDGES_AT_NODE.set(node.id, []);
for (const edge of RAIL_EDGES) {
  EDGES_AT_NODE.get(edge.from)!.push(edge);
  EDGES_AT_NODE.get(edge.to)!.push(edge);
}

export function nodeById(id: NodeId): RailNode {
  const node = NODE_BY_ID.get(id);
  if (node === undefined) throw new Error(`network: unknown node "${id}"`);
  return node;
}

export function edgeById(id: EdgeId): RailEdge {
  const edge = EDGE_BY_ID.get(id);
  if (edge === undefined) throw new Error(`network: unknown edge "${id}"`);
  return edge;
}

export function otherEndpoint(edge: RailEdge, fromNodeId: NodeId): NodeId {
  return edge.from === fromNodeId ? edge.to : edge.from;
}

export function edgesAtNode(nodeId: NodeId): readonly RailEdge[] {
  return EDGES_AT_NODE.get(nodeId) ?? [];
}

export function edgeBetween(a: NodeId, b: NodeId): RailEdge | null {
  for (const edge of edgesAtNode(a)) if (otherEndpoint(edge, a) === b) return edge;
  return null;
}

const LENGTH_CACHE = new Map<EdgeId, number>();
export function edgeLength(edge: RailEdge): number {
  const cached = LENGTH_CACHE.get(edge.id);
  if (cached !== undefined) return cached;
  const a = nodeById(edge.from).position;
  const b = nodeById(edge.to).position;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  LENGTH_CACHE.set(edge.id, length);
  return length;
}

export function defaultThrowStates(): ThrowStates {
  const states: ThrowStates = {};
  for (const id of JUNCTION_NODE_IDS) states[id] = "normal";
  return states;
}

export function nextEdge(nodeId: NodeId, arrivedViaEdgeId: EdgeId | null, throwStates: ThrowStates): RailEdge | null {
  const layout = JUNCTION_LAYOUT[nodeId];
  if (layout !== undefined) {
    if (arrivedViaEdgeId === layout.trunk) {
      const state = throwStates[nodeId] ?? "normal";
      return edgeById(state === "reverse" ? layout.branches[1] : layout.branches[0]);
    }
    return edgeById(layout.trunk);
  }
  const candidates = edgesAtNode(nodeId).filter((e) => e.id !== arrivedViaEdgeId);
  return candidates.length === 0 ? null : candidates[0]!;
}

export interface RoutePreview {
  edgeIds: readonly EdgeId[];
  nodeIds: readonly NodeId[];
  reachedTerminal: boolean;
}

export function previewRoute(
  fromNodeId: NodeId,
  arrivedViaEdgeId: EdgeId | null,
  throwStates: ThrowStates,
  maxHops = 40,
): RoutePreview {
  const edgeIds: EdgeId[] = [];
  const nodeIds: NodeId[] = [fromNodeId];
  let node = fromNodeId;
  let via = arrivedViaEdgeId;
  for (let i = 0; i < maxHops; i += 1) {
    const edge = nextEdge(node, via, throwStates);
    if (edge === null) return { edgeIds, nodeIds, reachedTerminal: true };
    edgeIds.push(edge.id);
    node = otherEndpoint(edge, node);
    nodeIds.push(node);
    via = edge.id;
  }
  return { edgeIds, nodeIds, reachedTerminal: false };
}

export function worldXZ(edge: RailEdge, t: number): readonly [number, number] {
  const a = nodeById(edge.from).position;
  const b = nodeById(edge.to).position;
  const clamped = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * clamped, a[1] + (b[1] - a[1]) * clamped];
}

export function headingAlongEdge(edge: RailEdge, direction: 1 | -1 = 1): number {
  const a = nodeById(edge.from).position;
  const b = nodeById(edge.to).position;
  const dx = (b[0] - a[0]) * direction;
  const dz = (b[1] - a[1]) * direction;
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return 0;
  return Math.atan2(dx, dz);
}
