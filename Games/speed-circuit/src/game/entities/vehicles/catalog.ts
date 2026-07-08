import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const CAR_PLAYER_ENTITY = "car_player";

export const vehicleEntities: Record<string, GameContextEntityEntry> = {
  [CAR_PLAYER_ENTITY]: { role: "vehicle" },
};
