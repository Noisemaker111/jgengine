import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

const body = (health: number, extra: Partial<GameContextEntityEntry> = {}): GameContextEntityEntry => ({
  stats: { health: { max: health } },
  receive: { damage: { order: ["health"] } },
  ...extra,
});

/** Every entity the starter spawns, by catalog id: the hero, home, what is built, what comes, what is tamed. */
const entities: Record<string, GameContextEntityEntry> = {
  player: body(idea.hero.health, { role: "player", movement: { poses: ["standing", "running", "crouch"], walkSpeed: 4.2 } }),
  home: body(idea.home.health),
  ...Object.fromEntries(idea.structures.map((structure) => [structure.id, body(structure.health)])),
  ...Object.fromEntries(idea.threats.map((threat) => [threat.id, body(threat.health, { role: "enemy", movement: { walkSpeed: threat.speed } })])),
  ...Object.fromEntries(idea.allies.map((ally) => [ally.id, body(ally.health, { role: "npc", movement: { walkSpeed: ally.speed } })])),
};

export const content = {
  entityById: (id: string) => entities[id] ?? null,
};
