import type { TalentNodeDef, TalentSnapshot, TalentTree } from "@jgengine/core/game/talents";
import { talentTreeViewFrom, type TalentNodeView } from "@jgengine/core/game/talentTreeView";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { StatModifierSet } from "@jgengine/core/stats/statModifiers";

/**
 * Bram's field kit: the picks a level-up offers, authored as engine talent nodes.
 *
 * `@jgengine/core/game/talents` owns the model (points, prerequisites, ranks, grants, the stat and
 * ability resolution) and `talentTreeViewFrom` owns the render view the choice card reads. What Ember
 * owns is the content: which two picks each level offers, in its own voice, and the store the campaign
 * save keeps them in. The picked ranks are the only hero state that outlives a battle.
 */

/** Stats a pick may move. Read by the hero kit; the engine never interprets them. */
export type HeroPickStat = "damage" | "incoming" | "maxHealth" | "manaRegen" | "cooldown";

export type HeroPickKind = "active" | "passive";

/** A pick: an engine talent node plus the copy and art the field desk shows. */
export interface HeroPickDef extends TalentNodeDef<HeroPickStat> {
  label: string;
  blurb: string;
  icon: string;
  kind: HeroPickKind;
  /** The act this pick hands to the hero's bar (actives only). */
  act?: string;
}

/** The Vanguard's picks, in the order the campaign offers them. Ids are save data: never rename one. */
export const HERO_PICKS: readonly HeroPickDef[] = [
  {
    id: "muster",
    kind: "active",
    act: "banner",
    label: "Banner Muster",
    blurb: "Plant the Vanguard banner: the line strikes 30% harder for 8s.",
    icon: "rally",
    branch: "standard",
    maxRank: 1,
    grantsAbilities: ["banner"],
  },
  {
    id: "volley",
    kind: "active",
    act: "volley",
    label: "Ember Volley",
    blurb: "Signal the volley and every Marauder around Bram takes a rifle burst.",
    icon: "rifleman",
    branch: "standard",
    maxRank: 1,
    grantsAbilities: ["volley"],
  },
  {
    id: "ward",
    kind: "active",
    act: "ward",
    label: "Ash Ward",
    blurb: "Smother the line in ember smoke: blows land 45% softer for 6s.",
    icon: "shield",
    branch: "standard",
    maxRank: 1,
    grantsAbilities: ["ward"],
  },
  {
    id: "signet",
    kind: "passive",
    label: "Iron Signet",
    blurb: "A signet of the old watch: the line takes 12% less damage, every battle.",
    icon: "armor",
    branch: "kit",
    maxRank: 1,
    modifiersPerRank: { incoming: { multiply: 0.88 } },
  },
  {
    id: "draught",
    kind: "passive",
    label: "Kindling Draught",
    blurb: "Bram's flask: +2 mana per second, so his acts come back sooner.",
    icon: "mana",
    branch: "kit",
    maxRank: 1,
    modifiersPerRank: { manaRegen: { add: 2 } },
  },
  {
    id: "standard",
    kind: "passive",
    label: "Vanguard Standard",
    blurb: "+40 maximum health. Bram carries the standard into every battle.",
    icon: "helm",
    branch: "kit",
    maxRank: 1,
    modifiersPerRank: { maxHealth: { add: 40 } },
  },
  {
    id: "zeal",
    kind: "passive",
    label: "Ember Zeal",
    blurb: "The line hits 15% harder, every battle.",
    icon: "weapons",
    branch: "kit",
    maxRank: 1,
    modifiersPerRank: { damage: { multiply: 1.15 } },
  },
  {
    id: "tempo",
    kind: "passive",
    label: "Drilled Tempo",
    blurb: "Every hero act recharges 20% faster.",
    icon: "stopwatch",
    branch: "kit",
    maxRank: 1,
    modifiersPerRank: { cooldown: { multiply: 0.8 } },
  },
];

/** What each level-up offers, one active against one passive item. Levels outside this table offer nothing. */
export const LEVEL_OFFERS: Readonly<Record<number, readonly [string, string]>> = {
  2: ["muster", "signet"],
  3: ["volley", "draught"],
  4: ["ward", "standard"],
  5: ["zeal", "tempo"],
};

/** Top hero level that still has an offer, so the field desk knows when the kit is complete. */
export const LAST_OFFER_LEVEL = Math.max(...Object.keys(LEVEL_OFFERS).map(Number));

/** The campaign save's slot for the picked ranks (`{ pickId: 1 }`). */
export const heroPickStore = defineStore<Record<string, number>>("ember.hero.picks", () => ({}));

/** A saved kit naming a pick this build does not author: the save is stale, not the battle. */
export class HeroPickLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeroPickLoadError";
  }
}

function nodeById(nodes: readonly HeroPickDef[]): Map<string, HeroPickDef> {
  const map = new Map<string, HeroPickDef>();
  for (const node of nodes) map.set(node.id, node);
  return map;
}

/**
 * Check the authored offer table against the node catalog. A level offering an id nothing authored
 * would only surface mid-battle, so this runs at load and throws instead.
 */
export function assertPickCatalog(nodes: readonly HeroPickDef[] = HERO_PICKS, offers = LEVEL_OFFERS): void {
  const byId = nodeById(nodes);
  if (byId.size !== nodes.length) throw new HeroPickLoadError("hero picks: duplicate pick id");
  for (const node of nodes) {
    if (node.maxRank < 1) throw new HeroPickLoadError(`hero picks: "${node.id}" cannot be taken`);
    if (node.kind === "active" && node.act === undefined) throw new HeroPickLoadError(`hero picks: active "${node.id}" grants no act`);
  }
  for (const [level, pair] of Object.entries(offers)) {
    if (pair.length !== 2 || pair[0] === pair[1]) throw new HeroPickLoadError(`hero picks: level ${level} must offer two different picks`);
    for (const id of pair) {
      if (!byId.has(id)) throw new HeroPickLoadError(`hero picks: level ${level} offers unknown pick "${id}"`);
    }
  }
}

/**
 * Validate saved ranks against the authored catalog and return the ranks to hydrate. A saved id this
 * build does not author fails load here, by name, instead of becoming an unpickable ghost mid-battle.
 */
export function parseSavedPicks(saved: Readonly<Record<string, number>>, nodes: readonly HeroPickDef[] = HERO_PICKS): Record<string, number> {
  const byId = nodeById(nodes);
  const ranks: Record<string, number> = {};
  for (const [id, rank] of Object.entries(saved)) {
    const node = byId.get(id);
    if (node === undefined) throw new HeroPickLoadError(`hero picks: saved pick "${id}" does not exist`);
    if (!Number.isInteger(rank) || rank < 1 || rank > node.maxRank) {
      throw new HeroPickLoadError(`hero picks: saved rank ${rank} for "${id}" is outside 1..${node.maxRank}`);
    }
    ranks[id] = rank;
  }
  return ranks;
}

/** The ranks a live tree holds, in the shape the save keeps. */
export function pickedRanks(tree: TalentTree<HeroPickStat>): Record<string, number> {
  const snapshot: TalentSnapshot = tree.snapshot();
  return { ...snapshot.ranks };
}

/** Points spent on picks so far — one pick per level, so this is how many offers were answered. */
export function picksTaken(tree: TalentTree<HeroPickStat>): number {
  return tree.pointsSpent();
}

/** Render view of the whole kit, from the engine's talent-tree selector. */
export function pickView(nodes: readonly HeroPickDef[], tree: TalentTree<HeroPickStat>): TalentNodeView[] {
  return talentTreeViewFrom(nodes, (node) => ({
    rank: tree.rank(node.id),
    allocatable: tree.canAllocate(node.id).ok,
  })).nodes as TalentNodeView[];
}

/** The two options the next level offers, in authored order, or null once the kit is complete. */
export function offerFor(tree: TalentTree<HeroPickStat>, nodes: readonly HeroPickDef[] = HERO_PICKS, offers = LEVEL_OFFERS): { level: number; options: readonly TalentNodeView[] } | null {
  const level = 2 + picksTaken(tree);
  const pair = offers[level];
  if (pair === undefined) return null;
  const view = pickView(nodes, tree);
  const options = pair.map((id) => view.find((node) => node.id === id)).filter((node): node is TalentNodeView => node !== undefined);
  return options.length === 2 ? { level, options } : null;
}

/** The picks a hero already carries, by id, for the command card's kit line. */
export function carriedPicks(tree: TalentTree<HeroPickStat>, nodes: readonly HeroPickDef[] = HERO_PICKS): readonly HeroPickDef[] {
  return nodes.filter((node) => tree.rank(node.id) > 0);
}

/** Stat totals the picked nodes resolve to, straight from the engine model. */
export function pickStats(tree: TalentTree<HeroPickStat>): StatModifierSet<HeroPickStat> {
  return tree.resolved().stats;
}
