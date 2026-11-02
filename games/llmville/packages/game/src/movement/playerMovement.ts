import { cellsForBounds } from "@llmville/game/datacenter/grid";
import { isStructuralColumnCell } from "@llmville/game/datacenter/layout";
import { PLAYER_COLLISION_RADIUS, type RoomBounds } from "@llmville/game/world/grid";

export interface PlayerPosition {
  x: number;
  z: number;
}

/** Soft overlap radius for player-vs-player — blocks the mover, never displaces others. */
export const PLAYER_PRESENCE_RADIUS = 0.38;

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

type Point3 = readonly [number, number, number];

/**
 * The shell's movement commit hook for LLMville's standing rule: a step into a structural column or
 * another player keeps the open axis, else stays put. Undefined accepts the step as proposed.
 */
export function standingStep(
  current: Point3,
  next: Point3,
  otherPlayers: readonly PlayerPosition[],
): [number, number, number] | undefined {
  if (canStandAt({ x: next[0], z: next[2] }, otherPlayers)) return undefined;
  if (canStandAt({ x: next[0], z: current[2] }, otherPlayers)) return [next[0], next[1], current[2]];
  if (canStandAt({ x: current[0], z: next[2] }, otherPlayers)) return [current[0], next[1], next[2]];
  return [current[0], next[1], current[2]];
}
