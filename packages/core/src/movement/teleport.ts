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

/** What {@link teleportPlayer} did: the entity that moved, or why nothing moved. */
export type TeleportResult = { ok: true; entity: string } | { ok: false; error: string };

/**
 * Move a player to a point in one frame: the body they control (their mount while riding, so the rider comes
 * along on the seat), facing `yaw`, with the camera swung round behind. The walk controller's carried velocity
 * and capsule are dropped so the next step starts from rest at the new spot instead of pulling the body back,
 * and the renderer snaps rather than gliding across the map. A body a game sim poses every tick
 * (`ctx.scene.entity.bind(key).sync`, such as a car the game drives itself) moves only through that bind's
 * `onTeleport` handler, since the next sync would put it back. The result names the entity that moved, or says
 * why nothing did: no body yet, or a sim that owns the pose and took no teleport.
 *
 * @capability teleport-player move a player (or the mount they ride) to a point and face their camera along a heading
 */
export function teleportPlayer(ctx: GameContext, userId: string, to: TeleportTarget): TeleportResult {
  if (![to.x, to.z, to.y ?? 0, to.yaw ?? 0].every(Number.isFinite)) {
    throw new RangeError(`teleportPlayer: every coordinate must be a finite number (got ${JSON.stringify(to)})`);
  }
  const bodyId = ctx.player.possession.active(userId);
  const body = ctx.scene.entity.get(bodyId);
  if (body === null) return { ok: false, error: "the player has no body to teleport yet" };
  const y = to.y ?? ctx.world.groundHeightAt(to.x, to.z);
  const position: [number, number, number] = [to.x, y, to.z];
  const owner = ctx.scene.entity.bindOf(bodyId);
  if (owner !== null && !owner.teleport(bodyId, { position, ...(to.yaw === undefined ? {} : { rotationY: to.yaw }) })) {
    return {
      ok: false,
      error: `${bodyId} is posed every tick by the game's sim (scene.entity.bind), which took no teleport: the bind has no onTeleport handler or refused this spot`,
    };
  }
  ctx.scene.entity.setPose(bodyId, { position, ...(to.yaw === undefined ? {} : { rotationY: to.yaw }) });
  ctx.scene.entity.setVelocity(bodyId, [0, 0, 0]);
  ctx.sim.snapPose(bodyId);
  forgetPlayerMovement(ctx, userId);
  if (to.yaw !== undefined && userId === ctx.player.userId) ctx.camera.turnTo(to.yaw);
  return { ok: true, entity: bodyId };
}
