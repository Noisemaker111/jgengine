import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { entityCatalog } from "./entities/catalog";
import { objectCatalog } from "./objects/catalog";

export const content: GameContextContent = {
  entityById: (id) => entityCatalog[id],
  objectById: (id) => objectCatalog[id as keyof typeof objectCatalog],
};
