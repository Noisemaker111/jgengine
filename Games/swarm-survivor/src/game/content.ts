import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { enemyEntityCatalog } from "./entities/enemies/catalog";
import { playerEntityCatalog } from "./entities/players/catalog";

const ENTITIES = { ...playerEntityCatalog(), ...enemyEntityCatalog() };

export const content: GameContextContent = {
  entityById: (id) => ENTITIES[id] ?? null,
};
