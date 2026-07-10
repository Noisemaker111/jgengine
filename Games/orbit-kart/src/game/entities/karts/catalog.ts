import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { RIVALS } from "../../ai/rivals";

export const PLAYER_KART_ENTITY = "kart_player";
export const RIVAL_KART_ENTITY: Readonly<Record<string, string>> = Object.fromEntries(
  RIVALS.map((rival) => [rival.id, `kart_${rival.kind}`]),
);

export const KART_ENTITIES: Record<string, GameContextEntityEntry> = {
  [PLAYER_KART_ENTITY]: { role: "player" },
  ...Object.fromEntries(RIVALS.map((rival) => [RIVAL_KART_ENTITY[rival.id]!, { role: "vehicle" as const }])),
};
