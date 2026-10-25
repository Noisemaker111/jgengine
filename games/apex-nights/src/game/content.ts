import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

/** The player's car and each rival livery, by catalog id. Cars are posed by the race loop, not walked. */
const entities: Record<string, GameContextEntityEntry> = {
  car: { role: "player" },
  ...Object.fromEntries(idea.rivals.map((_, index) => [`rival${index + 1}`, { role: "npc" } satisfies GameContextEntityEntry])),
};

export const content = {
  entityById: (id: string) => entities[id] ?? null,
};
