import type { LoadoutDef } from "@jgengine/core/game/loadout";

export const loadouts: Record<string, LoadoutDef> = {
  starterKit: {
    inventories: {
      hotbar: [],
      backpack: [{ item: "medkit_street", count: 2 }],
    },
    economy: { cash: 250 },
  },
};
