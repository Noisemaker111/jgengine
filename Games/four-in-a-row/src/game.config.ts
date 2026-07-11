import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Four in a Row",
  presentation: "hud",
  input: keybinds,
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { followEntityId: null },
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["rematch", "undoMove"],
    actions: [
      {
        id: "rematch",
        label: "Rematch",
        kind: "danger",
        description: "Start a fresh board with the same mode and swapped first player.",
        run: (ctx) => ctx.game.commands.run("rematch", {}),
      },
      {
        id: "undoMove",
        label: "Undo",
        description: "Take back the last move.",
        run: (ctx) => ctx.game.commands.run("undoMove", {}),
      },
      {
        id: "resetRecords",
        label: "Reset records",
        kind: "danger",
        description: "Clear win/loss/draw streaks against the AI.",
        run: (ctx) => ctx.game.commands.run("resetRecords", {}),
      },
    ],
  },
});
