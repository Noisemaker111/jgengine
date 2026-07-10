import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const BOT_ENTITY_ID = "courier_bot";

export const entityCatalog: Record<string, GameContextEntityEntry> = {
  [BOT_ENTITY_ID]: { role: "player" },
};
