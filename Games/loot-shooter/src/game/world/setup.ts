import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { drone_grunt } from "../entities/enemies/catalog";

export const PLAYER_SPAWN: EntityPosition = [0, 0, 0];

export interface MobSpawnPoint {
  catalogId: string;
  position: EntityPosition;
}

// First-person faces +Z at yaw 0; enemies sit directly ahead of spawn.
export const MOB_SPAWNS: MobSpawnPoint[] = [
  { catalogId: drone_grunt.id, position: [0, 0, 9] },
  { catalogId: drone_grunt.id, position: [-3.5, 0, 11] },
  { catalogId: drone_grunt.id, position: [3.5, 0, 11] },
  { catalogId: drone_grunt.id, position: [-2, 0, 13] },
  { catalogId: drone_grunt.id, position: [2, 0, 13] },
  { catalogId: drone_grunt.id, position: [0, 0, 14] },
];

export function spawnMob(ctx: GameContext, spawn: MobSpawnPoint): void {
  ctx.scene.entity.spawn(spawn.catalogId, { position: spawn.position, role: "npc" });
}

export function setupWorld(ctx: GameContext): void {
  for (const spawn of MOB_SPAWNS) spawnMob(ctx, spawn);
}
