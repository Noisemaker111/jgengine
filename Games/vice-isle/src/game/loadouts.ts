import type { LoadoutDef } from "@jgengine/core/game/loadout";

export const loadouts: Record<string, LoadoutDef> = {
  starterKit: {
    inventories: {
      hotbar: [
        { item: "pistol_vice", count: 1, slot: 0 },
        { item: "grenade_pineapple", count: 1, slot: 3 },
      ],
      backpack: [
        { item: "medkit_street", count: 2 },
        { item: "grenade_pineapple", count: 2 },
      ],
    },
    economy: { cash: 250 },
  },
};
