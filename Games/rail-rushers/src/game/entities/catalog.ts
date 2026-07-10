import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { TRAINS } from "../rail/schedule";

export const HANDCAR_ENTITY = "handcar_player";

export function trainCatalogId(trainId: string): string {
  return `train_${trainId}`;
}

export const ENTITY_CATALOG: Record<string, GameContextEntityEntry> = {
  [HANDCAR_ENTITY]: { role: "player" },
  ...Object.fromEntries(TRAINS.map((train) => [trainCatalogId(train.id), { role: "vehicle" as const }])),
};
