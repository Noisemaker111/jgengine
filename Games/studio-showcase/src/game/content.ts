import type { GameContextContent, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { players } from "./entities/players/catalog";

const playersById = new Map(players.map((entry) => [entry.id, entry]));

function entityById(catalogId: string): GameContextEntityEntry | null {
  const def = playersById.get(catalogId);
  if (def === undefined) return null;
  return { stats: def.stats, movement: { poses: ["standing"], walkSpeed: def.walkSpeed } };
}

export const content: GameContextContent = { entityById };
