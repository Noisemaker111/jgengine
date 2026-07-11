import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Memory Match",
  presentation: "hud",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["newGame"],
    actions: [
      {
        id: "newGame",
        label: "New game",
        kind: "danger",
        description: "Shuffle and deal a fresh board.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
    ],
  },
});
