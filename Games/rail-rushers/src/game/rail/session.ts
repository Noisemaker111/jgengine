import { defaultThrowStates, edgeById, edgeLength, type NodeId, type ThrowState, type ThrowStates } from "./network";
import { advancePlayerRun, createPlayerRun, nextJunctionAhead, playerForwardEdgeT, type PlayerRunState } from "./movement";
import { classifyPump } from "./pump";
import { applyWreck, createWreckState, evaluateOutcome, expressDeadlineSeconds, type RunOutcome, type WreckState } from "./raceOutcome";
import { TRAINS, trainPositionAt } from "./schedule";

export const COLLISION_DISTANCE = 3.5;

export interface RunSession {
  player: PlayerRunState;
  throwStates: ThrowStates;
  wreck: WreckState;
  deadlineSeconds: number;
  lastPumpPressAt: number | null;
  pendingPumpBonus: number;
  lastPumpTierId: string | null;
  outcome: RunOutcome;
}

export function createRunSession(): RunSession {
  return {
    player: createPlayerRun(),
    throwStates: defaultThrowStates(),
    wreck: createWreckState(),
    deadlineSeconds: expressDeadlineSeconds(),
    lastPumpPressAt: null,
    pendingPumpBonus: 0,
    lastPumpTierId: null,
    outcome: { status: "racing" },
  };
}

export function resetSession(): RunSession {
  return createRunSession();
}

export function throwJunction(session: RunSession, nodeId: NodeId): RunSession {
  const current: ThrowState = session.throwStates[nodeId] ?? "normal";
  return { ...session, throwStates: { ...session.throwStates, [nodeId]: current === "normal" ? "reverse" : "normal" } };
}

export function throwNextJunctionAhead(session: RunSession): RunSession {
  const nodeId = nextJunctionAhead(session.player, session.throwStates);
  if (nodeId === null) return session;
  return throwJunction(session, nodeId);
}

export function registerThrottlePress(session: RunSession, now: number): RunSession {
  if (session.lastPumpPressAt === null) return { ...session, lastPumpPressAt: now };
  const interval = now - session.lastPumpPressAt;
  const tier = classifyPump(interval);
  return { ...session, lastPumpPressAt: now, pendingPumpBonus: tier.speedBonus, lastPumpTierId: tier.id };
}

const DEPOT_DEPARTURE_EDGE_ID = "e-depot-j1";

function detectCollision(player: PlayerRunState, now: number): { reason: string; edgeId: string } | null {
  if (player.currentEdgeId === DEPOT_DEPARTURE_EDGE_ID) return null;
  const edge = edgeById(player.currentEdgeId);
  const playerForwardT = playerForwardEdgeT(player);
  const length = edgeLength(edge);
  for (const train of TRAINS) {
    const pose = trainPositionAt(train, now);
    if (pose.edgeId !== player.currentEdgeId) continue;
    const distance = Math.abs(pose.edgeT - playerForwardT) * length;
    if (distance <= COLLISION_DISTANCE) return { reason: train.name, edgeId: player.currentEdgeId };
  }
  return null;
}

export interface TickInput {
  throttle: boolean;
  brake: boolean;
}

export function tickSession(session: RunSession, dt: number, input: TickInput, now: number): RunSession {
  if (session.outcome.status !== "racing") return session;

  const player = advancePlayerRun(
    session.player,
    dt,
    { throttle: input.throttle, brake: input.brake, pumpBonus: session.pendingPumpBonus },
    session.throwStates,
  );

  const collision = detectCollision(player, now);
  const wreck = collision === null ? session.wreck : applyWreck(session.wreck, collision.reason, collision.edgeId);

  const outcome = evaluateOutcome({
    finished: player.finished,
    finishTime: player.finishTime,
    elapsed: player.elapsed,
    wreck,
    deadlineSeconds: session.deadlineSeconds,
  });

  return { ...session, player, wreck, outcome, pendingPumpBonus: 0 };
}
