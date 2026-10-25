import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { CREEP_CATALOG } from "./entities/enemies/catalog";

function creepEntry(id: string): GameContextEntityEntry {
  const def = CREEP_CATALOG[id]!;
  return {
    role: "enemy",
    scale: def.scale,
    // A ward lives in its own stat, so the HUD can draw it and a boss can raise one mid-fight.
    stats: { health: { max: def.health }, shield: { max: def.shield?.max ?? 0 } },
    receive: { damage: { order: ["health"] } },
  };
}

/** The keep is scenery the raiders walk to; its lives are a world fact (`keep.lives`), not an entity stat. */
function baseEntry(): GameContextEntityEntry {
  return { role: "npc" };
}

export const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId === BASE_CATALOG_ID) return baseEntry();
    if (CREEP_CATALOG[catalogId] !== undefined) return creepEntry(catalogId);
    return null;
  },
};
