import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { ENTITY_CATALOG } from "./entities/catalog";
import { EXIT_GATE_ARCH, GATE_BARRICADE_JUMP, GATE_BARRICADE_PLOW, OBJECT_CATALOG, PROP_AISLE_SIGN, PROP_CEILING_BAY, PROP_CEILING_LIGHT, PROP_STORE_WALL, TRACK_OBJECT, ZONE_PROP_IDS } from "./objects/catalog";

/**
 * Never moved once placed: the department dressing, Aisle 9's clutter, the ceiling lights and aisle
 * signs the shutters swallow, and the barricades a run breaks through. Mod displays, shelf grabs,
 * marble spills and jump cues stay individual.
 */
const SCENERY_OBJECTS = new Set<string>([
  EXIT_GATE_ARCH, GATE_BARRICADE_PLOW, GATE_BARRICADE_JUMP, PROP_CEILING_LIGHT, PROP_AISLE_SIGN, PROP_CEILING_BAY, PROP_STORE_WALL,
  ...ZONE_PROP_IDS, ...Object.values(TRACK_OBJECT),
]);

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
