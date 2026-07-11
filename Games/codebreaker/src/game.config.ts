import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Codebreaker",
  presentation: "hud",
  input: keybinds,
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { followEntityId: null },
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["newGame", "daily"],
    actions: [
      {
        id: "newGame",
        label: "New Game",
        kind: "danger",
        description: "Start a fresh ranked round with a new secret code.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
      {
        id: "daily",
        label: "Daily Puzzle",
        description: "Jump to today's shared daily challenge.",
        run: (ctx) => ctx.game.commands.run("daily", {}),
      },
    ],
  },
});
