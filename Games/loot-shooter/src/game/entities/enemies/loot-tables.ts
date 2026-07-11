import type { LootEntry, LootTableDef } from "@jgengine/core/game/lootTable";
import { RARITY_TIERS, weapons, type Rarity } from "../../items/weapons/catalog";

interface TierProfile {
  id: string;
  scrapWeight: number;
  scrapCount: [number, number];
  ammoWeight: number;
  medkitWeight: number;
  weaponWeight: number;
  rarityFloor: Rarity;
  rolls: number;
}

const TIER_PROFILES: readonly TierProfile[] = [
  {
    id: "drops_grunt",
    scrapWeight: 46,
    scrapCount: [3, 8],
    ammoWeight: 30,
    medkitWeight: 4,
    weaponWeight: 20,
    rarityFloor: "common",
    rolls: 1,
  },
  {
    id: "drops_veteran",
    scrapWeight: 34,
    scrapCount: [8, 16],
    ammoWeight: 26,
    medkitWeight: 6,
    weaponWeight: 34,
    rarityFloor: "uncommon",
    rolls: 1,
  },
  {
    id: "drops_elite",
    scrapWeight: 22,
    scrapCount: [16, 30],
    ammoWeight: 18,
    medkitWeight: 8,
    weaponWeight: 52,
    rarityFloor: "rare",
    rolls: 2,
  },
  {
    id: "drops_boss",
    scrapWeight: 10,
    scrapCount: [40, 70],
    ammoWeight: 10,
    medkitWeight: 10,
    weaponWeight: 70,
    rarityFloor: "epic",
    rolls: 3,
  },
];

const RARITY_RANKS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

function weaponEntries(profile: TierProfile): LootEntry[] {
  const eligible = weapons.filter(
    (weapon) => RARITY_RANKS[weapon.rarity] >= RARITY_RANKS[profile.rarityFloor],
  );
  const totalRarityWeight = eligible.reduce(
    (sum, weapon) => sum + (RARITY_TIERS.find((tier) => tier.id === weapon.rarity)?.dropWeight ?? 1),
    0,
  );
  return eligible.map((weapon) => {
    const tierWeight = RARITY_TIERS.find((tier) => tier.id === weapon.rarity)?.dropWeight ?? 1;
    return {
      item: weapon.id,
      count: 1,
      weight: Math.max(0.05, (profile.weaponWeight * tierWeight) / totalRarityWeight),
    };
  });
}

function ammoEntries(profile: TierProfile): LootEntry[] {
  const size = profile.id === "drops_grunt" ? "small" : "large";
  const pools = ["light", "heavy", "shell", "energy"];
  return pools.map((pool) => ({
    item: `ammo_${pool}_${size}`,
    count: 1,
    weight: profile.ammoWeight / pools.length,
  }));
}

function medkitEntries(profile: TierProfile): LootEntry[] {
  const id = profile.id === "drops_grunt" || profile.id === "drops_veteran" ? "medkit_small" : "medkit_large";
  return [{ item: id, count: 1, weight: profile.medkitWeight }];
}

function buildTable(profile: TierProfile): LootTableDef {
  return {
    id: profile.id,
    rolls: profile.rolls,
    entries: [
      { currency: "scrap", count: profile.scrapCount, weight: profile.scrapWeight },
      ...ammoEntries(profile),
      ...medkitEntries(profile),
      ...weaponEntries(profile),
    ],
  };
}

const RARITY_MYSTERY_WEIGHTS: Partial<Record<Rarity, number>> = { rare: 55, epic: 32, legendary: 13 };

const mysteryCrate: LootTableDef = {
  id: "mystery_crate",
  rolls: 1,
  entries: weapons
    .filter((weapon) => RARITY_MYSTERY_WEIGHTS[weapon.rarity] !== undefined)
    .map((weapon) => ({
      item: weapon.id,
      count: 1,
      weight: RARITY_MYSTERY_WEIGHTS[weapon.rarity]!,
    })),
};

export const lootTables: readonly LootTableDef[] = [
  ...TIER_PROFILES.map((profile) => buildTable(profile)),
  mysteryCrate,
];
