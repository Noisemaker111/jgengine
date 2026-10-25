import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { pursue } from "@jgengine/core/scene/behaviors";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import { guardPosts, type GuardPost } from "./places";
import { fact, ops } from "./spec";

/**
 * The guards: one per `guard` marker, standing at their outpost until you come close or shoot one.
 * The engine's pursue behaviour walks them into range; here they only decide when to shoot back.
 */

const posts = guardPosts(editorLayers);
const postById = new Map(posts.map((post) => [post.id, post]));
const enemyById = new Map(idea.enemies.map((enemy) => [enemy.id, enemy]));

/** Seconds each guard waits before its next shot. */
const cooldowns = perContext((_ctx: GameContext) => new Map<string, number>());

export const isGuard = (id: string) => postById.has(id);
export const guardPost = (id: string): GuardPost | null => postById.get(id) ?? null;

export const cleared = (ctx: GameContext, outpost: string) => ops.of(ctx).fact(fact(`${outpost}_clear`)) === true;

/** Guards still standing at an outpost; `falling` is one dying this frame, not yet gone from the scene. */
export function standing(ctx: GameContext, outpost: string, falling?: string): number {
  return posts.filter((post) => post.outpost === outpost && post.id !== falling && ctx.scene.entity.get(post.id) !== null).length;
}

/** Fill every outpost that is not cleared with a fresh garrison (a new run, or a retry from a save). */
export function garrison(ctx: GameContext): void {
  cooldowns(ctx).clear();
  for (const post of posts) {
    ctx.scene.entity.despawn(post.id);
    if (cleared(ctx, post.outpost)) continue;
    const enemy = enemyById.get(post.enemy);
    if (enemy === undefined) continue;
    ctx.scene.entity.spawn(enemy.id, {
      id: post.id,
      position: [post.x, ctx.world.groundHeightAt(post.x, post.z), post.z],
      rotationY: post.rotationY,
      role: "npc",
      behaviors: [
        pursue({ aggroRadius: Math.max(26, enemy.range + 8), reach: enemy.range * 0.7, leashRange: 60, speed: enemy.speed, attack: { effect: "damage", amount: 0, intervalSec: 999 } }),
      ],
    });
  }
}

const chest = (position: EntityPosition, lift: number): EntityPosition => [position[0], position[1] + lift, position[2]];

/** Each guard close enough and with a clear line fires at the player on its own clock. */
export function guardsShoot(ctx: GameContext, dt: number): void {
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me === null) return;
  const waits = cooldowns(ctx);
  for (const post of posts) {
    const body = ctx.scene.entity.get(post.id);
    if (body === null) continue;
    const enemy = enemyById.get(post.enemy)!;
    const wait = (waits.get(post.id) ?? enemy.every * (0.5 + (post.id.length % 5) / 5)) - dt;
    waits.set(post.id, wait);
    if (wait > 0) continue;
    const distance = Math.hypot(me.position[0] - body.position[0], me.position[2] - body.position[2]);
    const alerted = ctx.scene.entity.getTarget(post.id) === ctx.player.userId;
    if (distance > enemy.range && !(alerted && distance < enemy.range * 1.6)) continue;
    if (!ctx.scene.entity.hasLineOfSight(post.id, ctx.player.userId)) continue;
    waits.set(post.id, enemy.every);
    const origin = chest(body.position, (enemy.model.height ?? 1.8) * 0.7);
    const target = chest(me.position, 1.2);
    const direction: EntityPosition = [target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]];
    ctx.scene.entity.setPose(post.id, { position: body.position, rotationY: Math.atan2(direction[0], direction[2]) });
    ctx.game.playEntityAnimation(post.id, "attack");
    const shot = ctx.scene.entity.fireProjectile({
      from: post.id,
      via: { item: `${enemy.id}_gun`, amount: enemy.damage },
      aim: { origin, direction, spread: enemy.spread },
      effect: "damage",
    });
    ctx.time.after(Math.min(0.4, distance / 60), () => void ctx.scene.entity.settleProjectile(shot));
  }
}
