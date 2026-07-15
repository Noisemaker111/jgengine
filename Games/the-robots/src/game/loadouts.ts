import type { LoadoutDef } from "@jgengine/core/game/loadout";
import { starterPistol } from "./items/weapons/catalog";

export const loadouts: Record<string, LoadoutDef> = {
  starterKit: {
    inventories: {
      hotbar: [{ item: starterPistol.id, count: 1, slot: 0 }],
      backpack: [{ item: "insta_health", count: 2 }],
    },
    economy: { cash: 40 },
  },
};
