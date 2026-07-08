import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { advanceSpawnDirector } from "@jgengine/core/ai/spawnDirector";
import { advancePathFollow, createPathFollow } from "@jgengine/core/nav/pathFollow";

import { BASE_ENTITY_ID } from "../entities/base/catalog";
import { creepDef } from "../entities/enemies/catalog";
import { session, nextCreepInstanceId, newSpeedStats } from "../session";
import { SPAWN_DIRECTOR_CONFIG } from "./manifest";
import { PATH_WAYPOINTS } from "../world/path";

const LEAK_EFFECT = "leak";

function spawnCreep(ctx: GameContext, catalogId: string): void {
  const def = creepDef(catalogId);
  const instanceId = nextCreepInstanceId();
  ctx.scene.entity.spawn(catalogId, {
    id: instanceId,
    position: PATH_WAYPOINTS[0]!,
    role: "npc",
  });
  session.creeps.set(instanceId, {
    instanceId,
    catalogId,
    path: createPathFollow({ waypoints: PATH_WAYPOINTS, speed: def.speed }),
    speedStats: newSpeedStats(def.speed),
  });
}

function leakCreep(ctx: GameContext, instanceId: string, catalogId: string): void {
  const def = creepDef(catalogId);
  ctx.scene.entity.effect({
    from: instanceId,
    to: BASE_ENTITY_ID,
    effect: LEAK_EFFECT,
    via: { amount: def.leak },
  });
  ctx.scene.entity.despawn(instanceId);
  session.creeps.delete(instanceId);
}

export function tickWaves(ctx: GameContext, dt: number): void {
  if (session.gameOver) return;

  const step = advanceSpawnDirector(SPAWN_DIRECTOR_CONFIG, session.director, dt, {
    alive: session.creeps.size,
    players: 1,
  });
  session.director = step.state;
  for (const spawn of step.spawns) spawnCreep(ctx, spawn.entryId);

  const now = ctx.time.now();
  for (const creep of Array.from(session.creeps.values())) {
    const speed = creep.speedStats.get("speed", now);
    const next = advancePathFollow({ waypoints: PATH_WAYPOINTS, speed }, creep.path, dt);
    creep.path = next;
    ctx.scene.entity.setPose(creep.instanceId, { position: next.position, rotationY: next.heading, dt });
    if (next.done) leakCreep(ctx, creep.instanceId, creep.catalogId);
  }

  if (session.director.done && session.creeps.size === 0) session.victory = true;
}
