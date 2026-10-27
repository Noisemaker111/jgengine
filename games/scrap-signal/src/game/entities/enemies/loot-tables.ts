import type { LootTableDef } from "@jgengine/core/loot/lootTable";

/**
 * What a kill drops besides guns and ammo: each roll may give cash and may give a health vial. Ammo
 * is rolled by the game for the guns the player carries (`ammoDrops.ts`), Borderlands' rule, so a
 * pistol-only start never drowns in rockets while its own pool runs dry.
 */
interface Profile {
  id: string;
  cash: [number, number];
  cashChance: number;
  healthChance: number;
  rolls: number;
}

const PROFILES: readonly Profile[] = [
  { id: "drops_bandit", cash: [2, 9], cashChance: 0.5, healthChance: 0.1, rolls: 1 },
  { id: "drops_ripper", cash: [1, 6], cashChance: 0.45, healthChance: 0.2, rolls: 1 },
  { id: "drops_tough", cash: [8, 20], cashChance: 0.45, healthChance: 0.15, rolls: 2 },
  { id: "drops_elite", cash: [20, 45], cashChance: 0.4, healthChance: 0.2, rolls: 2 },
  { id: "drops_boss", cash: [80, 160], cashChance: 0.5, healthChance: 0.2, rolls: 3 },
];

function buildTable(profile: Profile): LootTableDef {
  return {
    id: profile.id,
    rolls: profile.rolls,
    mode: "independent",
    entries: [
      { currency: "cash", count: profile.cash, chance: profile.cashChance },
      { item: "insta_health", count: 1, chance: profile.healthChance },
    ],
  };
}

export const lootTables: readonly LootTableDef[] = PROFILES.map(buildTable);
