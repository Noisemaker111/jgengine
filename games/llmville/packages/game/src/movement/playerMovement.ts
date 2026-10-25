import { cellsForBounds } from "@llmville/game/datacenter/grid";
import { isStructuralColumnCell } from "@llmville/game/datacenter/layout";
import { PLAYER_COLLISION_RADIUS, type RoomBounds } from "@llmville/game/world/grid";

export interface PlayerPosition {
  x: number;
  z: number;
}

/** Soft overlap radius for player-vs-player — blocks the mover, never displaces others. */
export const PLAYER_PRESENCE_RADIUS = 0.38;

export interface GeometryStep {
  stepX: number;
  stepZ: number;
}

/** Slides a step against the engine's solid placed geometry; supplied by the app, which owns the scene. */
export type GeometryStepResolver = (
  from: PlayerPosition,
  stepX: number,
  stepZ: number,
) => GeometryStep;

/** What a step needs beyond placed geometry — all positions in world space. */
export interface PlayerStepContext {
  resolveGeometryStep: GeometryStepResolver;
  otherPlayers: readonly PlayerPosition[];
}

function collidesWithOtherPlayers(
  position: PlayerPosition,
  otherPlayers: readonly PlayerPosition[],
): boolean {
  const minDist = PLAYER_PRESENCE_RADIUS * 2;
  const minDistSq = minDist * minDist;
  for (const other of otherPlayers) {
    const dx = position.x - other.x;
    const dz = position.z - other.z;
    if (dx * dx + dz * dz < minDistSq - 1e-6) {
      return true;
    }
  }
  return false;
}

function playerCollisionBounds(position: PlayerPosition): RoomBounds {
  return {
    minX: position.x - PLAYER_COLLISION_RADIUS,
    maxX: position.x + PLAYER_COLLISION_RADIUS,
    minZ: position.z - PLAYER_COLLISION_RADIUS,
    maxZ: position.z + PLAYER_COLLISION_RADIUS,
  };
}

function collidesWithStructuralColumns(position: PlayerPosition): boolean {
  return cellsForBounds(playerCollisionBounds(position)).some((cell) =>
    isStructuralColumnCell(cell),
  );
}

function canStandAt(position: PlayerPosition, otherPlayers: readonly PlayerPosition[]): boolean {
  return (
    !collidesWithOtherPlayers(position, otherPlayers)
    && !collidesWithStructuralColumns(position)
  );
}

function advanceAxis(
  from: PlayerPosition,
  stepX: number,
  stepZ: number,
  context: PlayerStepContext,
): PlayerPosition {
  if (Math.abs(stepX) < 1e-6 && Math.abs(stepZ) < 1e-6) {
    return from;
  }

  const allowed = context.resolveGeometryStep(from, stepX, stepZ);
  const candidate = { x: from.x + allowed.stepX, z: from.z + allowed.stepZ };
  if (candidate.x === from.x && candidate.z === from.z) {
    return from;
  }

  return canStandAt(candidate, context.otherPlayers) ? candidate : from;
}

/** Commit one collision-resolved step in world coordinates. */
export function stepPlayer(
  current: PlayerPosition,
  deltaX: number,
  deltaZ: number,
  context: PlayerStepContext,
): PlayerPosition {
  return advanceAxis(advanceAxis(current, deltaX, 0, context), 0, deltaZ, context);
}
