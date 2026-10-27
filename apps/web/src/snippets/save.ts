import { createGameFlowSystem } from "@jgengine/core/game/gameFlow";
import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

// The whole world saves to localStorage: player, items, quests,
// enemies, your own stores. A new system is saved with no extra code.
export const game = defineGame({
  name: "Tide Runner",
  persist: { autosaveMs: 5_000, version: 2 },
  // Title, pause and a checkpoint every minute. Your title
  // menu's Continue button calls continueGame(ctx).
  systems: [createGameFlowSystem({ checkpointEverySeconds: 60 })],
  input: { ...DEFAULT_WALK_CODES, pause: ["Escape"] },
});
