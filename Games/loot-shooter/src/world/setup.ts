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

interface GroundLootSpawn {
  itemId: string;
  rarity: string;
  baseType: string;
  position: EntityPosition;
}

export const GROUND_LOOT: GroundLootSpawn[] = [
  { itemId: "ammo_cell", rarity: "common", baseType: "resource", position: [-2, 0, 4] },
  { itemId: "shock_carbine", rarity: "rare", baseType: "weapon", position: [1.4, 0, 4.5] },
  { itemId: "stormcaller", rarity: "legendary", baseType: "weapon", position: [0, 0, 6] },
];

function spawnGroundLoot(ctx: GameContext): void {
  for (const drop of GROUND_LOOT) {
    ctx.scene.worldItem.spawn({
      itemId: drop.itemId,
      position: drop.position,
      rarity: drop.rarity,
      baseType: drop.baseType,
      source: "staged",
    });
  }
}

export function setupWorld(ctx: GameContext): void {
  for (const spawn of MOB_SPAWNS) spawnMob(ctx, spawn);
  spawnGroundLoot(ctx);
}
