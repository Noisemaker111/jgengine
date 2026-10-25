import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

/** Every entity the starter spawns, by catalog id: you, the villagers, the animals and each crop's two stages. */
const entities: Record<string, GameContextEntityEntry> = {
  player: { role: "player", stats: { health: { max: 100 } }, movement: { poses: ["standing", "running"], walkSpeed: 4.4 } },
  ...Object.fromEntries(idea.villagers.map((villager) => [villager.id, { role: "npc", movement: { walkSpeed: 1.2 } } satisfies GameContextEntityEntry])),
  ...Object.fromEntries(idea.animals.map((_, index) => [`animal${index + 1}`, { role: "npc", movement: { walkSpeed: 1 } } satisfies GameContextEntityEntry])),
  ...Object.fromEntries(idea.crops.flatMap((crop) => [[`sprout_${crop.id}`, {}], [`ripe_${crop.id}`, {}]])),
};

export const content = {
  entityById: (id: string) => entities[id] ?? null,
};
