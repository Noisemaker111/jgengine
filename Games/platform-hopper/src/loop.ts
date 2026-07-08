import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { entityById } from "./content";
import {
  isCoinCollected,
  isHazardHit,
  isSideHit,
  isStomp,
  patrolStep,
  reachedGoal,
  type PatrolState,
} from "./physics";
import {
  BACKDROP_PLATFORMS,
  COIN_OBJECT,
  COIN_SCORE,
  COINS,
  ENEMIES,
  ENEMY,
  GOAL_OBJECT,
  GOAL_X,
  GROUND_Y,
  HAZARD_OBJECT,
  HAZARDS,
  HIT_INVULN_SEC,
  MAX_HEALTH,
  PLATFORM_OBJECT,
  PLAYER,
  SPAWN,
  STATUS_FEED,
  STOMP_SCORE,
} from "./tuning";

interface LevelState {
  won: boolean;
  lost: boolean;
  lastHitAt: number;
  patrols: Map<string, PatrolState>;
  coinInstances: Map<string, string>;
}

const level: LevelState = {
  won: false,
  lost: false,
  lastHitAt: Number.NEGATIVE_INFINITY,
  patrols: new Map(),
  coinInstances: new Map(),
};

function setupWorld(ctx: GameContext): void {
  for (const platform of BACKDROP_PLATFORMS) {
    ctx.scene.object.place(PLATFORM_OBJECT, platform.x, platform.y, platform.z);
  }
  ctx.scene.object.place(GOAL_OBJECT, GOAL_X, 2, 0);
  for (const hazard of HAZARDS) {
    ctx.scene.object.place(HAZARD_OBJECT, hazard.x, GROUND_Y, 0);
  }
}

function resetLevel(ctx: GameContext): void {
  level.won = false;
  level.lost = false;
  level.lastHitAt = Number.NEGATIVE_INFINITY;

  for (const config of ENEMIES) {
    ctx.scene.entity.despawn(config.id);
    ctx.scene.entity.spawn(ENEMY, { id: config.id, position: [config.center, 0, 0], role: "npc" });
    level.patrols.set(config.id, { x: config.center, dir: 1 });
  }

  for (const coin of COINS) {
    const existing = level.coinInstances.get(coin.id);
    if (existing !== undefined) ctx.scene.object.remove(existing);
    level.coinInstances.set(coin.id, ctx.scene.object.place(COIN_OBJECT, coin.x, coin.y, 0));
  }
}

function respawnPlayer(ctx: GameContext): void {
  const playerId = ctx.player.userId;
  if (ctx.scene.entity.get(playerId) === null) {
    ctx.scene.entity.spawn(PLAYER, { id: playerId, position: SPAWN, role: "player" });
    return;
  }
  ctx.scene.entity.setPose(playerId, { position: SPAWN, rotationY: 0 });
  ctx.scene.entity.stats.set(playerId, "health", { current: MAX_HEALTH });
  ctx.scene.entity.stats.set(playerId, "score", { current: 0 });
}

export function onInit(ctx: GameContext): void {
  ctx.game.events.on("entity.died", (event) => {
    if (event.instanceId === ctx.player.userId) {
      level.lost = true;
      ctx.game.feed.push(STATUS_FEED, { result: "lost" });
    }
  });

  ctx.game.commands.define("restart", {
    apply(state) {
      resetLevel(state);
      respawnPlayer(state);
      return state;
    },
  });

  setupWorld(ctx);
  resetLevel(ctx);
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
  const playerBody = { x: px, y: py };

  const tryHit = (): boolean => {
    if (now - level.lastHitAt < HIT_INVULN_SEC) return false;
    level.lastHitAt = now;
    return true;
  };

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

    if (isStomp(playerBody, verticalVelocity, enemyBody)) {
      ctx.scene.entity.despawn(config.id);
      level.patrols.delete(config.id);
      ctx.scene.entity.stats.delta(playerId, "score", STOMP_SCORE);
      ctx.game.feed.push(STATUS_FEED, { result: "stomp" });
      continue;
    }

    if (isSideHit(playerBody, enemyBody) && tryHit()) {
      ctx.scene.entity.effect({ from: config.id, to: playerId, effect: "damage", via: { amount: 1 } });
    }
  }

  for (const hazard of HAZARDS) {
    if (isHazardHit(playerBody, { x: hazard.x, y: GROUND_Y }) && tryHit()) {
      ctx.scene.entity.effect({ from: playerId, to: playerId, effect: "damage", via: { amount: 1 } });
      break;
    }
  }

  for (const coin of COINS) {
    const instanceId = level.coinInstances.get(coin.id);
    if (instanceId === undefined) continue;
    if (isCoinCollected(playerBody, coin)) {
      ctx.scene.object.remove(instanceId);
      level.coinInstances.delete(coin.id);
      ctx.scene.entity.stats.delta(playerId, "score", COIN_SCORE);
      ctx.scene.entity.floatText({ instanceId: playerId, text: `+${COIN_SCORE}`, kind: "info" });
    }
  }

  if (reachedGoal(px)) {
    level.won = true;
    ctx.game.feed.push(STATUS_FEED, { result: "won" });
  }
}

export const content = { entityById };
