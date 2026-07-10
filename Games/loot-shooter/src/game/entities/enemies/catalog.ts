import type { OnDeathSpec } from "@jgengine/core/combat/death";
import type { ReceiveMap } from "@jgengine/core/combat/effects";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";

export type EnemyFamily = "drone" | "skitter" | "husk" | "spitter" | "boss";
export type EnemyRank = "grunt" | "veteran" | "elite" | "boss";

export type EnemyAttack =
  | { kind: "melee"; damage: number; reach: number; intervalMs: number }
  | { kind: "ranged"; itemId: string; intervalMs: number; preferRange: number; eyeHeight: number };

export interface EnemyDef {
  id: string;
  name: string;
  family: EnemyFamily;
  rank: EnemyRank;
  scale: number;
  walkSpeed: number;
  stats: StatCatalog;
  receive: ReceiveMap;
  onDeath: OnDeathSpec;
  attack: EnemyAttack;
  xp: number;
  score: number;
}

export interface EnemyWeaponDef {
  id: string;
  name: string;
  kind: "enemy_weapon";
  weapon: { damage: number; range: number; spread: number; projectile?: { speed: number } };
}

interface FamilyBase {
  family: Exclude<EnemyFamily, "boss">;
  label: string;
  health: number;
  walkSpeed: number;
  xp: number;
  score: number;
  attack:
    | { kind: "melee"; damage: number; reach: number; intervalMs: number }
    | { kind: "ranged"; damage: number; range: number; spread: number; intervalMs: number; preferRange: number };
}

const FAMILY_BASES: readonly FamilyBase[] = [
  {
    family: "drone",
    label: "Scav Drone",
    health: 45,
    walkSpeed: 4.2,
    xp: 28,
    score: 10,
    attack: { kind: "melee", damage: 8, reach: 1.8, intervalMs: 1100 },
  },
  {
    family: "skitter",
    label: "Skitterling",
    health: 30,
    walkSpeed: 5.6,
    xp: 22,
    score: 10,
    attack: { kind: "melee", damage: 6, reach: 1.5, intervalMs: 800 },
  },
  {
    family: "husk",
    label: "Rust Husk",
    health: 130,
    walkSpeed: 2.4,
    xp: 55,
    score: 25,
    attack: { kind: "melee", damage: 18, reach: 2.2, intervalMs: 1500 },
  },
  {
    family: "spitter",
    label: "Bile Spitter",
    health: 60,
    walkSpeed: 3.1,
    xp: 45,
    score: 20,
    attack: { kind: "ranged", damage: 10, range: 42, spread: 5, intervalMs: 2200, preferRange: 14 },
  },
];

interface RankDef {
  rank: Exclude<EnemyRank, "boss">;
  label: string;
  healthMult: number;
  speedMult: number;
  damageMult: number;
  xpMult: number;
  scoreMult: number;
  scale: number;
  lootTable: string;
}

const RANKS: readonly RankDef[] = [
  { rank: "grunt", label: "", healthMult: 1, speedMult: 1, damageMult: 1, xpMult: 1, scoreMult: 1, scale: 1, lootTable: "drops_grunt" },
  { rank: "veteran", label: "Veteran", healthMult: 1.9, speedMult: 1.12, damageMult: 1.5, xpMult: 2, scoreMult: 2.5, scale: 1.15, lootTable: "drops_veteran" },
  { rank: "elite", label: "Elite", healthMult: 3.4, speedMult: 1.25, damageMult: 2.2, xpMult: 3.5, scoreMult: 6, scale: 1.32, lootTable: "drops_elite" },
];

function rankName(base: FamilyBase, rank: RankDef): string {
  return rank.label === "" ? base.label : `${rank.label} ${base.label}`;
}

function buildAttack(base: FamilyBase, rank: RankDef, id: string): EnemyAttack {
  const attack = base.attack;
  if (attack.kind === "melee") {
    return {
      kind: "melee",
      damage: Math.round(attack.damage * rank.damageMult),
      reach: attack.reach,
      intervalMs: attack.intervalMs,
    };
  }
  return {
    kind: "ranged",
    itemId: `bolt_${id}`,
    intervalMs: Math.round(attack.intervalMs / rank.speedMult),
    preferRange: attack.preferRange,
    eyeHeight: 1.2,
  };
}

function buildEnemy(base: FamilyBase, rank: RankDef): EnemyDef {
  const id = `${base.family}_${rank.rank}`;
  return {
    id,
    name: rankName(base, rank),
    family: base.family,
    rank: rank.rank,
    scale: rank.scale,
    walkSpeed: Math.round(base.walkSpeed * rank.speedMult * 10) / 10,
    stats: { health: { max: Math.round(base.health * rank.healthMult) } },
    receive: { damage: { order: ["health"] } },
    onDeath: {
      drops: [{ table: rank.lootTable, when: { reason: "player_kill" } }],
      dropMode: "world",
      scatter: { radius: 1.6, minRadius: 0.5 },
    },
    attack: buildAttack(base, rank, id),
    xp: Math.round(base.xp * rank.xpMult),
    score: Math.round(base.score * rank.scoreMult),
  };
}

const generated: readonly EnemyDef[] = FAMILY_BASES.flatMap((base) => RANKS.map((rank) => buildEnemy(base, rank)));

export const warden: EnemyDef = {
  id: "boss_warden",
  name: "Yard Warden",
  family: "boss",
  rank: "boss",
  scale: 1.9,
  walkSpeed: 3.4,
  stats: { health: { max: 950 } },
  receive: { damage: { order: ["health"] } },
  onDeath: {
    drops: [{ table: "drops_boss", when: { reason: "player_kill" } }],
    dropMode: "world",
    scatter: { radius: 2.4, minRadius: 0.8 },
  },
  attack: { kind: "ranged", itemId: "bolt_boss_warden", intervalMs: 1400, preferRange: 12, eyeHeight: 2.2 },
  xp: 400,
  score: 500,
};

export const dreadnought: EnemyDef = {
  id: "boss_dreadnought",
  name: "Dreadnought",
  family: "boss",
  rank: "boss",
  scale: 2.4,
  walkSpeed: 2.8,
  stats: { health: { max: 2300 } },
  receive: { damage: { order: ["health"] } },
  onDeath: {
    drops: [{ table: "drops_boss", when: { reason: "player_kill" } }],
    dropMode: "world",
    scatter: { radius: 3, minRadius: 1 },
  },
  attack: { kind: "ranged", itemId: "bolt_boss_dreadnought", intervalMs: 1000, preferRange: 14, eyeHeight: 2.8 },
  xp: 1200,
  score: 1500,
};

export const enemies: readonly EnemyDef[] = [...generated, warden, dreadnought];

const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));

export function enemyById(id: string): EnemyDef | undefined {
  return byId.get(id);
}

function boltFor(enemy: EnemyDef): EnemyWeaponDef | null {
  if (enemy.attack.kind !== "ranged") return null;
  const base = FAMILY_BASES.find((candidate) => candidate.family === enemy.family);
  const damage =
    enemy.family === "boss"
      ? enemy.id === "boss_dreadnought"
        ? 26
        : 18
      : base !== undefined && base.attack.kind === "ranged"
        ? Math.round(base.attack.damage * (RANKS.find((rank) => rank.rank === enemy.rank)?.damageMult ?? 1))
        : 10;
  const range = base !== undefined && base.attack.kind === "ranged" ? base.attack.range : 48;
  const spread = base !== undefined && base.attack.kind === "ranged" ? base.attack.spread : 4;
  return {
    id: enemy.attack.itemId,
    name: `${enemy.name} Bolt`,
    kind: "enemy_weapon",
    weapon: { damage, range, spread, projectile: { speed: 26 } },
  };
}

export const enemyWeapons: readonly EnemyWeaponDef[] = enemies
  .map((enemy) => boltFor(enemy))
  .filter((bolt): bolt is EnemyWeaponDef => bolt !== null);
