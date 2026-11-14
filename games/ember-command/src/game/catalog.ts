import type { Faction } from "./tuning";

/**
 * The LAWN ORDER roster. Positions are authored in `editor.scene.json`; this catalog holds the
 * per-type stats that drive both the engine entity entry (health/speed/scale/role) and the RTS AI
 * (damage/reach/cooldown/aggro) — the combat numbers no `entities` editor schema can express. One
 * source of truth: `content.ts` and `editorCatalogs.ts` both read it, the AI reads it, the models
 * plan keys off its ids.
 */

export type CombatantKind = "unit" | "building";

export interface CombatantDef {
  id: string;
  label: string;
  faction: Faction;
  kind: CombatantKind;
  /** Engine role — cosmetic here; hostility is decided by `faction`, not role. */
  role: "npc" | "enemy";
  maxHealth: number;
  /** 0 for buildings. */
  walkSpeed: number;
  scale: number;
  /** Melee damage per swing (0 for buildings — keeps are passive in this slice). */
  damage: number;
  /** Reach at which a unit stops to swing. */
  attackRange: number;
  /** Seconds between swings. */
  attackCooldown: number;
  /** Auto-acquire hostiles within this radius when idle/guarding or attack-moving. */
  aggroRadius: number;
  /** Sugar awarded to the player when this dies (enemy units only). */
  bounty: number;
  /** Supply (food) this unit consumes; buildings cost 0. */
  food: number;
  /** True for the Worker — can harvest resource nodes and build. */
  worker?: boolean;
  /** Workers drop their haul here (the keep, and any Barracks raised nearer the fields). */
  depot?: boolean;
  /** What this unit goes for first when several hostiles are in reach: harvesters or structures. */
  prefers?: "worker" | "building";
  /** Damage multiplier against buildings (1 when absent). */
  siege?: number;
}

/** What a price is paid in. */
export type Resource = "sugar" | "leaf";

/** A price in each resource it takes; a resource it does not take is absent. */
export type Cost = Readonly<Partial<Record<Resource, number>>>;

/** What a producing building can train, its resource cost, and how long it takes. */
export interface TrainableDef {
  cost: Cost;
  trainSeconds: number;
}

/** A table looked up by an id that arrives as text (a command payload, a scene entry). */
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
    ...d,
  };
}

export const COMBATANTS = {
  // — Red colony (player) —
  worker: def({
    id: "worker", label: "Worker Ant", faction: "player", kind: "unit",
    maxHealth: 60, walkSpeed: 4.8, damage: 4, attackRange: 1.6, attackCooldown: 1.4, aggroRadius: 4, food: 1, worker: true,
  }),
  scout: def({
    id: "scout", label: "Scout Ant", faction: "player", kind: "unit",
    maxHealth: 55, walkSpeed: 6.6, damage: 5, attackRange: 1.6, attackCooldown: 1, aggroRadius: 6, food: 1,
  }),
  soldier: def({
    id: "soldier", label: "Soldier Ant", faction: "player", kind: "unit",
    maxHealth: 130, walkSpeed: 4.7, damage: 9, attackRange: 1.9, attackCooldown: 0.85, aggroRadius: 8, food: 2,
  }),
  spitter: def({
    id: "spitter", label: "Acid Spitter", faction: "player", kind: "unit",
    maxHealth: 85, walkSpeed: 4.5, damage: 14, attackRange: 7, attackCooldown: 1.3, aggroRadius: 9, food: 3,
  }),
  beetle: def({
    id: "beetle", label: "Tank Beetle", faction: "player", kind: "unit",
    maxHealth: 420, walkSpeed: 3.4, scale: 1.3, damage: 18, attackRange: 2.4, attackCooldown: 1.4, aggroRadius: 8, food: 5, siege: 2.5,
  }),
  barracks: def({
    id: "barracks", label: "Barracks Chamber", faction: "player", kind: "building", maxHealth: 700, depot: true,
  }),
  fungus_garden: def({
    id: "fungus_garden", label: "Fungus Garden", faction: "player", kind: "building", maxHealth: 420,
  }),
  nursery: def({
    id: "nursery", label: "Nursery Chamber", faction: "player", kind: "building", maxHealth: 520,
  }),
  granary: def({
    id: "granary", label: "Granary Chamber", faction: "player", kind: "building", maxHealth: 480, depot: true,
  }),
  acid_mound: def({
    id: "acid_mound", label: "Acid Mound", faction: "player", kind: "building",
    maxHealth: 560, damage: 15, attackRange: 9, attackCooldown: 1.1, aggroRadius: 9,
  }),
  hero: def({
    id: "hero", label: "Marshal Mandible", faction: "player", kind: "unit",
    maxHealth: 380, walkSpeed: 4.3, scale: 1.28, damage: 24, attackRange: 2.1, attackCooldown: 1, aggroRadius: 9, food: 5,
  }),
  keep_player: def({
    id: "keep_player", label: "Red Colony Nest", faction: "player", kind: "building",
    maxHealth: 1600, scale: 1, depot: true,
  }),

  // — Black colony and its wasp allies (enemy) —
  raider: def({
    id: "raider", label: "Black Raider", faction: "enemy", kind: "unit",
    maxHealth: 110, walkSpeed: 4.3, damage: 8, attackRange: 1.9, attackCooldown: 1, aggroRadius: 8, bounty: 14, prefers: "worker",
  }),
  major: def({
    id: "major", label: "Black Major", faction: "enemy", kind: "unit",
    maxHealth: 240, walkSpeed: 3.9, scale: 1.22, damage: 17, attackRange: 2.1, attackCooldown: 1.1, aggroRadius: 9, bounty: 28,
    prefers: "building", siege: 2,
  }),
  wasp: def({
    id: "wasp", label: "Paper Wasp", faction: "enemy", kind: "unit",
    maxHealth: 90, walkSpeed: 6.2, damage: 12, attackRange: 2, attackCooldown: 0.9, aggroRadius: 11, bounty: 22, prefers: "worker",
  }),
  keep_enemy: def({
    id: "keep_enemy", label: "Black Ant Nest", faction: "enemy", kind: "building",
    maxHealth: 1300, scale: 1,
  }),
  brood_mound: def({
    id: "brood_mound", label: "Brood Mound", faction: "enemy", kind: "building",
    maxHealth: 620, scale: 0.85,
  }),
} satisfies Record<string, CombatantDef>;

/** Decorative props spawned from the scene — no health, not selectable. Grass forests are instanced
 * scatter; these are the placed hero props around the two nests. */
export const DECOR = new Set(["petal_red", "petal_black", "dewdrop", "seed"]);

/** Harvestable food: sugar from crumbs and the dropped popsicle, leaf pulp from leaf piles. Placed in
 * the scene, they spawn as inert prop entities the pointer can target and workers can haul from. */
export interface NodeDef {
  resource: string;
  label: string;
  /** Total the node holds before it is picked clean (it regrows on the shared resource field). */
  budget: number;
  /** What one worker trip hauls home. */
  load: number;
}

export const NODES: Record<string, NodeDef> = {
  crumbs: { resource: "sugar", label: "Cookie crumbs", budget: 600, load: 12 },
  popsicle: { resource: "sugar", label: "Dropped popsicle", budget: 2400, load: 18 },
  leaves: { resource: "leaf", label: "Leaf pile", budget: 500, load: 8 },
};

/** What the nest and chambers hatch: cost (sugar/leaf) and hatch time. Units past the Worker and
 * Scout need a Barracks Chamber; the Tank Beetle also needs a Nursery (gated in `canTrain`). */
export type TrainableId = "worker" | "scout" | "soldier" | "spitter" | "beetle";

export const TRAINABLE: Readonly<Record<TrainableId, TrainableDef>> = {
  worker: { cost: { sugar: 50 }, trainSeconds: 7 },
  scout: { cost: { sugar: 40, leaf: 10 }, trainSeconds: 8 },
  soldier: { cost: { sugar: 80, leaf: 10 }, trainSeconds: 14 },
  spitter: { cost: { sugar: 70, leaf: 20 }, trainSeconds: 16 },
  beetle: { cost: { sugar: 150, leaf: 60 }, trainSeconds: 24 },
};

/** What `id` trains like, or undefined when no building trains it. */
export const trainableDef = byId<TrainableDef>(TRAINABLE);

/** Units a Barracks Chamber unlocks (the nest alone hatches Workers and Scouts). */
export const BARRACKS_UNITS = new Set(["soldier", "spitter", "beetle"]);
/** Units that also need a Nursery Chamber standing: tamed beetles are raised there. */
export const NURSERY_UNITS = new Set(["beetle"]);

/** The chamber a gated unit is waiting on, or null when it can hatch now. */
export function missingChamber(unitId: string, standing: ReadonlySet<string>): "barracks" | "nursery" | null {
  if (BARRACKS_UNITS.has(unitId) && !standing.has("barracks")) return "barracks";
  if (NURSERY_UNITS.has(unitId) && !standing.has("nursery")) return "nursery";
  return null;
}

/** A chamber the colony digs: cost, dig time, and (for a Fungus Garden) the supply it adds. */
export interface BuildingDef {
  cost: Cost;
  buildSeconds: number;
  supply?: number;
}

export type BuildingId = "barracks" | "fungus_garden" | "acid_mound" | "nursery" | "granary";

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = {
  barracks: { cost: { sugar: 140, leaf: 60 }, buildSeconds: 20 },
  fungus_garden: { cost: { sugar: 60, leaf: 30 }, buildSeconds: 12, supply: 8 },
  acid_mound: { cost: { sugar: 90, leaf: 40 }, buildSeconds: 16 },
  nursery: { cost: { sugar: 120, leaf: 80 }, buildSeconds: 18 },
  granary: { cost: { sugar: 70, leaf: 40 }, buildSeconds: 10 },
};

/** What building `id` costs and takes, or undefined when the player cannot build it. */
export const buildingDef = byId<BuildingDef>(BUILDINGS);

/** The resource node `catalogId` places, or undefined when it is not a node. */
export const nodeDef = byId<NodeDef>(NODES);

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
