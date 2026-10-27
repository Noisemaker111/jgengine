import type { NewGameState } from "@jgengine/core/game/newGame";

/** ARK's fresh survivor: washed up with empty hands and pockets, knowing only the level-1 engrams. */
export const START: NewGameState = {
  cash: {},
  kit: [],
  unlocked: ["stone_pick", "torch"],
  pieces: [],
  running: [],
};
