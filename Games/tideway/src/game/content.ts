import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import { BOAT_ENTITY_ID } from "./world/catalogIds";

export const content: GameContextContent = {
  entityById: (catalogId) => (catalogId === BOAT_ENTITY_ID ? { role: "vehicle" } : undefined),
  objectById: () => ({}),
};
