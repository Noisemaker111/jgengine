import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { droneEntities } from "./entities/catalog";

export const content: GameContextContent = {
  entityById(catalogId) {
    return droneEntities[catalogId] ?? null;
  },
};
