import type { LootTableDef } from "@jgengine/core/game/lootTable";

export const lootTables: LootTableDef[] = [
  {
    id: "loot_kobold_grunt",
    rolls: 1,
    entries: [
      { currency: "gold", count: [1, 4], weight: 60 },
      { item: "health_potion", count: 1, weight: 20 },
      { currency: "gold", count: [4, 7], weight: 20 },
    ],
  },
  {
    id: "loot_forest_wolf",
    rolls: 1,
    entries: [
      { currency: "gold", count: [2, 6], weight: 65 },
      { item: "health_potion", count: 1, weight: 35 },
    ],
  },
  {
    id: "loot_kobold_elite",
    rolls: 2,
    entries: [
      { currency: "gold", count: [15, 30], weight: 55 },
      { item: "health_potion", count: [1, 2], weight: 45 },
    ],
  },
];
