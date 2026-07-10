import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { GLIDER_ENTITIES } from "./entities/gliders/catalog";
import { OBJECT_CATALOG } from "./objects/catalog";

export const content: GameContextContent = {
  entityById(catalogId) {
    return GLIDER_ENTITIES[catalogId] ?? null;
  },
  objectById(catalogId) {
    return OBJECT_CATALOG[catalogId] ?? null;
  },
};
