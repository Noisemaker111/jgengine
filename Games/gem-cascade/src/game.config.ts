import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Gem Cascade",
  input: keybinds,
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  presentation: "hud",
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["newGame"],
    actions: [
      {
        id: "newGame",
        label: "New game",
        kind: "danger",
        description: "Clear the board and start a fresh run.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
    ],
  },
});
