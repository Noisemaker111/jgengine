import type { GameContextContent } from "@jgengine/core/runtime/gameContext";
import { entityContentById } from "./entities/catalog";

export const content: GameContextContent = {
  entityById: entityContentById,
};
