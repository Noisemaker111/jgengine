import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Yacht Dice",
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  presentation: "hud",
  touch: false,
  settings: {
    variant: "panel",
    actions: [
      {
        id: "newGame",
        label: "New Game",
        kind: "danger",
        description: "Start a fresh scorecard with new dice rolls.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
    ],
  },
});
