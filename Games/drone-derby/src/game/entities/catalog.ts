import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const DRONE_ENTITY_KIND = "drone_player";

export const droneEntities: Record<string, GameContextEntityEntry> = {
  [DRONE_ENTITY_KIND]: { role: "player" },
};
