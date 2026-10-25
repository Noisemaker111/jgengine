import type { WorldChanges } from "@jgengine/core/worldModel/worldModel";
import type { UpgradePathsDecl, UpgradeStepDecl } from "@jgengine/core/worldModel/upgradePaths";

import { editorLayers } from "../../../editorLayers";
import { towerDef, type TowerDef } from "./catalog";

/**
 * Every tower climbs two shared ranks, then commits to one of two paths that change how it fights,
 * not only how hard: a longbow outranges and pierces armor where a volley spreads fire across a
 * crowd; a mortar stuns a column where an ironshot battery strips its armor for everyone else.
 * The engine compiles each ladder into world actions (`upgradePathActions`), so price, refusal,
 * refund and save all come from the keep's world.
 */

/** An upgrade costs this share of the build price, times the rank it leaves. */
const TRUNK_SHARE = 0.75;
/** What each shared rank adds: damage and fire rate as a share of the base, range and splash in metres. */
const PER_RANK = { damage: 0.5, rate: 0.15, range: 0.5, splash: 0.3 } as const;

function gold(amount: number): WorldChanges {
  return { "keep.gold": -amount };
}

/** A step that pays `price`, records it on the tower (the sale reads `spent`) and changes `effect`. */
function step(label: string, detail: string, price: number, effect: WorldChanges): UpgradeStepDecl {
  return { label, detail, cost: gold(price), effect: { ...effect, spent: price }, note: `{target}: ${label}.` };
}

function trunk(def: TowerDef): UpgradeStepDecl[] {
  return [1, 2].map((rank) => {
    const price = Math.round(def.cost * TRUNK_SHARE * rank);
    return step(rank === 1 ? "Rank II" : "Rank III", `+${Math.round(PER_RANK.damage * 100)}% damage, faster, longer reach`, price, {
      damage: def.damage * PER_RANK.damage,
      rate: def.fireRateHz * PER_RANK.rate,
      range: PER_RANK.range,
      ...(def.splashRadius > 0 ? { splash: PER_RANK.splash } : {}),
    });
  });
}

const archer = towerDef("tower_archer", editorLayers);
const cannon = towerDef("tower_cannon", editorLayers);
const frost = towerDef("tower_frost", editorLayers);
const arcane = towerDef("tower_arcane", editorLayers);

export const TOWER_LADDERS: Record<string, UpgradePathsDecl> = {
  tower_archer: {
    kind: "tower_archer",
    trunk: trunk(archer),
    branches: [
      {
        id: "longbow",
        label: "Longbow Marksmen",
        detail: "Reach and armor-piercing shots for the heavy ones",
        steps: [
          step("Marksmen", "Range +3.5, damage +14, ignores 20 armor", 170, { range: 3.5, damage: 14, pen: 20 }),
          step("Headhunters", "Every 4th arrow strikes for triple; ignores 45 armor", 280, { damage: 12, pen: 25, crit_every: 4, crit_mult: 2 }),
        ],
      },
      {
        id: "volley",
        label: "Volley Rangers",
        detail: "Arrows for a whole column at once",
        steps: [
          step("Rangers", "Looses at 3 raiders, fires faster", 160, { shots: 2, rate: 0.6 }),
          step("Fire Archers", "4 raiders a volley; arrows set them burning", 260, { shots: 1, burn: 6 }),
        ],
      },
    ],
  },
  tower_cannon: {
    kind: "tower_cannon",
    trunk: trunk(cannon),
    branches: [
      {
        id: "mortar",
        label: "Siege Mortar",
        detail: "Long, wide shells that stagger a column",
        steps: [
          step("Mortar", "Range +4, wider blast, damage +30, slower", 190, { range: 4, splash: 1, damage: 30, rate: -0.15 }),
          step("Earthshaker", "Damage +60; every shell stuns what it hits", 300, { damage: 60, stun_ms: 500 }),
        ],
      },
      {
        id: "ironshot",
        label: "Ironshot Battery",
        detail: "Strips armor so every other tower bites",
        steps: [
          step("Ironshot", "Each hit cracks 10 armor (3 stacks), faster", 170, { shred: 1, rate: 0.5 }),
          step("Breaching Guns", "Cracks two stacks a hit, damage +25, faster", 270, { shred: 1, damage: 25, rate: 0.4 }),
        ],
      },
    ],
  },
  tower_frost: {
    kind: "tower_frost",
    trunk: trunk(frost),
    branches: [
      {
        id: "glacier",
        label: "Glacier Heart",
        detail: "Chills everything in reach at once",
        steps: [
          step("Hoarfrost", "Each pulse chills every raider in range, deeper", 150, { aura: 1, slow: -0.1 }),
          step("Deep Winter", "Deeper chill; chilled raiders take +25% from every tower", 240, { slow: -0.1, brittle: 0.25, damage: 6 }),
        ],
      },
      {
        id: "rime",
        label: "Rime Lance",
        detail: "Heavy shards that freeze a raider solid",
        steps: [
          step("Rime Lance", "Damage +24; every 4th hit freezes for 1 s", 160, { damage: 24, freeze_every: 4, freeze_ms: 1000 }),
          step("Shatterpoint", "Damage +40; every 3rd hit freezes; frozen raiders take double", 260, { damage: 40, freeze_every: -1, freeze_ms: 400, shatter: 1 }),
        ],
      },
    ],
  },
  tower_arcane: {
    kind: "tower_arcane",
    trunk: trunk(arcane),
    branches: [
      {
        id: "storm",
        label: "Storm Conduit",
        detail: "Bolts that jump from raider to raider",
        steps: [
          step("Conduit", "Each bolt jumps to 3 more raiders", 200, { chain: 3 }),
          step("Tempest", "Jumps to 5; damage +30", 320, { chain: 2, damage: 30 }),
        ],
      },
      {
        id: "ember",
        label: "Ember Sanctum",
        detail: "Sets raiders burning and melts wards",
        steps: [
          step("Ember Rite", "Burns 12 a second; ×2.5 against shields", 190, { burn: 12, shield_mult: 1.5 }),
          step("Immolation", "Burns 22 a second; bolts burst on landing", 300, { burn: 10, splash: 1.8, damage: 20 }),
        ],
      },
    ],
  },
};

/** The tower's live fact names beyond the ladder's own (`tier`, `branch`, `branch_tier`). */
export const TOWER_FACTS = [
  "spent",
  "damage",
  "range",
  "rate",
  "splash",
  "slow",
  "slow_ms",
  "shots",
  "chain",
  "burn",
  "shred",
  "pen",
  "crit_every",
  "crit_mult",
  "freeze_every",
  "freeze_ms",
  "stun_ms",
  "aura",
  "brittle",
  "shield_mult",
  "shatter",
] as const;
export type TowerFact = (typeof TOWER_FACTS)[number];

/** What a fresh tower of `def` stands with, before any rank. */
export function baseTowerFacts(def: TowerDef): Record<TowerFact, number> {
  return {
    spent: def.cost,
    damage: def.damage,
    range: def.range,
    rate: def.fireRateHz,
    splash: def.splashRadius,
    slow: def.slow?.factor ?? 1,
    slow_ms: def.slow?.durationMs ?? 0,
    shots: 1,
    chain: 0,
    burn: 0,
    shred: 0,
    pen: 0,
    crit_every: 0,
    crit_mult: 1,
    freeze_every: 0,
    freeze_ms: 0,
    stun_ms: 0,
    aura: 0,
    brittle: 0,
    shield_mult: 1,
    shatter: 0,
  };
}
