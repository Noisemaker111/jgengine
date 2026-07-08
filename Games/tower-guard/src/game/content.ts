import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { BASE_CATALOG_ID, STARTING_LIVES } from "./entities/base/catalog";
import { CREEP_CATALOG } from "./entities/enemies/catalog";

function creepEntry(id: string): GameContextEntityEntry {
  const def = CREEP_CATALOG[id]!;
  return {
    role: "enemy",
    stats: { health: { max: def.health } },
    receive: { damage: { order: ["health"] } },
  };
}

const ENTITY_ENTRIES: Record<string, GameContextEntityEntry> = {
  [BASE_CATALOG_ID]: {
    role: "npc",
    stats: { lives: { max: STARTING_LIVES } },
    receive: { leak: { order: ["lives"] } },
  },
  ...Object.fromEntries(Object.keys(CREEP_CATALOG).map((id) => [id, creepEntry(id)])),
};

export const content: GameContextContent = {
  entityById(catalogId) {
    return ENTITY_ENTRIES[catalogId] ?? null;
  },
};
