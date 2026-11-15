import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { campaign, type CampaignState } from "./campaign";
import { TOWER_IDS } from "./entities/towers/catalog";

/**
 * The union hall between days: the career's dues buy new hires (a new career starts with four
 * trades and unlocks the rest one by one), permanent training for a trade, and town upgrades. Dues
 * come from every finished day. All of it rides on the career's campaign save.
 */

export interface UnionState {
  /** Dues on hand. */
  dues: number;
  /** Trades hired beyond the starting crew. */
  hired: string[];
  /** Training ranks per trade. */
  training: Record<string, number>;
  /** Town upgrade ranks. */
  town: Record<string, number>;
}

/** The trades a new career can hire on day one. */
export const STARTER_CREW: readonly string[] = ["worker_barista", "worker_farmer", "worker_plumber", "worker_teacher"];

/** What each further trade costs to bring into the union, in the order the hall offers them. */
export const HIRE_DUES: Readonly<Record<string, number>> = {
  worker_grandma: 15,
  worker_electrician: 20,
  worker_librarian: 20,
  worker_construction: 25,
  worker_firefighter: 25,
  worker_janitor: 25,
  worker_mail: 30,
  worker_monk: 30,
  worker_itguy: 35,
  worker_lawyer: 40,
};

/** Training: each rank adds `damage` to every worker of the trade; a rank costs `dues * (rank + 1)`. */
export const TRAINING = { maxRank: 3, dues: 10, damage: 0.1 } as const;

export type TownUpgradeId = "landlines" | "library_card" | "block_party" | "bike_couriers";

export interface TownUpgradeDef {
  id: TownUpgradeId;
  label: string;
  detail: string;
  dues: number;
  maxRank: number;
  /** A trade the upgrade only makes sense with. */
  needs?: string;
}

export const TOWN_UPGRADES: readonly TownUpgradeDef[] = [
  { id: "landlines", label: "Landlines", detail: "Every distraction wears off 25% sooner: people call each other instead", dues: 25, maxRank: 1 },
  { id: "library_card", label: "Library Card Program", detail: "Librarians hush 1.5 m further and hit 25% harder", dues: 25, maxRank: 1, needs: "worker_librarian" },
  { id: "block_party", label: "Block Party", detail: "+3 attention span a rank: the neighbors know each other", dues: 20, maxRank: 2 },
  { id: "bike_couriers", label: "Bike Couriers", detail: "+20 cash in every opening till a rank", dues: 15, maxRank: 2 },
];

export function freshUnion(): UnionState {
  return { dues: 0, hired: [], training: {}, town: {} };
}

/** Dues a finished day pays into the hall: a share per wave reached, more per star, and a bonus for a held street. */
export function duesFor(held: boolean, wave: number, stars: number): number {
  return Math.max(0, Math.round(wave + stars * 4 + (held ? 6 : 0)));
}

export function isHired(state: CampaignState, kind: string): boolean {
  return STARTER_CREW.includes(kind) || state.union.hired.includes(kind);
}

/** The trades the build bar offers right now. */
export function hiredTrades(state: CampaignState): string[] {
  return TOWER_IDS.filter((kind) => isHired(state, kind));
}

export function trainingRank(state: CampaignState, kind: string): number {
  return state.union.training[kind] ?? 0;
}

export function townRank(state: CampaignState, id: TownUpgradeId): number {
  return state.union.town[id] ?? 0;
}

export function trainingCost(state: CampaignState, kind: string): number {
  return TRAINING.dues * (trainingRank(state, kind) + 1);
}

/** Why the hall refuses a purchase, or null when it can go through. */
export function unionRefusal(state: CampaignState, offer: { hire: string } | { train: string } | { town: TownUpgradeId }): string | null {
  if ("hire" in offer) {
    const cost = HIRE_DUES[offer.hire];
    if (cost === undefined || isHired(state, offer.hire)) return "Already in the union";
    return state.union.dues >= cost ? null : `Needs ${cost - state.union.dues} more dues`;
  }
  if ("train" in offer) {
    if (!isHired(state, offer.train)) return "Hire the trade first";
    if (trainingRank(state, offer.train) >= TRAINING.maxRank) return "Fully trained";
    const cost = trainingCost(state, offer.train);
    return state.union.dues >= cost ? null : `Needs ${cost - state.union.dues} more dues`;
  }
  const def = TOWN_UPGRADES.find((upgrade) => upgrade.id === offer.town);
  if (def === undefined) return "No such upgrade";
  if (townRank(state, def.id) >= def.maxRank) return "Already built";
  if (def.needs !== undefined && !isHired(state, def.needs)) return "Hire the trade it serves first";
  return state.union.dues >= def.dues ? null : `Needs ${def.dues - state.union.dues} more dues`;
}

function write(ctx: GameContext, next: (state: CampaignState) => CampaignState["union"]): void {
  const state = campaign.read(ctx);
  campaign.write(ctx, { ...state, union: next(state) });
}

/** Spend dues in the hall. Returns whether it went through. */
export function buyUnion(ctx: GameContext, offer: { hire: string } | { train: string } | { town: TownUpgradeId }): boolean {
  const state = campaign.read(ctx);
  if (unionRefusal(state, offer) !== null) return false;
  if ("hire" in offer) {
    write(ctx, (s) => ({ ...s.union, dues: s.union.dues - HIRE_DUES[offer.hire]!, hired: [...s.union.hired, offer.hire] }));
  } else if ("train" in offer) {
    const cost = trainingCost(state, offer.train);
    write(ctx, (s) => ({ ...s.union, dues: s.union.dues - cost, training: { ...s.union.training, [offer.train]: trainingRank(s, offer.train) + 1 } }));
  } else {
    const def = TOWN_UPGRADES.find((upgrade) => upgrade.id === offer.town)!;
    write(ctx, (s) => ({ ...s.union, dues: s.union.dues - def.dues, town: { ...s.union.town, [def.id]: townRank(s, def.id) + 1 } }));
  }
  return true;
}

export function earnDues(ctx: GameContext, amount: number): void {
  if (amount <= 0) return;
  write(ctx, (s) => ({ ...s.union, dues: s.union.dues + amount }));
}

/** Every trade in the union at once (a host, a capture or a balance test that wants the full crew). */
export function unlockAllTrades(ctx: GameContext): void {
  write(ctx, (s) => ({ ...s.union, hired: Object.keys(HIRE_DUES) }));
}

/** The damage multiplier training (and the library card, for librarians) gives a trade. */
export function unionDamage(state: CampaignState, kind: string): number {
  const card = kind === "worker_librarian" && townRank(state, "library_card") > 0 ? 1.25 : 1;
  return (1 + TRAINING.damage * trainingRank(state, kind)) * card;
}

/** Extra reach a trade has from the town's upgrades. */
export function unionReach(state: CampaignState, kind: string): number {
  return kind === "worker_librarian" && townRank(state, "library_card") > 0 ? 1.5 : 0;
}

/** How long a distraction lasts, as a share: landlines cut it. */
export function distractionShare(state: CampaignState): number {
  return townRank(state, "landlines") > 0 ? 0.75 : 1;
}

/** Attention and opening cash the town upgrades add to every day. */
export function unionOpening(state: CampaignState): { lives: number; gold: number } {
  return { lives: 3 * townRank(state, "block_party"), gold: 20 * townRank(state, "bike_couriers") };
}

/** A stored union as this build reads it. */
export function readUnion(value: unknown): UnionState {
  const fresh = freshUnion();
  if (typeof value !== "object" || value === null) return fresh;
  const raw = value as Partial<UnionState>;
  const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  const ranks = (bag: unknown, valid: (id: string) => boolean, max: (id: string) => number) => {
    const out: Record<string, number> = {};
    for (const [id, rank] of Object.entries((bag ?? {}) as Record<string, unknown>)) if (valid(id) && count(rank) > 0) out[id] = Math.min(max(id), count(rank));
    return out;
  };
  return {
    dues: count(raw.dues),
    hired: Array.isArray(raw.hired) ? [...new Set(raw.hired.filter((id): id is string => typeof id === "string" && HIRE_DUES[id] !== undefined))] : [],
    training: ranks(raw.training, (id) => TOWER_IDS.includes(id), () => TRAINING.maxRank),
    town: ranks(raw.town, (id) => TOWN_UPGRADES.some((upgrade) => upgrade.id === id), (id) => TOWN_UPGRADES.find((upgrade) => upgrade.id === id)!.maxRank),
  };
}
