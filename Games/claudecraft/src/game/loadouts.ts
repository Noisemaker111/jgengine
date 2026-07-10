import type { LoadoutDef } from "@jgengine/core/game/loadout";

import { CLASSES } from "./classes/catalog";
import { COPPER } from "./model";

export const loadouts: Record<string, LoadoutDef> = Object.fromEntries(
  CLASSES.map((cls) => [
    `kit_${cls.id}`,
    {
      inventories: {
        bags: [
          { item: cls.startWeapon, count: 1 },
          { item: "baked_bread", count: 5 },
          { item: "spring_water", count: 5 },
          { item: "lesser_healing_potion", count: 2 },
        ],
      },
      economy: { [COPPER]: 40 },
    } satisfies LoadoutDef,
  ]),
);
