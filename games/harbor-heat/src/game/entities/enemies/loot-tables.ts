import { lootTable } from "@jgengine/core/game/lootTable";

export const lootTables = [
  lootTable({
    id: "loot_ganger",
    entries: [
      { currency: "cash", count: [30, 80], weight: 6 },
      { item: "ammo_box_9mm", count: 1, weight: 3 },
      { item: "medkit_street", count: 1, weight: 1 },
    ],
  }),
  lootTable({
    id: "loot_enforcer",
    rolls: 2,
    entries: [
      { currency: "cash", count: [80, 160], weight: 5 },
      { item: "ammo_box_shell", count: 1, weight: 2 },
      { item: "grenade_pineapple", count: 1, weight: 2 },
      { item: "medkit_street", count: 1, weight: 1 },
    ],
  }),
  lootTable({
    id: "loot_cop",
    entries: [
      { item: "ammo_box_9mm", count: 1, weight: 5 },
      { currency: "cash", count: [10, 30], weight: 3 },
    ],
  }),
  lootTable({
    id: "loot_kingpin",
    rolls: 3,
    entries: [
      { currency: "cash", count: [800, 1500], weight: 5 },
      { item: "grenade_pineapple", count: [2, 4], weight: 2 },
      { item: "medkit_street", count: 2, weight: 2 },
    ],
  }),
  lootTable({
    id: "loot_ped",
    entries: [{ currency: "cash", count: [5, 25], weight: 1 }],
  }),
];
