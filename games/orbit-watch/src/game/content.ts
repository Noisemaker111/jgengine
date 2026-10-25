import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

/** Every entity the hold spawns, by catalog id: the core, the towers and what marches at them. */
const entities: Record<string, GameContextEntityEntry> = {
  core: {},
  ...Object.fromEntries(idea.towers.map((tower) => [tower.id, {} satisfies GameContextEntityEntry])),
  ...Object.fromEntries(
    idea.creeps.map((creep) => [
      creep.id,
      { role: "enemy", stats: { health: { max: creep.health } }, receive: { damage: { order: ["health"] } } } satisfies GameContextEntityEntry,
    ]),
  ),
};

export const content = {
  entityById: (id: string) => entities[id] ?? null,
};
