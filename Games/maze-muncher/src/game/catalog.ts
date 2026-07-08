import type { GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

import { GHOSTS } from "./maze";

export const MUNCHER = "muncher";
export const SCORE = "score";
export const LIVES = "lives";
export const START_LIVES = 3;

const ghostEntries: Record<string, GameContextEntityEntry> = {};
for (const ghost of GHOSTS) {
  ghostEntries[ghost.kind] = { role: "enemy", movement: { walkSpeed: 0 } };
}

export const entityCatalog: Record<string, GameContextEntityEntry> = {
  [MUNCHER]: {
    role: "player",
    movement: { walkSpeed: 4.2 },
    stats: {
      [SCORE]: { max: 9_999_999, min: 0, current: 0 },
      [LIVES]: { max: START_LIVES, min: 0, current: START_LIVES },
    },
  },
  ...ghostEntries,
};
