import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { createSkillTree, type SkillNodeDef, type SkillResolution, type SkillTree, type SkillTreeState } from "@jgengine/core/progression/skillTree";

/**
 * The campaign above every defense: the difficulty the next keep is raised on, the best stars each
 * difficulty has earned, and the War Council those stars buy. The council is the engine skill tree,
 * so its ranks, exclusive doctrines and respec are the engine's rules; this file is its content.
 */

export type DifficultyId = "squire" | "knight" | "warlord";

export interface DifficultyDef {
  id: DifficultyId;
  label: string;
  detail: string;
  /** Raider health multiplier. */
  health: number;
  /** Armor every raider gains. */
  armor: number;
  lives: number;
  /** Gold added to (or taken from) the opening purse. */
  gold: number;
  /** Kill-pay multiplier. */
  bounty: number;
  /** Seconds between a wave arriving in full and the next one marching on its own. */
  intermission: number;
  /** Stars a hold on this difficulty can add on top of the lives it kept. */
  bonusStar: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  squire: { id: "squire", label: "Squire", detail: "Softer raiders, more lives, long breathers", health: 0.8, armor: 0, lives: 25, gold: 30, bounty: 1.1, intermission: 32, bonusStar: 0 },
  knight: { id: "knight", label: "Knight", detail: "The keep as it was built", health: 1, armor: 0, lives: 20, gold: 0, bounty: 1, intermission: 25, bonusStar: 0 },
  warlord: { id: "warlord", label: "Warlord", detail: "Tougher, armored raiders; twelve lives; short breathers. A hold earns a fourth star", health: 1.2, armor: 5, lives: 12, gold: -10, bounty: 0.95, intermission: 20, bonusStar: 1 },
};
export const DIFFICULTY_IDS: readonly DifficultyId[] = ["squire", "knight", "warlord"];

/** Stars a defense earns: none for a fall, then by the share of lives kept, plus the difficulty's bonus. */
export function starsFor(held: boolean, lives: number, livesMax: number, difficulty: DifficultyId): number {
  if (!held) return 0;
  const kept = livesMax <= 0 ? 0 : lives / livesMax;
  const base = kept >= 0.9 ? 3 : kept >= 0.5 ? 2 : 1;
  return base + DIFFICULTIES[difficulty].bonusStar;
}

/** The council's stats: multipliers on tower damage, ability strength and cooldown, and flat purse and walls. */
export type CouncilStat =
  | "archer_damage"
  | "cannon_damage"
  | "frost_damage"
  | "arcane_damage"
  | "range"
  | "opening_gold"
  | "lives"
  | "bounty"
  | "early_bonus"
  | "fire_damage"
  | "fire_cooldown"
  | "bell_cooldown";

export const COUNCIL_NODES: readonly (SkillNodeDef<CouncilStat> & { label: string; detail: string })[] = [
  { id: "fletchers", label: "Fletchers' Guild", detail: "Archer damage +10% a rank", branch: "arsenal", maxRank: 2, passives: { archer_damage: { multiply: 1.1 } } },
  { id: "foundry", label: "Gunfounders", detail: "Cannon damage +10% a rank", branch: "arsenal", maxRank: 2, passives: { cannon_damage: { multiply: 1.1 } } },
  { id: "frostwrights", label: "Frostwrights", detail: "Frost damage +15% a rank", branch: "arsenal", maxRank: 2, passives: { frost_damage: { multiply: 1.15 } } },
  { id: "lorekeepers", label: "Lorekeepers", detail: "Arcane damage +10% a rank", branch: "arsenal", maxRank: 2, passives: { arcane_damage: { multiply: 1.1 } } },
  { id: "surveyors", label: "Surveyors", detail: "Every tower reaches 0.6 m further", branch: "arsenal", cost: 2, requiresPointsInBranch: 2, passives: { range: { add: 0.6 } } },
  { id: "iron_doctrine", label: "Iron Doctrine", detail: "Archers and cannons +15%. Closes the Arcane Doctrine", branch: "arsenal", cost: 2, excludes: ["arcane_doctrine"], passives: { archer_damage: { multiply: 1.15 }, cannon_damage: { multiply: 1.15 } } },
  { id: "arcane_doctrine", label: "Arcane Doctrine", detail: "Frost and arcane +15%. Closes the Iron Doctrine", branch: "arsenal", cost: 2, excludes: ["iron_doctrine"], passives: { frost_damage: { multiply: 1.15 }, arcane_damage: { multiply: 1.15 } } },
  { id: "war_chest", label: "War Chest", detail: "+25 gold in the opening purse a rank", branch: "treasury", maxRank: 3, passives: { opening_gold: { add: 25 } } },
  { id: "masonry", label: "Masonry", detail: "+3 keep lives a rank", branch: "treasury", maxRank: 2, passives: { lives: { add: 3 } } },
  { id: "tithe", label: "Bounty Tithe", detail: "Kill pay +10%", branch: "treasury", cost: 2, requires: [{ nodeId: "war_chest" }], passives: { bounty: { multiply: 1.1 } } },
  { id: "heralds", label: "Heralds", detail: "Calling a wave early pays half again", branch: "treasury", passives: { early_bonus: { multiply: 1.5 } } },
  { id: "pyre", label: "Beacon Pyre", detail: "Beacon Fire burns 25% hotter a rank", branch: "rites", maxRank: 2, passives: { fire_damage: { multiply: 1.25 } } },
  { id: "kindling", label: "Kindling", detail: "Beacon Fire is back 20% sooner", branch: "rites", cost: 2, requires: [{ nodeId: "pyre" }], passives: { fire_cooldown: { multiply: 0.8 } } },
  { id: "bellwright", label: "Bellwright", detail: "The Frost Bell is back 15% sooner a rank", branch: "rites", maxRank: 2, passives: { bell_cooldown: { multiply: 0.85 } } },
];

export interface CampaignState {
  difficulty: DifficultyId;
  /** Best stars each difficulty has earned. */
  stars: Record<DifficultyId, number>;
  /** The council's spent ranks; its points are the stars, so they are not stored. */
  council: SkillTreeState;
}

export function freshCampaign(): CampaignState {
  return { difficulty: "knight", stars: { squire: 0, knight: 0, warlord: 0 }, council: { points: 0, ranks: {} } };
}

export const campaign = defineStore<CampaignState>("beacon:campaign", freshCampaign);

/** Council points: every best star across the difficulties. */
export function councilPoints(state: CampaignState): number {
  return DIFFICULTY_IDS.reduce((sum, id) => sum + state.stars[id], 0);
}

function buildTree(state: CampaignState): SkillTree<CouncilStat> {
  const tree = createSkillTree<CouncilStat>({ nodes: COUNCIL_NODES });
  tree.grantPoints(councilPoints(state));
  for (const [nodeId, ranks] of Object.entries(state.council.ranks)) {
    for (let rank = 0; rank < ranks; rank += 1) tree.spend(nodeId);
  }
  return tree;
}

const trees = perContext(() => ({ key: "", tree: null as SkillTree<CouncilStat> | null }));

/** The live council for the stored campaign, rebuilt when the stars or ranks change. */
export function councilTree(ctx: GameContext): SkillTree<CouncilStat> {
  const state = campaign.read(ctx);
  const cache = trees(ctx);
  const key = JSON.stringify([state.stars, state.council.ranks]);
  if (cache.tree === null || cache.key !== key) {
    cache.tree?.dispose();
    cache.tree = buildTree(state);
    cache.key = key;
  }
  return cache.tree;
}

/** What the council grants this run. */
export function councilBuild(ctx: GameContext): SkillResolution<CouncilStat> {
  return councilTree(ctx).resolved();
}

/** A council multiplier (1 when nothing is ranked). */
export function councilScale(ctx: GameContext, stat: CouncilStat): number {
  return councilBuild(ctx).stats[stat]?.multiply ?? 1;
}

/** A council flat bonus (0 when nothing is ranked). */
export function councilAdd(ctx: GameContext, stat: CouncilStat): number {
  return councilBuild(ctx).stats[stat]?.add ?? 0;
}

/** Spend one point on a council seat; refused (false) when the tree's rules say no. */
export function rankCouncil(ctx: GameContext, nodeId: string): boolean {
  const tree = councilTree(ctx);
  if (!tree.spend(nodeId).ok) return false;
  const state = campaign.read(ctx);
  campaign.write(ctx, { ...state, council: { points: 0, ranks: { ...tree.snapshot().ranks } } });
  return true;
}

/** Hand every council point back. */
export function resetCouncil(ctx: GameContext): void {
  const state = campaign.read(ctx);
  campaign.write(ctx, { ...state, council: { points: 0, ranks: {} } });
}

export function setDifficulty(ctx: GameContext, difficulty: DifficultyId): void {
  campaign.write(ctx, { ...campaign.read(ctx), difficulty });
}

export function difficultyOf(ctx: GameContext): DifficultyDef {
  return DIFFICULTIES[campaign.read(ctx).difficulty];
}

/** Record a finished defense's stars, keeping the best per difficulty. Returns the stars it earned. */
export function recordStars(ctx: GameContext, stars: number): number {
  const state = campaign.read(ctx);
  const best = Math.max(state.stars[state.difficulty], stars);
  if (best !== state.stars[state.difficulty]) campaign.write(ctx, { ...state, stars: { ...state.stars, [state.difficulty]: best } });
  return stars;
}

/** A stored campaign as this build reads it, or null when it is not one. */
export function readCampaign(value: unknown): CampaignState | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<CampaignState>;
  const difficulty = DIFFICULTY_IDS.includes(raw.difficulty as DifficultyId) ? (raw.difficulty as DifficultyId) : "knight";
  const stars = freshCampaign().stars;
  for (const id of DIFFICULTY_IDS) {
    const value = raw.stars?.[id];
    if (typeof value === "number" && Number.isFinite(value)) stars[id] = Math.max(0, Math.min(4, Math.round(value)));
  }
  const ranks: Record<string, number> = {};
  for (const [id, rank] of Object.entries(raw.council?.ranks ?? {})) {
    if (COUNCIL_NODES.some((node) => node.id === id) && typeof rank === "number" && rank > 0) ranks[id] = Math.round(rank);
  }
  return { difficulty, stars, council: { points: 0, ranks } };
}
