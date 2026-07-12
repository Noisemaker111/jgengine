export interface EnemyDef {
  id: string;
  role: "enemy" | "hostile";
  walkSpeed: number;
  health: number;
  drops: string;
  bounty: number;
}

export const ENEMIES: readonly EnemyDef[] = [
  { id: "ganger_dock", role: "enemy", walkSpeed: 4.4, health: 45, drops: "loot_ganger", bounty: 60 },
  { id: "ganger_enforcer", role: "enemy", walkSpeed: 3.8, health: 90, drops: "loot_enforcer", bounty: 140 },
  { id: "cop_patrol", role: "hostile", walkSpeed: 5.2, health: 60, drops: "loot_cop", bounty: 0 },
  { id: "cop_swat", role: "hostile", walkSpeed: 5.6, health: 110, drops: "loot_cop", bounty: 0 },
];

export const enemyById = (id: string): EnemyDef | undefined => ENEMIES.find((e) => e.id === id);

export function enemyEntry(def: EnemyDef) {
  return {
    role: def.role,
    movement: { walkSpeed: def.walkSpeed },
    stats: { health: { max: def.health, min: 0 } },
    receive: { damage: { order: ["health"] } },
    onDeath: { drops: def.drops },
  };
}
