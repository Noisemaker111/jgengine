import type { GameContextContent } from "@jgengine/core/runtime/gameContext";

import { GHOST_ENTITY, GHOST_ENTITY_FADED, RUNNER_ENTITY } from "./entities/catalog";

export const content: GameContextContent = {
  entityById(catalogId) {
    if (catalogId === RUNNER_ENTITY) return { role: "player" };
    if (catalogId === GHOST_ENTITY || catalogId === GHOST_ENTITY_FADED) return { role: "npc" };
    return undefined;
  },
};
