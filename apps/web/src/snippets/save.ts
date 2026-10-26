import { createGameFlowSystem } from "@jgengine/core/game/gameFlow";
import { defineGame } from "@jgengine/shell/gameKit";

// A single-player game saves the whole world to localStorage by
// default. persist tunes it; the game-flow system adds the title,
// pause and checkpoint flow, and Continue.
export const game = defineGame({
  name: "Tide Runner",
  persist: { autosaveMs: 5_000, version: 2 },
  systems: [createGameFlowSystem({ checkpointEverySeconds: 60 })],
});
