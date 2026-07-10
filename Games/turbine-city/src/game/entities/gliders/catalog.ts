import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const GLIDER_PLAYER_ENTITY = "glider_player";
export const GLIDER_PACER_ENTITY = "glider_pacer";
export const GLIDER_GHOST_ENTITY = "glider_ghost";

export const GLIDER_ENTITIES: Record<string, GameContextEntityEntry> = {
  [GLIDER_PLAYER_ENTITY]: { role: "player" },
  [GLIDER_PACER_ENTITY]: { role: "vehicle" },
  [GLIDER_GHOST_ENTITY]: { role: "vehicle" },
};
