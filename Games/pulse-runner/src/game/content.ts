import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { RUNNER_CATALOG_ID } from "./entities/catalog";

export const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId !== RUNNER_CATALOG_ID) return null;
    return { role: "player" };
  },
  objectById() {
    return {};
  },
};
