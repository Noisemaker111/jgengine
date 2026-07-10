import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const KART_PLAYER_ENTITY = "kart_player";
export const COMPACTOR_ENTITY = "compactor_wall";

export const ENTITY_CATALOG: Record<string, GameContextEntityEntry> = {
  [KART_PLAYER_ENTITY]: { role: "player" },
  [COMPACTOR_ENTITY]: { role: "vehicle" },
};
