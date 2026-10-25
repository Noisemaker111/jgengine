import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

const building: GameContextEntityEntry = { stats: { health: { max: 500 } } };

/** Every entity the realm spawns, by catalog id: the seat, the buildings and the people walking about. */
const entities: Record<string, GameContextEntityEntry> = {
  seat: building,
  ...Object.fromEntries(idea.buildings.map((entry) => [entry.id, building])),
  ...Object.fromEntries(idea.people.walkers.map((_, index) => [`walker${index + 1}`, { role: "npc", movement: { walkSpeed: 1.3 } } satisfies GameContextEntityEntry])),
};

export const content = {
  entityById: (id: string) => entities[id] ?? null,
};
