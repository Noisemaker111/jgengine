import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Reversi",
  presentation: "hud",
  input: keybinds,
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { followEntityId: null },
  touch: false,
  settings: {
    variant: "sidebar",
    hideBindings: ["undo", "rematch"],
    actions: [
      {
        id: "undo",
        label: "Undo move",
        description: "Take back the last move.",
        run: (ctx) => ctx.game.commands.run("undo", {}),
      },
      {
        id: "rematch",
        label: "New game",
        kind: "danger",
        description: "Start a fresh board with the current mode and level.",
        run: (ctx) => ctx.game.commands.run("rematch", {}),
      },
      {
        id: "resetRecords",
        label: "Reset records",
        kind: "danger",
        description: "Clear win, loss, and draw history against the AI.",
        run: (ctx) => ctx.game.commands.run("resetRecords", {}),
      },
    ],
  },
});
