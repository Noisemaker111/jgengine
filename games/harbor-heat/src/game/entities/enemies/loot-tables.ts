import { lootTable } from "@jgengine/core/loot/lootTable";

export const lootTables = [
  lootTable({
    id: "loot_cop",
    entries: [
      { currency: "cash", count: [10, 30], weight: 3 },
    ],
  }),
  lootTable({
    id: "loot_ped",
    entries: [{ currency: "cash", count: [5, 25], weight: 1 }],
  }),
];
