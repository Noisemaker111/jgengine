import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { HEROES } from "./entities/players/catalog";
import { objectCatalog, type ObjectId } from "./objects/catalog";
import type { HeroId } from "./types";

function entityById(id: string): GameContextEntityEntry | null {
  const hero = HEROES[id as HeroId];
  if (hero === undefined) return null;
  return { stats: hero.stats, movement: { poses: ["standing"], walkSpeed: hero.walkSpeed }, role: "player" };
}

export const content: GameContextContent = {
  entityById,
  objectById: (id) => objectCatalog[id as ObjectId] ?? null,
};
