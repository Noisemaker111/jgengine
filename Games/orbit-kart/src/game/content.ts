import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import { KART_ENTITIES } from "./entities/karts/catalog";

export const content: GameContextContent = {
  entityById(catalogId) {
    return KART_ENTITIES[catalogId] ?? null;
  },
  objectById() {
    return null;
  },
};
