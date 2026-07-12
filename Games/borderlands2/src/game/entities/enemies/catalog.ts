import type { OnDeathSpec } from "@jgengine/core/combat/death";
import type { ReceiveMap } from "@jgengine/core/combat/effects";
import type { StatCatalog } from "@jgengine/core/scene/entityStats";
import type { Surface } from "../../handroll";

export type EnemyFamily = "bandit" | "skag" | "boss";

export type EnemyAttack =
  | { kind: "melee"; damage: number; reach: number; intervalMs: number }
  | { kind: "ranged"; itemId: string; intervalMs: number; preferRange: number; eyeHeight: number };

export interface EnemyDef {
  id: string;
  name: string;
  family: EnemyFamily;
  badass: boolean;
  surface: Surface;
  scale: number;
  walkSpeed: number;
  aggroRadius: number;
  stats: StatCatalog;
  receive: ReceiveMap;
  onDeath: OnDeathSpec;
  attack: EnemyAttack;
  xp: number;
  gunDropChance: number;
  gunLuck: number;
}

const receive: ReceiveMap = { damage: { order: ["shield", "health"] } };

function drops(table: string): OnDeathSpec {
  return {
    drops: [{ table, when: { reason: "player_kill" } }],
    dropMode: "world",
    scatter: { radius: 1.6, minRadius: 0.5 },
  };
}

export const enemies: readonly EnemyDef[] = [
  {
    id: "psycho",
    name: "Psycho",
    family: "bandit",
    badass: false,
    surface: "flesh",
    scale: 1,
    walkSpeed: 5.2,
    aggroRadius: 26,
    stats: { health: { max: 55 } },
    receive,
    onDeath: drops("drops_bandit"),
    attack: { kind: "melee", damage: 12, reach: 1.9, intervalMs: 1000 },
    xp: 24,
    gunDropChance: 0.12,
    gunLuck: 1,
  },
  {
    id: "marauder",
    name: "Marauder",
    family: "bandit",
    badass: false,
    surface: "flesh",
    scale: 1,
    walkSpeed: 3.6,
    aggroRadius: 30,
    stats: { health: { max: 70 } },
    receive,
    onDeath: drops("drops_bandit"),
    attack: { kind: "ranged", itemId: "bolt_marauder", intervalMs: 1500, preferRange: 15, eyeHeight: 1.5 },
    xp: 30,
    gunDropChance: 0.16,
    gunLuck: 1,
  },
  {
    id: "nomad",
    name: "Nomad",
    family: "bandit",
    badass: false,
    surface: "flesh",
    scale: 1.25,
    walkSpeed: 2.8,
    aggroRadius: 28,
    stats: { health: { max: 160 }, shield: { max: 80 } },
    receive,
    onDeath: drops("drops_tough"),
    attack: { kind: "ranged", itemId: "bolt_nomad", intervalMs: 1900, preferRange: 12, eyeHeight: 1.9 },
    xp: 60,
    gunDropChance: 0.28,
    gunLuck: 2,
  },
  {
    id: "badass_psycho",
    name: "Badass Psycho",
    family: "bandit",
    badass: true,
    surface: "armor",
    scale: 1.5,
    walkSpeed: 4.6,
    aggroRadius: 32,
    stats: { health: { max: 340 } },
    receive,
    onDeath: drops("drops_badass"),
    attack: { kind: "melee", damage: 26, reach: 2.4, intervalMs: 1300 },
    xp: 130,
    gunDropChance: 0.6,
    gunLuck: 3,
  },
  {
    id: "skag_pup",
    name: "Skag Pup",
    family: "skag",
    badass: false,
    surface: "flesh",
    scale: 0.7,
    walkSpeed: 6,
    aggroRadius: 22,
    stats: { health: { max: 32 } },
    receive,
    onDeath: drops("drops_skag"),
    attack: { kind: "melee", damage: 7, reach: 1.4, intervalMs: 850 },
    xp: 14,
    gunDropChance: 0.04,
    gunLuck: 1,
  },
  {
    id: "skag",
    name: "Adult Skag",
    family: "skag",
    badass: false,
    surface: "armor",
    scale: 1.1,
    walkSpeed: 5,
    aggroRadius: 24,
    stats: { health: { max: 110 } },
    receive,
    onDeath: drops("drops_skag"),
    attack: { kind: "melee", damage: 16, reach: 1.8, intervalMs: 1100 },
    xp: 46,
    gunDropChance: 0.08,
    gunLuck: 1,
  },
  {
    id: "badass_skag",
    name: "Badass Skag",
    family: "skag",
    badass: true,
    surface: "armor",
    scale: 1.7,
    walkSpeed: 4.4,
    aggroRadius: 28,
    stats: { health: { max: 420 } },
    receive,
    onDeath: drops("drops_badass"),
    attack: { kind: "melee", damage: 30, reach: 2.6, intervalMs: 1400 },
    xp: 160,
    gunDropChance: 0.55,
    gunLuck: 3,
  },
  {
    id: "captain_flynt",
    name: "Captain Flynt",
    family: "boss",
    badass: true,
    surface: "armor",
    scale: 2.1,
    walkSpeed: 3.2,
    aggroRadius: 36,
    stats: { health: { max: 1400 }, shield: { max: 300 } },
    receive,
    onDeath: drops("drops_boss"),
    attack: { kind: "ranged", itemId: "bolt_flynt", intervalMs: 1200, preferRange: 14, eyeHeight: 2.4 },
    xp: 800,
    gunDropChance: 1,
    gunLuck: 40,
  },
];

const byId = new Map(enemies.map((enemy) => [enemy.id, enemy]));

export function enemyById(id: string): EnemyDef | undefined {
  return byId.get(id);
}

export interface EnemyWeaponDef {
  id: string;
  name: string;
  kind: "enemy_weapon";
  weapon: { damage: number; range: number; spread: number; projectile?: { speed: number } };
}

export const enemyWeapons: readonly EnemyWeaponDef[] = [
  { id: "bolt_marauder", name: "Marauder Round", kind: "enemy_weapon", weapon: { damage: 9, range: 48, spread: 4, projectile: { speed: 30 } } },
  { id: "bolt_nomad", name: "Nomad Slug", kind: "enemy_weapon", weapon: { damage: 16, range: 40, spread: 5, projectile: { speed: 26 } } },
  { id: "bolt_flynt", name: "Flynt Flare", kind: "enemy_weapon", weapon: { damage: 22, range: 52, spread: 3, projectile: { speed: 28 } } },
];

export const NPC_IDS = { claptrap: "claptrap", marcus: "vendor_marcus", zed: "vendor_zed" } as const;

export interface NpcDef {
  id: string;
  name: string;
  stats: StatCatalog;
}

export const npcs: readonly NpcDef[] = [
  { id: NPC_IDS.claptrap, name: "CL4P-TP", stats: { health: { max: 100, min: 1 } } },
];
