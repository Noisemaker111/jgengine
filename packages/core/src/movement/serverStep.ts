import type { GameContext } from "../runtime/gameContext";
import type { InputFrame } from "../runtime/inputSnapshot";
import { groundFieldFor } from "../world/terrain";
import { stepPlayerMovement, type PlayerMovementTuning } from "./playerMovement";

/** Advance one authoritative player's movement using the same controller as the shell. */
export function serverStep(
  ctx: GameContext,
  userId: string,
  frame: InputFrame,
  dt: number,
  tuning?: PlayerMovementTuning,
): void {
  stepPlayerMovement(ctx, userId, frame, dt, tuning ?? { ground: groundFieldFor(), hasTerrain: false });
}
