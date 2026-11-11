import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { enemyById } from "../entities/enemies/catalog";

/** The same earshot the music uses to call a skirmish (`audio/drive.ts`). */
const THREAT_RADIUS = 42;
const last = new WeakMap<GameContext, { at: number; near: boolean }>();

/**
 * True while any hostile machine is within earshot of the reclaimer. The rig keeps its combat
 * readouts at full strength while this holds. Bound readouts ask every frame, so one scan per game
 * tick is shared between them.
 */
export function hostilesNear(ctx: GameContext): boolean {
  const at = ctx.time.now(), cached = last.get(ctx);
  if (cached !== undefined && cached.at === at) return cached.near;
  const me = ctx.scene.entity.get(ctx.player.userId);
  let near = false;
  if (me !== null) for (const entity of ctx.scene.entity.list()) {
    if (enemyById(entity.name) === undefined) continue;
    if (Math.hypot(entity.position[0] - me.position[0], entity.position[2] - me.position[2]) <= THREAT_RADIUS) { near = true; break; }
  }
  last.set(ctx, { at, near });
  return near;
}
