import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { ENTITY_CATALOG } from "./entities/catalog";
import { EXIT_GATE_ARCH, OBJECT_CATALOG, TRACK_OBJECT } from "./objects/catalog";

/** Placed once at setup and never removed or moved; every other kind is removed, collected or used during a run. */
const SCENERY_OBJECTS = new Set<string>([EXIT_GATE_ARCH, ...Object.values(TRACK_OBJECT)]);

export const content: GameContextContent = {
  entityById(catalogId) {
    return ENTITY_CATALOG[catalogId] ?? null;
  },
  objectById(catalogId) {
    const entry = OBJECT_CATALOG[catalogId];
    if (entry === undefined) return null;
    return SCENERY_OBJECTS.has(catalogId) ? { ...entry, scenery: true } : entry;
  },
};
