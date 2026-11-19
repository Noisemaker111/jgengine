import type { Faction } from "./tuning";

export type CombatantKind = "unit" | "building";

export interface CombatantDef {
  id: string;
  label: string;
  faction: Faction;
  kind: CombatantKind;
  role: "npc" | "enemy";
  maxHealth: number;
  walkSpeed: number;
  scale: number;
  damage: number;
  attackRange: number;
  /** Seconds between swings. */
  attackCooldown: number;
  aggroRadius: number;
  bounty: number;
  food: number;
  worker?: boolean;
  depot?: boolean;
  prefers?: "worker" | "building";
  /** What its blows are, as a row of the matchup table (`matchups.ts`): `"strike"` unless it has a matchup. */
  damageType: string;
  /** The class it presents to the matchup table: `"unit"` or `"building"` unless the roster says otherwise. */
  resistance: string;
  crowdedWithin?: number;
}

export type Resource = "gold" | "lumber";

export type Cost = Readonly<Partial<Record<Resource, number>>>;

export interface TrainableDef {
  cost: Cost;
  trainSeconds: number;
}

function byId<V>(table: Readonly<Record<string, V>>): (id: string) => V | undefined {
  const entries = new Map(Object.entries(table));
  return (id) => entries.get(id);
}

function def(d: Partial<CombatantDef> & Pick<CombatantDef, "id" | "label" | "faction" | "kind">): CombatantDef {
  return {
    role: d.faction === "enemy" ? "enemy" : "npc",
    maxHealth: 100,
    walkSpeed: d.kind === "building" ? 0 : 4.4,
    scale: 1,
    damage: d.kind === "building" ? 0 : 8,
    attackRange: 1.9,
    attackCooldown: 1,
    aggroRadius: 8,
    bounty: 0,
    food: d.kind === "building" ? 0 : 2,
    damageType: "strike",
    resistance: d.kind === "building" ? "building" : "unit",
    ...d,
  };
}

export const COMBATANTS = {
  // — Vanguard (player) —
  peasant: def({
    id: "peasant", label: "Peasant", faction: "player", kind: "unit",
    maxHealth: 70, walkSpeed: 4.6, damage: 4, attackRange: 1.6, attackCooldown: 1.4, aggroRadius: 4, food: 1, worker: true,
  }),
  footman: def({
    id: "footman", label: "Footman", faction: "player", kind: "unit",
    maxHealth: 130, walkSpeed: 4.7, damage: 9, attackRange: 1.9, attackCooldown: 0.85, aggroRadius: 8, food: 2,
    damageType: "blade",
  }),
  rifleman: def({
    id: "rifleman", label: "Rifleman", faction: "player", kind: "unit",
    maxHealth: 90, walkSpeed: 4.5, damage: 14, attackRange: 7, attackCooldown: 1.3, aggroRadius: 9, food: 3,
    damageType: "rifle", crowdedWithin: 3,
  }),
  barracks: def({
    id: "barracks", label: "Barracks", faction: "player", kind: "building", maxHealth: 700, depot: true,
  }),
  farm: def({
    id: "farm", label: "Farm", faction: "player", kind: "building", maxHealth: 420,
  }),
  guard_tower: def({
    id: "guard_tower", label: "Guard Tower", faction: "player", kind: "building",
    maxHealth: 560, damage: 15, attackRange: 9, attackCooldown: 1.1, aggroRadius: 9,
  }),
  hero: def({
    id: "hero", label: "Bram the Bold", faction: "player", kind: "unit",
    maxHealth: 380, walkSpeed: 4.3, scale: 1.28, damage: 24, attackRange: 2.1, attackCooldown: 1, aggroRadius: 9, food: 5,
  }),
  keep_player: def({
    id: "keep_player", label: "Ember Command Keep", faction: "player", kind: "building",
    maxHealth: 1600, scale: 1, depot: true, resistance: "keep",
  }),

  // — Marauders (enemy) —
  grunt: def({
    id: "grunt", label: "Marauder", faction: "enemy", kind: "unit",
    maxHealth: 110, walkSpeed: 4.3, damage: 8, attackRange: 1.9, attackCooldown: 1, aggroRadius: 8, bounty: 14, prefers: "worker",
  }),
  reaver: def({
    id: "reaver", label: "Reaver", faction: "enemy", kind: "unit",
    maxHealth: 240, walkSpeed: 3.9, scale: 1.22, damage: 17, attackRange: 2.1, attackCooldown: 1.1, aggroRadius: 9, bounty: 28,
    prefers: "building", damageType: "siege", resistance: "heavy",
  }),
  keep_enemy: def({
    id: "keep_enemy", label: "Marauder Warcamp", faction: "enemy", kind: "building",
    maxHealth: 1300, scale: 1, resistance: "keep",
  }),
  warcamp: def({
    id: "warcamp", label: "Forward Camp", faction: "enemy", kind: "building",
    maxHealth: 620, scale: 0.85,
  }),
} satisfies Record<string, CombatantDef>;

export const DECOR = new Set(["banner_blue", "banner_red", "torch", "barrel"]);

export const NODES: Record<string, { resource: string; label: string }> = {
  goldmine: { resource: "gold", label: "Gold seam" },
  woods: { resource: "lumber", label: "Logging camp" },
};

export type TrainableId = "peasant" | "footman" | "rifleman";

export const TRAINABLE: Readonly<Record<TrainableId, TrainableDef>> = {
  peasant: { cost: { gold: 55 }, trainSeconds: 8 },
  footman: { cost: { gold: 80, lumber: 10 }, trainSeconds: 14 },
  rifleman: { cost: { gold: 70, lumber: 20 }, trainSeconds: 16 },
};

/** What `id` trains like, or undefined when no building trains it. */
export const trainableDef = byId<TrainableDef>(TRAINABLE);

export const BARRACKS_UNITS = new Set(["footman", "rifleman"]);

export interface BuildingDef {
  cost: Cost;
  buildSeconds: number;
  supply?: number;
}

export type BuildingId = "barracks" | "farm" | "guard_tower";

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  barracks: { cost: { gold: 140, lumber: 60 }, buildSeconds: 20 },
  farm: { cost: { gold: 60, lumber: 30 }, buildSeconds: 12, supply: 8 },
  guard_tower: { cost: { gold: 90, lumber: 40 }, buildSeconds: 16 },
};

/** What building `id` costs and takes, or undefined when the player cannot build it. */
export const buildingDef = byId<BuildingDef>(BUILDINGS);

/** The resource node `catalogId` places, or undefined when it is not a node. */
export const nodeDef = byId(NODES);

export function isNode(catalogId: string): boolean {
  return nodeDef(catalogId) !== undefined;
}

const combatantById = byId<CombatantDef>(COMBATANTS);

export function combatantDef(catalogId: string): CombatantDef | null {
  return combatantById(catalogId) ?? null;
}

export function isHostile(a: Faction, b: Faction): boolean {
  return a !== b;
}
