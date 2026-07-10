import {
  DEPOT_NODE_ID,
  edgeById,
  edgeLength,
  headingAlongEdge,
  JUNCTION_NODE_IDS,
  nextEdge,
  otherEndpoint,
  previewRoute,
  TERMINUS_NODE_ID,
  worldXZ,
  type EdgeId,
  type NodeId,
  type ThrowStates,
} from "./network";

const JUNCTION_IDS = new Set(JUNCTION_NODE_IDS);

export const MAX_SPEED = 7.5;
export const PUMP_SPEED_CAP = 9.6;
export const ACCEL_PER_SEC = 3.4;
export const FRICTION_PER_SEC = 2.1;
export const BRAKE_PER_SEC = 5.5;

export interface PlayerInput {
  throttle: boolean;
  brake: boolean;
  pumpBonus: number;
}

export interface PlayerRunState {
  fromNodeId: NodeId;
  currentEdgeId: EdgeId;
  edgeT: number;
  speed: number;
  edgesTraveled: readonly EdgeId[];
  elapsed: number;
  finished: boolean;
  finishTime: number | null;
}

export function createPlayerRun(): PlayerRunState {
  const startEdge = edgeById("e-depot-j1");
  return {
    fromNodeId: DEPOT_NODE_ID,
    currentEdgeId: startEdge.id,
    edgeT: 0,
    speed: 0,
    edgesTraveled: [startEdge.id],
    elapsed: 0,
    finished: false,
    finishTime: null,
  };
}

export function playerForwardEdgeT(state: PlayerRunState): number {
  const edge = edgeById(state.currentEdgeId);
  return edge.from === state.fromNodeId ? state.edgeT : 1 - state.edgeT;
}

export function playerWorldXZ(state: PlayerRunState): readonly [number, number] {
  const edge = edgeById(state.currentEdgeId);
  return worldXZ(edge, playerForwardEdgeT(state));
}

export function upcomingEdgesForPlayer(state: PlayerRunState, throwStates: ThrowStates, maxHops = 14): readonly EdgeId[] {
  if (state.finished) return [];
  const currentEdge = edgeById(state.currentEdgeId);
  const aheadNode = otherEndpoint(currentEdge, state.fromNodeId);
  return previewRoute(aheadNode, state.currentEdgeId, throwStates, maxHops).edgeIds;
}

export function remainingRouteDistance(state: PlayerRunState, throwStates: ThrowStates): number {
  if (state.finished) return 0;
  const currentEdge = edgeById(state.currentEdgeId);
  const remainingOnCurrent = (1 - playerForwardEdgeT(state)) * edgeLength(currentEdge);
  return upcomingEdgesForPlayer(state, throwStates).reduce((sum, id) => sum + edgeLength(edgeById(id)), remainingOnCurrent);
}

export function playerHeading(state: PlayerRunState): number {
  const edge = edgeById(state.currentEdgeId);
  const direction: 1 | -1 = edge.from === state.fromNodeId ? 1 : -1;
  return headingAlongEdge(edge, direction);
}

export function nextJunctionAhead(state: PlayerRunState, throwStates: ThrowStates): NodeId | null {
  if (state.finished) return null;
  const currentEdge = edgeById(state.currentEdgeId);
  const aheadNode = otherEndpoint(currentEdge, state.fromNodeId);
  const preview = previewRoute(aheadNode, state.currentEdgeId, throwStates, 12);
  const candidateIds = [aheadNode, ...preview.nodeIds.slice(1)];
  for (const id of candidateIds) if (JUNCTION_IDS.has(id)) return id;
  return null;
}

function nextSpeed(speed: number, dt: number, input: PlayerInput): number {
  let next = speed;
  if (input.brake) {
    next -= BRAKE_PER_SEC * dt;
  } else if (input.throttle) {
    next += ACCEL_PER_SEC * dt;
    if (next > MAX_SPEED) next = Math.max(MAX_SPEED, speed - FRICTION_PER_SEC * dt);
  } else {
    next -= FRICTION_PER_SEC * dt;
  }
  next += input.pumpBonus;
  if (next > PUMP_SPEED_CAP) next = PUMP_SPEED_CAP;
  if (next < 0) next = 0;
  return next;
}

export function advancePlayerRun(state: PlayerRunState, dt: number, input: PlayerInput, throwStates: ThrowStates): PlayerRunState {
  if (state.finished || dt <= 0) return state;

  let speed = nextSpeed(state.speed, dt, input);
  let fromNodeId = state.fromNodeId;
  let currentEdgeId = state.currentEdgeId;
  let edgeT = state.edgeT;
  const edgesTraveled = [...state.edgesTraveled];
  let remainingDistance = speed * dt;
  let finished = false;
  let guard = 30;

  while (remainingDistance > 1e-9 && !finished && guard > 0) {
    guard -= 1;
    const edge = edgeById(currentEdgeId);
    const length = edgeLength(edge);
    const distanceOnEdge = edgeT * length;
    const distanceToEnd = length - distanceOnEdge;
    if (remainingDistance < distanceToEnd) {
      edgeT += remainingDistance / length;
      remainingDistance = 0;
    } else {
      remainingDistance -= distanceToEnd;
      const arrivedNode = otherEndpoint(edge, fromNodeId);
      if (arrivedNode === TERMINUS_NODE_ID) {
        fromNodeId = arrivedNode;
        edgeT = 1;
        finished = true;
        break;
      }
      const next = nextEdge(arrivedNode, currentEdgeId, throwStates);
      if (next === null) {
        edgeT = 1;
        finished = true;
        break;
      }
      fromNodeId = arrivedNode;
      currentEdgeId = next.id;
      edgesTraveled.push(next.id);
      edgeT = 0;
    }
  }

  return {
    fromNodeId,
    currentEdgeId,
    edgeT,
    speed,
    edgesTraveled,
    elapsed: state.elapsed + dt,
    finished,
    finishTime: finished ? state.elapsed + dt : null,
  };
}
