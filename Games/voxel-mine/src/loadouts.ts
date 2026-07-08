import type { LoadoutDef } from "@jgengine/core/game/loadout";
import { HOTBAR_ITEMS } from "./blocks";

export const STARTER = "starter";

export const loadouts: Record<string, LoadoutDef> = {
  [STARTER]: {
    inventories: {
      hotbar: HOTBAR_ITEMS.map((item, slot) => ({
        item: item.id,
        count: item.kind === "block" ? 999 : 1,
        slot,
      })),
    },
  },
};
