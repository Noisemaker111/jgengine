import type { GameContextEntityEntry, GameContextItemEntry } from "@jgengine/core/runtime/gameContext";

import { ITEMS } from "./data/items";
import { MAX_LEVEL, SURVIVOR } from "./data/survivor";

/** Every entity by catalog id: for now the survivor; creatures arrive with taming. */
const entities: Record<string, GameContextEntityEntry> = {
  player: {
    role: "player",
    stats: { health: { max: SURVIVOR.health }, level: { max: MAX_LEVEL }, xp: { max: 5 } },
    receive: { damage: { order: ["health"] } },
    movement: { poses: ["standing", "running", "crouch"], walkSpeed: SURVIVOR.walkSpeed },
  },
};

const items: Record<string, GameContextItemEntry> = Object.fromEntries(ITEMS.map((item) => [item.id, {}]));

export const content = {
  entityById: (id: string) => entities[id] ?? null,
  itemById: (id: string) => items[id] ?? null,
};
