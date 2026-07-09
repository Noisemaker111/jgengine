import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { enemyEntityCatalog } from "./entities/enemies/catalog";
import { playerEntityCatalog } from "./entities/players/catalog";

export const content: GameContextContent = {
  entityById: (id) => playerEntityCatalog()[id] ?? enemyEntityCatalog()[id] ?? null,
};
