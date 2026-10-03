import type { GameContext } from "../runtime/gameContextTypes";
import type { MotionIntents } from "../runtime/motionIntents";
import type { Vec3 } from "../vfx/particles";

/** The game selects affected players, coupling, target bits and its acceleration limit. */
export interface EnvironmentMotionTarget {
  entityId: string;
  motion: Pick<MotionIntents, "impulse" | "pushHorizontal">;
  /** Wind coupling in 1/second; supported range 0..1e12. */
  windResponse: number;
  /** Maximum combined acceleration in metres/second²; supported range 0..1e12. */
  maxAcceleration: number;
  mask?: number;
  /** Opt into authored shelter exposure scaling for wind and localized forces. */
  sheltered?: boolean;
}

/** Inject authoritative spatial forces before existing movement consumes its motion intents.
 * @capability environment-motion apply capped spatial wind and vortex forces to game-selected actors through shared motion intents
 */
export function installEnvironmentMotion(ctx: GameContext, options: { targets: () => readonly EnvironmentMotionTarget[]; maxTargets?: number }): () => void {
  const limit = options.maxTargets ?? 64;
  if (!Number.isInteger(limit) || limit < 1 || limit > 4096) throw new Error("environment motion target budget must be an integer in 1..4096");
  const seen = new Set<string>();
  const pending: { target: EnvironmentMotionTarget; acceleration: Vec3; exposure: number }[] = [];
  return ctx.sim.addStage({
    id: "environment-motion",
    phase: "beforeMovement",
    run(_realDt, _tick, gameDt) {
      if (gameDt <= 0) return;
      const targets = options.targets();
      if (targets.length > limit) throw new Error("environment motion target budget exceeded");
      seen.clear();
      pending.length = 0;
      for (const target of targets) {
        if (!target || typeof target.entityId !== "string" || target.entityId.length === 0 || typeof target.motion?.pushHorizontal !== "function" || typeof target.motion?.impulse !== "function") throw new Error("environment motion target requires an entity id and motion sink");
        if (seen.has(target.entityId)) throw new Error(`duplicate environment motion target ${target.entityId}`);
        seen.add(target.entityId);
        const entity = ctx.scene.entity.get(target.entityId);
        if (entity === null) continue;
        const acceleration = ctx.environment.accelerationAt(entity.position, ctx.time.now(), target.windResponse, target.maxAcceleration, target.mask ?? 0);
        const exposure = target.sheltered === true ? ctx.environment.exposureAt(...entity.position) : 1;
        pending.push({ target, acceleration, exposure });
      }
      for (const { target, acceleration, exposure } of pending) {
        if (acceleration[0] !== 0 || acceleration[2] !== 0) target.motion.pushHorizontal(acceleration[0] * gameDt * exposure, acceleration[2] * gameDt * exposure);
        if (acceleration[1] !== 0) target.motion.impulse(acceleration[1] * gameDt * exposure);
      }
    },
  });
}
