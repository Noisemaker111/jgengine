import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { entityById } from "./content";
import { isSideHit, isStomp, patrolStep, reachedGoal, type PatrolState } from "./physics";
import {
  BACKDROP_PLATFORMS,
  ENEMIES,
  ENEMY,
  GOAL_OBJECT,
  GOAL_X,
  PLATFORM_OBJECT,
  PLAYER,
  SPAWN,
  STATUS_FEED,
  HIT_INVULN_SEC,
} from "./tuning";

interface LevelState {
  won: boolean;
  lost: boolean;
  lastHitAt: number;
  patrols: Map<string, PatrolState>;
}

const level: LevelState = {
  won: false,
  lost: false,
  lastHitAt: Number.NEGATIVE_INFINITY,
  patrols: new Map(),
};

function setupWorld(ctx: GameContext): void {
  for (const platform of BACKDROP_PLATFORMS) {
    ctx.scene.object.place(PLATFORM_OBJECT, platform.x, platform.y, platform.z);
  }
  ctx.scene.object.place(GOAL_OBJECT, GOAL_X, 2, 0);
  for (const enemy of ENEMIES) {
    ctx.scene.entity.spawn(ENEMY, { id: enemy.id, position: [enemy.center, 0, 0], role: "npc" });
    level.patrols.set(enemy.id, { x: enemy.center, dir: 1 });
  }
}

export function onInit(ctx: GameContext): void {
  level.won = false;
  level.lost = false;
  level.lastHitAt = Number.NEGATIVE_INFINITY;
  level.patrols.clear();

  ctx.game.events.on("entity.died", (event) => {
    if (event.instanceId === ctx.player.userId) {
      level.lost = true;
      ctx.game.feed.push(STATUS_FEED, { result: "lost" });
    }
  });

  setupWorld(ctx);
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(PLAYER, { id: ctx.player.userId, position: SPAWN, role: "player" });
}

export function onTick(ctx: GameContext, dt: number): void {
  if (level.won || level.lost) return;

  const playerId = ctx.player.userId;
  const player = ctx.scene.entity.get(playerId);
  if (player === null) return;

  const px = player.position[0];
  const py = player.position[1];
  const verticalVelocity = player.velocity[1];
  const now = ctx.time.now();

  for (const config of ENEMIES) {
    const enemy = ctx.scene.entity.get(config.id);
    const patrol = level.patrols.get(config.id);
    if (enemy === null || patrol === undefined) continue;

    const next = patrolStep(patrol, config.center, config.span, config.speed, dt);
    level.patrols.set(config.id, next);
    ctx.scene.entity.setPose(config.id, {
      position: [next.x, 0, 0],
      rotationY: next.dir >= 0 ? Math.PI / 2 : -Math.PI / 2,
      dt,
    });

    const enemyBody = { x: next.x, y: enemy.position[1] };
    const playerBody = { x: px, y: py };

    if (isStomp(playerBody, verticalVelocity, enemyBody)) {
      ctx.scene.entity.despawn(config.id);
      level.patrols.delete(config.id);
      ctx.scene.entity.stats.delta(playerId, "score", 1);
      ctx.game.feed.push(STATUS_FEED, { result: "stomp" });
      continue;
    }

    if (isSideHit(playerBody, enemyBody) && now - level.lastHitAt >= HIT_INVULN_SEC) {
      level.lastHitAt = now;
      ctx.scene.entity.effect({ from: config.id, to: playerId, effect: "damage", via: { amount: 1 } });
    }
  }

  if (reachedGoal(px)) {
    level.won = true;
    ctx.game.feed.push(STATUS_FEED, { result: "won" });
  }
}

export const content = { entityById };
