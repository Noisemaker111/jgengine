import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { ENTITY_CATALOG } from "./entities/catalog";
import { OBJECT_CATALOG } from "./objects/catalog";

export const content: GameContextContent = {
  entityById(catalogId) {
    return ENTITY_CATALOG[catalogId] ?? null;
  },
  objectById(catalogId) {
    return OBJECT_CATALOG[catalogId] ?? null;
  },
};
