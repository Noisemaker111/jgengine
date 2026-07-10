import type { LoadoutDef } from "@jgengine/core/game/loadout";
import { STARTER_WEAPON_ID } from "./items/weapons/catalog";

export const loadouts: Record<string, LoadoutDef> = {
  starterKit: {
    inventories: {
      hotbar: [{ item: STARTER_WEAPON_ID, count: 1, slot: 0 }],
      backpack: [
        { item: "frag_grenade", count: 2 },
        { item: "medkit_small", count: 1 },
      ],
    },
  },
};
