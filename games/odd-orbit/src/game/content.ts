import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextObjectEntry,
} from "@jgengine/core/runtime/gameContext";

import { ALIEN_KIND, ALIEN_STATS } from "./entities/aliens/catalog";
import { DECOR, objectEntries, STRUCTURE } from "./objects/catalog";

function entityById(catalogId: string): GameContextEntityEntry | null {
  if (catalogId !== ALIEN_KIND) return null;
  return { stats: ALIEN_STATS, movement: { poses: ["standing"], walkSpeed: 2.4 }, role: "npc" };
}

/** Habitat walls and decor are placed from the authored scene and never sold, moved or used; furnishings are bought, sold and used. */
/** Decor is dressing, not a body: a rug or a lamp has no collision body, so it never stands in a household member's way. */
const DECOR_IDS = new Set(DECOR.map((def) => def.id));
const SCENERY_OBJECTS = new Set([...DECOR.map((def) => def.id), ...STRUCTURE.map((def) => def.id)]);

function objectById(catalogId: string): GameContextObjectEntry | null {
  const entry = objectEntries[catalogId];
  if (entry === undefined) return null;
  if (DECOR_IDS.has(catalogId)) return { ...entry, scenery: true, colliders: {} };
  return SCENERY_OBJECTS.has(catalogId) ? { ...entry, scenery: true } : entry;
}

export const content: GameContextContent = { entityById, objectById };
