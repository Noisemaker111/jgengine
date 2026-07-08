import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const PLAYER_KIND = "outrider";
export const BASE_MAX_HEALTH = 100;
export const BASE_WALK_SPEED = 6.4;

export function playerEntityCatalog(): Record<string, GameContextEntityEntry> {
  return {
    [PLAYER_KIND]: {
      role: "player",
      movement: { walkSpeed: BASE_WALK_SPEED },
      stats: {
        health: { max: BASE_MAX_HEALTH, min: 0 },
        xp: { max: 1, min: 0, current: 0 },
        level: { max: 40, min: 1, current: 1 },
      },
      receive: { hit: { order: ["health"] } },
    },
  };
}
