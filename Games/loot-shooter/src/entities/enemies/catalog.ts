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
}

export const drone_grunt: EnemyDef = {
  id: "drone_grunt",
  name: "Scav Drone",
  model: "enemy/drone_grunt",
  walkSpeed: 3.2,
  stats: { health: { max: 60 } },
  receive: { damage: { order: ["health"] } },
  onDeath: {
    drops: [{ table: "enemy-loot", when: { reason: "player_kill" } }],
    dropMode: "world",
    scatter: { radius: 1.6, minRadius: 0.4 },
  },
  xp: 40,
};

export const enemies: EnemyDef[] = [drone_grunt];

const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));

export function enemyById(id: string): EnemyDef | undefined {
  return byId.get(id);
}
