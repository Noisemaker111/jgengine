import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { ENTITY_CATALOG } from "./entities/catalog";
import { EXIT_GATE_ARCH, GATE_BARRICADE_JUMP, GATE_BARRICADE_PLOW, OBJECT_CATALOG, PROP_YARD_LAMP, PROP_YARD_TOWER, TRACK_OBJECT, ZONE_PROP_IDS } from "./objects/catalog";

/**
 * Never moved once placed: the track dressing, the zone clutter, lamps and towers the compactor
 * clears away, and the barricades a run breaks through. Pickups and jump cues stay individual.
 */
const SCENERY_OBJECTS = new Set<string>([
  EXIT_GATE_ARCH, GATE_BARRICADE_PLOW, GATE_BARRICADE_JUMP, PROP_YARD_LAMP, PROP_YARD_TOWER,
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
