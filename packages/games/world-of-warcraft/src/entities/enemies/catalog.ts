import type { OnDeathSpec } from "@jgengine/core/combat/death";
import type { ReceiveMap } from "@jgengine/core/combat/effects";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";

export interface EnemyDef {
  id: string;
  name: string;
  model: string;
  walkSpeed: number;
  stats: StatCatalog;
  receive: ReceiveMap;
  onDeath: OnDeathSpec;
  xp: number;
  melee: { damage: number; range: number; cooldownSeconds: number };
  aggroRadius: number;
  wanderRadius: number;
}

export const kobold_grunt: EnemyDef = {
  id: "kobold_grunt",
  name: "Kobold Grunt",
  model: "mob/kobold_grunt",
  walkSpeed: 2.8,
  stats: { health: { max: 35 } },
  receive: { damage: { order: ["health"] } },
  onDeath: { drops: [{ table: "loot_kobold_grunt", when: { reason: "player_kill" } }] },
  xp: 45,
  melee: { damage: 6, range: 2.2, cooldownSeconds: 1.4 },
  aggroRadius: 10,
  wanderRadius: 8,
};

export const forest_wolf: EnemyDef = {
  id: "forest_wolf",
  name: "Forest Wolf",
  model: "mob/forest_wolf",
  walkSpeed: 4.2,
  stats: { health: { max: 55 } },
  receive: { damage: { order: ["health"] } },
  onDeath: { drops: [{ table: "loot_forest_wolf", when: { reason: "player_kill" } }] },
  xp: 70,
  melee: { damage: 9, range: 2.0, cooldownSeconds: 1.2 },
  aggroRadius: 13,
  wanderRadius: 12,
};

export const kobold_elite: EnemyDef = {
  id: "kobold_elite",
  name: "Kobold Taskmaster",
  model: "mob/kobold_elite",
  walkSpeed: 3.2,
  stats: { health: { max: 220 } },
  receive: { damage: { order: ["health"] } },
  onDeath: { drops: [{ table: "loot_kobold_elite", when: { reason: "player_kill" } }] },
  xp: 300,
  melee: { damage: 16, range: 2.4, cooldownSeconds: 1.6 },
  aggroRadius: 14,
  wanderRadius: 10,
};

export const enemies: EnemyDef[] = [kobold_grunt, forest_wolf, kobold_elite];

const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));

export function enemyById(id: string): EnemyDef | undefined {
  return byId.get(id);
}
