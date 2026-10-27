import type { GameContext } from "../runtime/gameContext";
import { forgetPlayerMovement } from "./playerMovement";

/** Where {@link teleportPlayer} puts a player: a ground point, an optional height (default the ground there) and an optional facing. */
export interface TeleportTarget {
  x: number;
  z: number;
  /** Feet height; default `ctx.world.groundHeightAt(x, z)`. */
  y?: number;
  /** Facing in `rotationY` terms; the camera turns to it too. Default: keep the current facing. */
  yaw?: number;
}

/**
 * Move a player to a point in one frame: the body they control (their mount while riding, so the rider comes
 * along on the seat), facing `yaw`, with the camera swung round behind. The walk controller's carried velocity
 * and capsule are dropped so the next step starts from rest at the new spot instead of pulling the body back,
 * and the renderer snaps rather than gliding across the map. Returns the id of the entity that moved, or `null`
 * when the player has no body yet.
 *
 * @capability teleport-player move a player (or the mount they ride) to a point and face their camera along a heading
 */
export function teleportPlayer(ctx: GameContext, userId: string, to: TeleportTarget): string | null {
  if (![to.x, to.z, to.y ?? 0, to.yaw ?? 0].every(Number.isFinite)) {
    throw new RangeError(`teleportPlayer: every coordinate must be a finite number (got ${JSON.stringify(to)})`);
  }
  const bodyId = ctx.player.possession.active(userId);
  const body = ctx.scene.entity.get(bodyId);
  if (body === null) return null;
  const y = to.y ?? ctx.world.groundHeightAt(to.x, to.z);
  ctx.scene.entity.setPose(bodyId, { position: [to.x, y, to.z], ...(to.yaw === undefined ? {} : { rotationY: to.yaw }) });
  ctx.scene.entity.setVelocity(bodyId, [0, 0, 0]);
  ctx.sim.snapPose(bodyId);
  forgetPlayerMovement(ctx, userId);
  if (to.yaw !== undefined && userId === ctx.player.userId) ctx.camera.turnTo(to.yaw);
  return bodyId;
}
