import type { GameContextEntityEntry, GameContextItemEntry } from "@jgengine/core/runtime/gameContext";

import { idea } from "./idea";

const body = (health: number, extra: Partial<GameContextEntityEntry> = {}): GameContextEntityEntry => ({
  stats: { health: { max: health } },
  receive: { damage: { order: ["health"] } },
  ...extra,
});

/** Every entity the starter spawns, by catalog id: the hero, the base, and who holds the outposts. */
const entities: Record<string, GameContextEntityEntry> = {
  player: body(idea.hero.health, { role: "player", movement: { poses: ["standing", "running", "crouch"], walkSpeed: 4.6 } }),
  base: {},
  ...Object.fromEntries(idea.enemies.map((enemy) => [enemy.id, body(enemy.health, { role: "enemy", movement: { walkSpeed: enemy.speed } })])),
};

/** Guns, yours and theirs, as the projectile system reads them: damage, reach, cone, pellets. */
const items: Record<string, GameContextItemEntry> = {
  ...Object.fromEntries(idea.guns.map((gun) => [gun.id, { weapon: { damage: gun.damage, range: gun.range, spread: gun.spread, pellets: gun.pellets } }])),
  ...Object.fromEntries(idea.enemies.map((enemy) => [`${enemy.id}_gun`, { weapon: { damage: enemy.damage, range: enemy.range * 1.7, spread: enemy.spread } }])),
};

export const content = {
  entityById: (id: string) => entities[id] ?? null,
  itemById: (id: string) => items[id] ?? null,
};
