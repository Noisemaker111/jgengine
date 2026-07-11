import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "The 15 Puzzle",
  presentation: "hud",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { rig: "none", followEntityId: null },
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["restart", "newShuffle"],
    actions: [
      {
        id: "newShuffle",
        label: "New shuffle",
        description: "Scramble the tiles into a fresh puzzle.",
        run: (ctx) => ctx.game.commands.run("newShuffle", {}),
      },
      {
        id: "restart",
        label: "Restart",
        kind: "danger",
        description: "Reset the current puzzle back to its starting arrangement.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
