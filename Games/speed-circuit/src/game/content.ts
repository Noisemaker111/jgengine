import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { vehicleEntities } from "./entities/vehicles/catalog";

export const content: GameContextContent = {
  entityById(catalogId) {
    return vehicleEntities[catalogId] ?? null;
  },
};
