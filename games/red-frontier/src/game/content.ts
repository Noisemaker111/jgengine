import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

const body = (health: number, role: "npc" | "enemy"): GameContextEntityEntry => ({ role, stats: { health: { max: health } }, receive: { damage: { order: ["health"] } } });

/** Every entity the colony spawns, by catalog id: buildings and nodes stand; colonists and raiders can die. */
const entities: Record<string, GameContextEntityEntry> = {
  hq: {},
  ...Object.fromEntries(idea.structures.map((structure) => [structure.id, {} satisfies GameContextEntityEntry])),
  ...Object.fromEntries(idea.nodes.map((node) => [node.id, {} satisfies GameContextEntityEntry])),
  ...Object.fromEntries(idea.colonists.models.map((_, index) => [`colonist${index + 1}`, body(idea.colonists.health, "npc")])),
  ...Object.fromEntries(idea.raiders.kinds.map((raider) => [raider.id, body(raider.health, "enemy")])),
};

export const content = {
  entityById: (id: string) => entities[id] ?? null,
};
