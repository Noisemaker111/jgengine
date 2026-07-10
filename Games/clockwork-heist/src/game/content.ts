import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { GUARD_CATALOG_KIND } from "./entities/guards";
import { NORMAL_WALK_SPEED, PLAYER_CATALOG_KIND } from "./entities/player";

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId === PLAYER_CATALOG_KIND) {
    return { role: "player", movement: { walkSpeed: NORMAL_WALK_SPEED } };
  }
  if (catalogId === GUARD_CATALOG_KIND) {
    return { role: "npc" };
  }
  return null;
}

export const content: GameContextContent = {
  entityById,
};
