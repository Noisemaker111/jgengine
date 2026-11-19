import { activeJobs, queuedJobs, type WorkQueueConfig } from "@jgengine/core/gameplay";
import { evaluatePredicate, type Predicate } from "@jgengine/core/rules/predicate";
import { foldStatContributions, type StatContribution } from "@jgengine/core/progression/statGraph";

import type { Cost } from "./catalog";
import { livingUnits, session } from "./session";
import type { Faction } from "./tuning";

export type ResearchStat = "dealt" | "taken" | "speed";

export interface UpgradeDef {
  id: string;
  label: string;
  blurb: string;
  maxRank: number;
  requires: Predicate;
  cost: (have: number) => Cost;
  /** Seconds to research the `have → have + 1` rank. */
  researchSeconds: (have: number) => number;
  effect: (stat: ResearchStat, rank: number) => StatContribution | null;
}

export const WEAPON_DMG_PER_RANK = 3;
export const ARMOR_REDUCE_PER_RANK = 2;
export const ASSAULT_DMG_PER_RANK = 3;
export const ASSAULT_SLOW_PER_RANK = 0.05;
export const BULWARK_GUARD_PER_RANK = 2;
export const BULWARK_DULL_PER_RANK = 1;

export type UpgradeId = "weapons" | "armor" | "assault" | "bulwark";

const atBarracks: Predicate = { eq: ["owns.barracks", true] };

function doctrine(rival: UpgradeId): Predicate {
  return { all: [atBarracks, { eq: [`have.${rival}`, 0] }] };
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDef>> = {
  weapons: {
    id: "weapons",
    label: "Iron Weapons",
    blurb: `+${WEAPON_DMG_PER_RANK} dmg`,
    maxRank: 3,
    requires: atBarracks,
    cost: (have) => ({ gold: 90 + have * 70, lumber: 40 + have * 30 }),
    researchSeconds: (have) => 18 + have * 8,
    effect: (stat, rank) => (stat === "dealt" ? { source: "Iron Weapons", op: "add", value: rank * WEAPON_DMG_PER_RANK } : null),
  },
  armor: {
    id: "armor",
    label: "Iron Armor",
    blurb: `-${ARMOR_REDUCE_PER_RANK} dmg taken`,
    maxRank: 3,
    requires: atBarracks,
    cost: (have) => ({ gold: 80 + have * 70, lumber: 50 + have * 30 }),
    researchSeconds: (have) => 18 + have * 8,
    effect: (stat, rank) => (stat === "taken" ? { source: "Iron Armor", op: "add", value: -rank * ARMOR_REDUCE_PER_RANK } : null),
  },
  assault: {
    id: "assault",
    label: "Assault Doctrine",
    blurb: `+${ASSAULT_DMG_PER_RANK} dmg, slower`,
    maxRank: 2,
    requires: doctrine("bulwark"),
    cost: (have) => ({ gold: 120 + have * 90, lumber: 40 + have * 40 }),
    researchSeconds: (have) => 22 + have * 10,
    effect: (stat, rank) => {
      if (stat === "dealt") return { source: "Assault Doctrine", op: "add", value: rank * ASSAULT_DMG_PER_RANK };
      if (stat === "speed") return { source: "Assault Doctrine", op: "mul", value: 1 - rank * ASSAULT_SLOW_PER_RANK };
      return null;
    },
  },
  bulwark: {
    id: "bulwark",
    label: "Bulwark Doctrine",
    blurb: `-${BULWARK_GUARD_PER_RANK} dmg taken, -${BULWARK_DULL_PER_RANK} dealt`,
    maxRank: 2,
    requires: doctrine("assault"),
    cost: (have) => ({ gold: 100 + have * 90, lumber: 60 + have * 40 }),
    researchSeconds: (have) => 22 + have * 10,
    effect: (stat, rank) => {
      if (stat === "taken") return { source: "Bulwark Doctrine", op: "add", value: -rank * BULWARK_GUARD_PER_RANK };
      if (stat === "dealt") return { source: "Bulwark Doctrine", op: "add", value: -rank * BULWARK_DULL_PER_RANK };
      return null;
    },
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES).filter((id): id is UpgradeId => id in UPGRADES);

const upgradeById = new Map<string, UpgradeDef>(Object.entries(UPGRADES));

/** Research `id` names, or undefined when there is no such research. */
export function upgradeDef(id: string): UpgradeDef | undefined {
  return upgradeById.get(id);
}

export interface ResearchSpec {
  upgradeId: string;
  toRank: number;
}

export const RESEARCH_CONFIG: WorkQueueConfig<ResearchSpec, undefined, ResearchSpec> = {
  duration: (spec) => upgradeDef(spec.upgradeId)?.researchSeconds(spec.toRank - 1) ?? 0,
  concurrency: 2,
  output: (job) => job.spec,
};

export function grantResearch(spec: ResearchSpec): void {
  const cur = session.research.ranks[spec.upgradeId] ?? 0;
  session.research.ranks[spec.upgradeId] = Math.max(cur, spec.toRank);
}

export function upgradeRank(id: string): number {
  return session.research.ranks[id] ?? 0;
}

export function pendingRanks(id: string): number {
  let n = 0;
  for (const job of activeJobs(session.research.queue)) if (job.spec.upgradeId === id) n += 1;
  for (const job of queuedJobs(session.research.queue)) if (job.spec.upgradeId === id) n += 1;
  return n;
}

/** Achieved + pending ranks — the effective level for cost/gating (can't research a rank twice). */
export function upgradeHave(id: string): number {
  return upgradeRank(id) + pendingRanks(id);
}

export function researchFacts(): { owns: Record<string, boolean>; have: Record<string, number> } {
  const owns: Record<string, boolean> = {};
  for (const building of livingUnits("player", "building")) owns[building.catalogId] = true;
  const have: Record<string, number> = {};
  for (const id of UPGRADE_IDS) have[id] = upgradeHave(id);
  return { owns, have };
}

export function researchUnlocked(id: string): boolean {
  const up = upgradeDef(id);
  return up !== undefined && evaluatePredicate(up.requires, researchFacts());
}

export function rankContributions(rankOf: (id: UpgradeId) => number, stat: ResearchStat): StatContribution[] {
  const out: StatContribution[] = [];
  for (const id of UPGRADE_IDS) {
    const rank = rankOf(id);
    if (rank === 0) continue;
    const step = UPGRADES[id].effect(stat, rank);
    if (step !== null) out.push(step);
  }
  return out;
}

/** Every finished rank's contribution to `stat` for `faction`; the Marauders do not research. */
export function researchContributions(faction: Faction, stat: ResearchStat): StatContribution[] {
  return faction === "player" ? rankContributions(upgradeRank, stat) : [];
}

/** Effective damage of a swing from `attacker` onto `defender` after both sides' research. Every hit
 * chips at least 1 so armour can soften but never fully negate a blow. */
export function factionDamage(base: number, attacker: Faction, defender: Faction): number {
  const dealt = foldStatContributions(base, researchContributions(attacker, "dealt"));
  return Math.max(1, foldStatContributions(dealt, researchContributions(defender, "taken")));
}

export function factionSpeed(base: number, faction: Faction): number {
  return Math.max(0, foldStatContributions(base, researchContributions(faction, "speed")));
}
