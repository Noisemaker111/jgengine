import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Flag Sweep",
  presentation: "hud",
  input: keybinds,
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { followEntityId: null },
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["newGame"],
    actions: [
      {
        id: "newGame",
        label: "New game",
        kind: "danger",
        description: "Clear the board and start a fresh sweep.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
    ],
  },
});
