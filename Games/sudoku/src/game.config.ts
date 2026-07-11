import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Sudoku",
  presentation: "hud",
  input: keybinds,
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { followEntityId: null },
  touch: false,
  settings: {
    variant: "sidebar",
    hideBindings: ["newGame", "daily"],
    actions: [
      {
        id: "newGame",
        label: "New game",
        kind: "danger",
        description: "Start a fresh random puzzle, discarding current progress.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
      {
        id: "daily",
        label: "Daily puzzle",
        kind: "danger",
        description: "Load today's daily puzzle, discarding current progress.",
        run: (ctx) => ctx.game.commands.run("daily", {}),
      },
    ],
  },
});
