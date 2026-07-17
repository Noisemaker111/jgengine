import type { Faction } from "./tuning";

/**
 * The Ironhold roster. Positions are authored in `editor.scene.json`; this catalog holds the
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
  /** Gold awarded to the player when this dies (enemy units only). */
  bounty: number;
  /** Supply (food) this unit consumes; buildings cost 0. */
  food: number;
  /** True for the Peasant — can harvest resource nodes and build. */
  worker?: boolean;
}

/** What a producing building can train, its resource cost, and how long it takes. */
export interface TrainableDef {
  cost: Record<string, number>;
  trainSeconds: number;
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

export const COMBATANTS: Record<string, CombatantDef> = {
  // — Vanguard (player) —
  peasant: def({
    id: "peasant", label: "Peasant", faction: "player", kind: "unit",
    maxHealth: 70, walkSpeed: 4.6, damage: 4, attackRange: 1.6, attackCooldown: 1.4, aggroRadius: 4, food: 1, worker: true,
  }),
  footman: def({
    id: "footman", label: "Footman", faction: "player", kind: "unit",
    maxHealth: 130, walkSpeed: 4.7, damage: 9, attackRange: 1.9, attackCooldown: 0.85, aggroRadius: 8, food: 2,
  }),
  hero: def({
    id: "hero", label: "Bram the Bold", faction: "player", kind: "unit",
    maxHealth: 380, walkSpeed: 4.3, scale: 1.28, damage: 24, attackRange: 2.1, attackCooldown: 1, aggroRadius: 9, food: 5,
  }),
  keep_player: def({
    id: "keep_player", label: "Ironhold Keep", faction: "player", kind: "building",
    maxHealth: 1600, scale: 1,
  }),

  // — Marauders (enemy) —
  grunt: def({
    id: "grunt", label: "Marauder", faction: "enemy", kind: "unit",
    maxHealth: 110, walkSpeed: 4.3, damage: 8, attackRange: 1.9, attackCooldown: 1, aggroRadius: 8, bounty: 14,
  }),
  reaver: def({
    id: "reaver", label: "Reaver", faction: "enemy", kind: "unit",
    maxHealth: 240, walkSpeed: 3.9, scale: 1.22, damage: 17, attackRange: 2.1, attackCooldown: 1.1, aggroRadius: 9, bounty: 28,
  }),
  keep_enemy: def({
    id: "keep_enemy", label: "Marauder Warcamp", faction: "enemy", kind: "building",
    maxHealth: 1300, scale: 1,
  }),
};

/** Decorative props spawned from the scene — no health, not selectable. Forest fill is instanced
 * scatter (see scatterModels); these are the placed hero props: base dressing and resource nodes. */
export const DECOR = new Set(["banner_blue", "banner_red", "torch", "barrel"]);

/** Harvestable resource nodes: gold from mines, lumber from logging camps. Placed in the scene, they
 * spawn as inert prop entities the pointer can target and workers can gather from. */
export const NODES: Record<string, { resource: string; label: string }> = {
  goldmine: { resource: "gold", label: "Gold seam" },
  woods: { resource: "lumber", label: "Logging camp" },
};

/** What each producing building trains: cost (gold/lumber) and train time. */
export const TRAINABLE: Record<string, TrainableDef> = {
  peasant: { cost: { gold: 55 }, trainSeconds: 8 },
  footman: { cost: { gold: 80, lumber: 10 }, trainSeconds: 14 },
};

export function isNode(catalogId: string): boolean {
  return catalogId in NODES;
}

export function combatantDef(catalogId: string): CombatantDef | null {
  return COMBATANTS[catalogId] ?? null;
}

export function isHostile(a: Faction, b: Faction): boolean {
  return a !== b;
}
