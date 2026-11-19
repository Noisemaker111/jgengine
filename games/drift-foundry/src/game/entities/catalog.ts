import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const KART_PLAYER_ENTITY = "kart_player";
export const COMPACTOR_ENTITY = "compactor_wall";
export const KART_GHOST_ENTITY = "kart_ghost";
export const FREIGHT_CAR_ENTITY = "freight_car";

/** The three yard karts that race the corridor with you. */
export const RIVAL_ENTITY_KINDS = ["kart_rival_tally", "kart_rival_moss", "kart_rival_hobbs"] as const;

const rivalEntry: GameContextEntityEntry = { role: "vehicle" };

export const ENTITY_CATALOG: Record<string, GameContextEntityEntry> = {
  [KART_PLAYER_ENTITY]: { role: "player" },
  [COMPACTOR_ENTITY]: { role: "vehicle" },
  [KART_GHOST_ENTITY]: { role: "vehicle" },
  [FREIGHT_CAR_ENTITY]: { role: "vehicle" },
  ...Object.fromEntries(RIVAL_ENTITY_KINDS.map((kind) => [kind, rivalEntry])),
};
