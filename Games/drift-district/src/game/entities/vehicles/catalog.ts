import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { RIVALS } from "../../rivals/catalog";

export const CAR_PLAYER_ENTITY = "car_player";

export const VEHICLE_ENTITIES: Record<string, GameContextEntityEntry> = {
  [CAR_PLAYER_ENTITY]: { role: "player" },
  ...Object.fromEntries(RIVALS.map((rival) => [rival.entityId, { role: "vehicle" as const }])),
};
