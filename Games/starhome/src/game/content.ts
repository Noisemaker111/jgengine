import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";

import { ALIEN_KIND, ALIEN_STATS } from "./entities/aliens/catalog";
import { objectEntries } from "./objects/catalog";

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId !== ALIEN_KIND) return null;
  return { stats: ALIEN_STATS, movement: { poses: ["standing"], walkSpeed: 2.4 }, role: "npc" };
}

function objectById(catalogId: string): GameContextObjectEntry | null {
  return objectEntries[catalogId] ?? null;
}

export const content: GameContextContent = { entityById, objectById };
