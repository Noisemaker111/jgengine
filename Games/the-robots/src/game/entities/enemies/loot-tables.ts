import type { LootTableDef } from "@jgengine/core/game/lootTable";

interface Profile {
  id: string;
  cash: [number, number];
  cashWeight: number;
  ammoWeight: number;
  healthWeight: number;
  rolls: number;
}

const PROFILES: readonly Profile[] = [
  { id: "drops_bandit", cash: [2, 9], cashWeight: 50, ammoWeight: 40, healthWeight: 10, rolls: 1 },
  { id: "drops_skag", cash: [1, 6], cashWeight: 45, ammoWeight: 35, healthWeight: 20, rolls: 1 },
  { id: "drops_tough", cash: [8, 20], cashWeight: 45, ammoWeight: 40, healthWeight: 15, rolls: 2 },
  { id: "drops_badass", cash: [20, 45], cashWeight: 40, ammoWeight: 40, healthWeight: 20, rolls: 2 },
  { id: "drops_boss", cash: [80, 160], cashWeight: 50, ammoWeight: 30, healthWeight: 20, rolls: 3 },
];

const AMMO_ITEMS = ["ammo_pistol_pack", "ammo_smg_pack", "ammo_shotgun_pack", "ammo_rifle_pack", "ammo_sniper_pack", "ammo_rocket_pack"];

function buildTable(profile: Profile): LootTableDef {
  return {
    id: profile.id,
    rolls: profile.rolls,
    entries: [
      { currency: "cash", count: profile.cash, weight: profile.cashWeight },
      ...AMMO_ITEMS.map((item) => ({ item, count: 1 as const, weight: profile.ammoWeight / AMMO_ITEMS.length })),
      { item: "insta_health", count: 1, weight: profile.healthWeight },
    ],
  };
}

export const lootTables: readonly LootTableDef[] = PROFILES.map(buildTable);
