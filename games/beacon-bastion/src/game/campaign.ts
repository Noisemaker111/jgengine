import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { createSkillTree, type SkillNodeDef, type SkillResolution, type SkillTree, type SkillTreeState } from "@jgengine/core/progression/skillTree";

/**
 * The campaign above every day on the street: the shift the next day is worked on, the best stars
 * each shift has earned, and the Town Council those stars buy. The council is the engine skill
 * tree, so its ranks, exclusive ordinances and respec are the engine's rules; this file is its content.
 */

export type DifficultyId = "parttime" | "fulltime" | "overtime";

export interface DifficultyDef {
  id: DifficultyId;
  label: string;
  detail: string;
  /** Tech health multiplier. */
  health: number;
  /** Armor every piece of tech gains. */
  armor: number;
  lives: number;
  /** Cash added to (or taken from) the opening till. */
  gold: number;
  /** Kill-pay multiplier. */
  bounty: number;
  /** Seconds between a wave arriving in full and the next one marching on its own. */
  intermission: number;
  /** Stars a held day on this shift can add on top of the attention it kept. */
  bonusStar: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  parttime: { id: "parttime", label: "Part-Time", detail: "Flimsier tech, a longer attention span, long breaks", health: 0.8, armor: 0, lives: 25, gold: 30, bounty: 1.1, intermission: 32, bonusStar: 0 },
  fulltime: { id: "fulltime", label: "Full-Time", detail: "An ordinary day on the street", health: 1, armor: 0, lives: 20, gold: 0, bounty: 1, intermission: 25, bonusStar: 0 },
  overtime: { id: "overtime", label: "Overtime", detail: "Tougher, armored tech; twelve attention; short breaks. A held day earns a fourth star", health: 1.2, armor: 5, lives: 12, gold: -10, bounty: 0.95, intermission: 20, bonusStar: 1 },
};
export const DIFFICULTY_IDS: readonly DifficultyId[] = ["parttime", "fulltime", "overtime"];

/** Stars a day earns: none for a loss, then by the share of attention kept, plus the shift's bonus. */
export function starsFor(held: boolean, lives: number, livesMax: number, difficulty: DifficultyId): number {
  if (!held) return 0;
  const kept = livesMax <= 0 ? 0 : lives / livesMax;
  const base = kept >= 0.9 ? 3 : kept >= 0.5 ? 2 : 1;
  return base + DIFFICULTIES[difficulty].bonusStar;
}

/** The council's stats: multipliers on worker damage, ability strength and cooldown, and flat cash and attention. */
export type CouncilStat =
  | "service_damage"
  | "trades_damage"
  | "civic_damage"
  | "range"
  | "opening_gold"
  | "lives"
  | "bounty"
  | "early_bonus"
  | "blackout_damage"
  | "blackout_cooldown"
  | "dnd_cooldown";

export const COUNCIL_NODES: readonly (SkillNodeDef<CouncilStat> & { label: string; detail: string })[] = [
  { id: "service", label: "Service Industry Week", detail: "Hot and water damage +10% a rank (baristas, plumbers, firefighters)", branch: "union", maxRank: 2, passives: { service_damage: { multiply: 1.1 } } },
  { id: "trades", label: "Trades Apprenticeships", detail: "Shock, blunt and pierce damage +10% a rank", branch: "union", maxRank: 2, passives: { trades_damage: { multiply: 1.1 } } },
  { id: "civics", label: "Civics Class", detail: "Legal and analog damage +15% a rank", branch: "union", maxRank: 2, passives: { civic_damage: { multiply: 1.15 } } },
  { id: "sidewalks", label: "Wider Sidewalks", detail: "Every worker reaches 0.6 m further", branch: "union", cost: 2, requiresPointsInBranch: 2, passives: { range: { add: 0.6 } } },
  { id: "blue_collar", label: "Blue-Collar Ordinance", detail: "Service and trades +15%. Closes the Civic Ordinance", branch: "union", cost: 2, excludes: ["civic_ordinance"], passives: { service_damage: { multiply: 1.15 }, trades_damage: { multiply: 1.15 } } },
  { id: "civic_ordinance", label: "Civic Ordinance", detail: "Civic +25% and trades +5%. Closes the Blue-Collar Ordinance", branch: "union", cost: 2, excludes: ["blue_collar"], passives: { civic_damage: { multiply: 1.25 }, trades_damage: { multiply: 1.05 } } },
  { id: "bake_sale", label: "Bake Sale", detail: "+25 cash in the opening till a rank", branch: "budget", maxRank: 3, passives: { opening_gold: { add: 25 } } },
  { id: "yoga", label: "Lunchtime Yoga", detail: "+3 attention span a rank", branch: "budget", maxRank: 2, passives: { lives: { add: 3 } } },
  { id: "recycling", label: "Recycling Program", detail: "Cash per kill +10%", branch: "budget", cost: 2, requires: [{ nodeId: "bake_sale" }], passives: { bounty: { multiply: 1.1 } } },
  { id: "early_bird", label: "Early Bird Special", detail: "Calling a wave early pays half again", branch: "budget", passives: { early_bonus: { multiply: 1.5 } } },
  { id: "grid", label: "Old Power Grid", detail: "Blackout hits 25% harder a rank", branch: "rituals", maxRank: 2, passives: { blackout_damage: { multiply: 1.25 } } },
  { id: "fuse_box", label: "Spare Fuses", detail: "Blackout is back 20% sooner", branch: "rituals", cost: 2, requires: [{ nodeId: "grid" }], passives: { blackout_cooldown: { multiply: 0.8 } } },
  { id: "sabbath", label: "Screen-Free Sundays", detail: "Do Not Disturb is back 15% sooner a rank", branch: "rituals", maxRank: 2, passives: { dnd_cooldown: { multiply: 0.85 } } },
];

export interface CampaignState {
  difficulty: DifficultyId;
  /** Best stars each shift has earned. */
  stars: Record<DifficultyId, number>;
  /** The council's spent ranks; its points are the stars, so they are not stored. */
  council: SkillTreeState;
  /** The season: best stars each district (map) has been held for. A district is open once the one before it is held. */
  districts: Record<string, number>;
}

export function freshCampaign(): CampaignState {
  return { difficulty: "fulltime", stars: { parttime: 0, fulltime: 0, overtime: 0 }, council: { points: 0, ranks: {} }, districts: {} };
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
  const difficulty = DIFFICULTY_IDS.includes(raw.difficulty as DifficultyId) ? (raw.difficulty as DifficultyId) : "fulltime";
  const stars = freshCampaign().stars;
  for (const id of DIFFICULTY_IDS) {
    const value = raw.stars?.[id];
    if (typeof value === "number" && Number.isFinite(value)) stars[id] = Math.max(0, Math.min(4, Math.round(value)));
  }
  const ranks: Record<string, number> = {};
  for (const [id, rank] of Object.entries(raw.council?.ranks ?? {})) {
    if (COUNCIL_NODES.some((node) => node.id === id) && typeof rank === "number" && rank > 0) ranks[id] = Math.round(rank);
  }
  const districts: Record<string, number> = {};
  for (const [id, best] of Object.entries((raw.districts ?? {}) as Record<string, unknown>)) {
    if (typeof best === "number" && Number.isFinite(best) && best > 0) districts[id] = Math.max(0, Math.min(4, Math.round(best)));
  }
  return { difficulty, stars, council: { points: 0, ranks }, districts };
}
