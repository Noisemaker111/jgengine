import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { VEHICLE_ENTITY_CATALOG } from "./entities/vehicles/catalog";
import { OBJECT_CATALOG } from "./objects/catalog";

export const content: GameContextContent = {
  entityById(catalogId) {
    return VEHICLE_ENTITY_CATALOG[catalogId] ?? null;
  },
  objectById(catalogId) {
    return OBJECT_CATALOG[catalogId] ?? null;
  },
};
