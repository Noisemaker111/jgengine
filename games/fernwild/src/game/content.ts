import type { GameContextEntityEntry, GameContextItemEntry } from "@jgengine/core/runtime/gameContext";

import { ITEMS } from "./data/items";
import { SPECIES } from "./data/species";
import { MAX_LEVEL, SURVIVOR } from "./data/survivor";

/** Every entity by catalog id: the survivor and each species. A creature's body stays where it falls, for harvesting. */
const entities: Record<string, GameContextEntityEntry> = {
  player: {
    role: "player",
    stats: { health: { max: SURVIVOR.health }, level: { max: MAX_LEVEL }, xp: { max: 5 } },
    receive: { damage: { order: ["health"] } },
    movement: { poses: ["standing", "running", "crouch"], walkSpeed: SURVIVOR.walkSpeed },
  },
  ...Object.fromEntries(
    Object.values(SPECIES).map((def): [string, GameContextEntityEntry] => [
      def.id,
      {
        role: "npc",
        stats: { health: { max: def.health.base } },
        receive: { damage: { order: ["health"] } },
        onDeath: { keep: true },
        movement: { walkSpeed: def.walk },
      },
    ]),
  ),
};

const items: Record<string, GameContextItemEntry> = Object.fromEntries(ITEMS.map((item) => [item.id, {}]));

export const content = {
  entityById: (id: string) => entities[id] ?? null,
  itemById: (id: string) => items[id] ?? null,
};
