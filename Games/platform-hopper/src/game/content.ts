import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { ENEMY, MAX_HEALTH, PLAYER } from "./tuning";

export function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId === PLAYER) {
    return {
      stats: {
        health: { max: MAX_HEALTH, min: 0 },
        score: { max: 999, min: 0, current: 0 },
      },
      receive: { damage: { order: ["health"] } },
      movement: { walkSpeed: 3.4 },
      role: "player",
    };
  }
  if (catalogId === ENEMY) {
    return {
      stats: { health: { max: 1, min: 0 } },
      receive: { damage: { order: ["health"] } },
      role: "enemy",
    };
  }
  return null;
}
