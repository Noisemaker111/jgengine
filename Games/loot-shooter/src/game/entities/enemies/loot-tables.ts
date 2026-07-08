import type { LootTableDef } from "@jgengine/core/game/lootTable";

export const lootTables: LootTableDef[] = [
  {
    id: "enemy-loot",
    rolls: 1,
    entries: [
      { currency: "scrap", count: [3, 8], weight: 60 },
      { item: "ammo_cell", count: [1, 2], weight: 40 },
    ],
  },
];
