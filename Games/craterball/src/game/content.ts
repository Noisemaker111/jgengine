import type { GameContextContent, GameContextEntityEntry, GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";
import { entityCatalog } from "./entities/catalog";
import { objectCatalog } from "./objects/catalog";

export const content: GameContextContent = {
  entityById(catalogId: string): GameContextEntityEntry | null {
    const entry = entityCatalog[catalogId];
    if (entry === undefined) return null;
    return { movement: entry.movement, role: entry.role };
  },
  objectById(catalogId: string): GameContextObjectEntry | null {
    return objectCatalog[catalogId] === undefined ? null : {};
  },
};
