import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { SLEDDERS } from "../../ai/sledders";

export const SLED_PLAYER_ENTITY = "sled_player";

export const VEHICLE_ENTITY_CATALOG: Record<string, GameContextEntityEntry> = {
  [SLED_PLAYER_ENTITY]: { role: "player" },
  ...Object.fromEntries(SLEDDERS.map((def) => [def.entityId, { role: "vehicle" as const }])),
};
