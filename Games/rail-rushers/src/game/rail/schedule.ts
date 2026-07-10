import { edgeBetween, edgeLength, headingAlongEdge, nodeById, worldXZ, type EdgeId, type NodeId } from "./network";

export interface TrainLivery {
  body: string;
  trim: string;
  lantern: string;
}

export interface TrainDef {
  id: string;
  name: string;
  role: "express" | "local" | "freight";
  speed: number;
  routeNodeIds: readonly NodeId[];
  offsetSeconds: number;
  livery: TrainLivery;
}

export interface TrainPose {
  x: number;
  z: number;
  edgeId: EdgeId | null;
  edgeT: number;
  heading: number;
  direction: 1 | -1;
}

interface RouteGeometry {
  edgeIds: readonly EdgeId[];
  cumulative: readonly number[];
  totalLength: number;
}

const ROUTE_CACHE = new Map<string, RouteGeometry>();

function routeKey(nodeIds: readonly NodeId[]): string {
  return nodeIds.join(">");
}

function routeGeometry(routeNodeIds: readonly NodeId[]): RouteGeometry {
  const key = routeKey(routeNodeIds);
  const cached = ROUTE_CACHE.get(key);
  if (cached !== undefined) return cached;
  const edgeIds: EdgeId[] = [];
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < routeNodeIds.length; i += 1) {
    const edge = edgeBetween(routeNodeIds[i - 1]!, routeNodeIds[i]!);
    if (edge === null) {
      throw new Error(`schedule: no edge between "${routeNodeIds[i - 1]}" and "${routeNodeIds[i]}"`);
    }
    edgeIds.push(edge.id);
    total += edgeLength(edge);
    cumulative.push(total);
  }
  const geometry: RouteGeometry = { edgeIds, cumulative, totalLength: total };
  ROUTE_CACHE.set(key, geometry);
  return geometry;
}

export function trainRouteLength(train: TrainDef): number {
  return routeGeometry(train.routeNodeIds).totalLength;
}

function poseAtForwardDistance(routeNodeIds: readonly NodeId[], distance: number): TrainPose {
  const geometry = routeGeometry(routeNodeIds);
  if (geometry.totalLength <= 1e-9 || geometry.edgeIds.length === 0) {
    const [x, z] = nodeById(routeNodeIds[0]!).position;
    return { x, z, edgeId: null, edgeT: 0, heading: 0, direction: 1 };
  }
  const clamped = Math.min(geometry.totalLength, Math.max(0, distance));
  let index = 0;
  for (let i = 1; i < geometry.cumulative.length; i += 1) {
    index = i - 1;
    if (geometry.cumulative[i]! >= clamped) break;
  }
  const edgeId = geometry.edgeIds[index]!;
  const segStart = geometry.cumulative[index]!;
  const segEnd = geometry.cumulative[index + 1]!;
  const segLength = segEnd - segStart;
  const edgeT = segLength <= 1e-9 ? 0 : (clamped - segStart) / segLength;
  const edge = edgeBetween(routeNodeIds[index]!, routeNodeIds[index + 1]!)!;
  const forwardEdgeT = edge.from === routeNodeIds[index] ? edgeT : 1 - edgeT;
  const [x, z] = worldXZ(edge, forwardEdgeT);
  const heading = headingAlongEdge(edge, edge.from === routeNodeIds[index] ? 1 : -1);
  return { x, z, edgeId, edgeT: forwardEdgeT, heading, direction: 1 };
}

export function trainPositionAt(train: TrainDef, t: number): TrainPose {
  const geometry = routeGeometry(train.routeNodeIds);
  const total = geometry.totalLength;
  if (total <= 1e-9 || train.speed <= 0) return poseAtForwardDistance(train.routeNodeIds, 0);
  const cycle = total * 2;
  const travelled = train.speed * (t + train.offsetSeconds);
  const raw = ((travelled % cycle) + cycle) % cycle;
  if (raw <= total) return poseAtForwardDistance(train.routeNodeIds, raw);
  const backDistance = cycle - raw;
  const pose = poseAtForwardDistance(train.routeNodeIds, backDistance);
  return { ...pose, direction: -1, heading: pose.heading + Math.PI };
}

export function nextForwardArrival(train: TrainDef, now: number): number {
  const geometry = routeGeometry(train.routeNodeIds);
  const total = geometry.totalLength;
  if (total <= 1e-9 || train.speed <= 0) return 0;
  const cycle = total * 2;
  const travelled = train.speed * (now + train.offsetSeconds);
  const current = ((travelled % cycle) + cycle) % cycle;
  const deltaRaw = ((total - current) % cycle + cycle) % cycle;
  return deltaRaw / train.speed;
}

export const EXPRESS_SPEED = 5;
export const LOCAL_SPEED = 3.2;
export const FREIGHT_SPEED = 2;

export const TRAINS: readonly TrainDef[] = [
  {
    id: "express",
    name: "The Evening Express",
    role: "express",
    speed: EXPRESS_SPEED,
    offsetSeconds: 0,
    routeNodeIds: [
      "depot",
      "j1",
      "gorge",
      "j2",
      "j3",
      "j4",
      "j5",
      "pines",
      "j6",
      "j7",
      "ridge",
      "j8",
      "terminus",
    ],
    livery: { body: "#bc4749", trim: "#f2e8cf", lantern: "#f2e8cf" },
  },
  {
    id: "local",
    name: "The Valley Local",
    role: "local",
    speed: LOCAL_SPEED,
    offsetSeconds: 6,
    routeNodeIds: ["j2", "j3", "j4", "j5"],
    livery: { body: "#386641", trim: "#a98467", lantern: "#f2e8cf" },
  },
  {
    id: "freight-lowdale",
    name: "Lowdale Freight",
    role: "freight",
    speed: FREIGHT_SPEED,
    offsetSeconds: 3,
    routeNodeIds: ["j1", "lowdale", "j2"],
    livery: { body: "#6b705c", trim: "#a98467", lantern: "#bc4749" },
  },
  {
    id: "freight-coalridge",
    name: "Coalridge Freight",
    role: "freight",
    speed: FREIGHT_SPEED,
    offsetSeconds: 9,
    routeNodeIds: ["j5", "coalridge", "j6"],
    livery: { body: "#6b705c", trim: "#386641", lantern: "#bc4749" },
  },
];

export function trainById(id: string): TrainDef {
  const train = TRAINS.find((t) => t.id === id);
  if (train === undefined) throw new Error(`schedule: unknown train "${id}"`);
  return train;
}

export const EXPRESS_TOTAL_LENGTH = trainRouteLength(trainById("express"));
