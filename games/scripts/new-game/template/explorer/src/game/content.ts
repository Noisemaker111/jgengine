import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

const body = (health: number, extra: Partial<GameContextEntityEntry> = {}): GameContextEntityEntry => ({
  stats: { health: { max: health } },
  receive: { damage: { order: ["health"] } },
  ...extra,
});

const guardians = idea.landmarks.flatMap((landmark) => (landmark.guardian === undefined ? [] : [landmark.guardian]));

/** Every entity the starter spawns, by catalog id: the walker, the guardians, the relics and the goal. */
const entities: Record<string, GameContextEntityEntry> = {
  player: body(idea.hero.health, { role: "player", movement: { poses: ["standing", "running", "crouch"], walkSpeed: 4.6 } }),
  ...Object.fromEntries(guardians.map((guard) => [guard.id, body(guard.health, { role: "enemy", movement: { walkSpeed: guard.speed } })])),
  ...Object.fromEntries(idea.landmarks.flatMap((landmark) => (landmark.relic === undefined ? [] : [[`relic_${landmark.id}`, {}]]))),
  goal: {},
};

export const content = {
  entityById: (id: string) => entities[id] ?? null,
};
