import type { LoadoutDef } from "@jgengine/core/game/loadout";

export const loadouts: Record<string, LoadoutDef> = {
  starterKit: {
    inventories: {
      hotbar: [
        { item: "iron_sword", count: 1, slot: 0 },
        { item: "fireball", count: 1, slot: 1 },
        { item: "frostbolt", count: 1, slot: 2 },
        { item: "flash_heal", count: 1, slot: 3 },
        { item: "health_potion", count: 3, slot: 4 },
      ],
    },
    economy: { gold: 10 },
  },
};
