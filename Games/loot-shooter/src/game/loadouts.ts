import type { LoadoutDef } from "@jgengine/core/game/loadout";

export const loadouts: Record<string, LoadoutDef> = {
  starterKit: {
    inventories: {
      hotbar: [{ item: "pulse_rifle", count: 1, slot: 0 }],
    },
  },
};
