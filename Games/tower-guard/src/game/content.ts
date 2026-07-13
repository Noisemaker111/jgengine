import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { BASE_CATALOG_ID, STARTING_LIVES } from "./entities/base/catalog";
import { CREEP_CATALOG } from "./entities/enemies/catalog";

function creepEntry(id: string): GameContextEntityEntry {
  const def = CREEP_CATALOG[id]!;
  return {
    role: "enemy",
    scale: def.scale,
    stats: { health: { max: def.health } },
    receive: { damage: { order: ["health"] } },
  };
}

function baseEntry(): GameContextEntityEntry {
  return {
    role: "npc",
    stats: { lives: { max: STARTING_LIVES } },
    receive: { leak: { order: ["lives"] } },
  };
}

export const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId === BASE_CATALOG_ID) return baseEntry();
    if (CREEP_CATALOG[catalogId] !== undefined) return creepEntry(catalogId);
    return null;
  },
};
