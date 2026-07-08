import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { ENEMY_UNITS } from "./entities/enemies/catalog";
import { PLAYER_UNITS } from "./entities/players/catalog";

function entityEntry(hp: number, role: "player" | "enemy"): GameContextEntityEntry {
  return {
    stats: { health: { max: hp, min: 0 } },
    receive: { damage: { order: ["health"] } },
    role,
  };
}

export const content: GameContextContent = {
  entityById(catalogId) {
    const player = PLAYER_UNITS[catalogId];
    if (player !== undefined) return entityEntry(player.hp, "player");
    const enemy = ENEMY_UNITS[catalogId];
    if (enemy !== undefined) return entityEntry(enemy.hp, "enemy");
    return null;
  },
};
