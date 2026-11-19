import type { NewGameState } from "@jgengine/core/game/newGame";

export const START: NewGameState = {
  cash: {},
  kit: [],
  unlocked: ["stone_pick", "torch"],
  pieces: [],
  running: [],
};
