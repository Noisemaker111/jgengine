import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Peg Solitaire",
  presentation: "hud",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  settings: {
    variant: "sidebar",
    hideBindings: ["undoMove", "showHint", "restartBoard"],
    actions: [
      {
        id: "undoMove",
        label: "Undo",
        description: "Take back the last hop.",
        run: (ctx) => ctx.game.commands.run("undoMove", {}),
      },
      {
        id: "showHint",
        label: "Show hint",
        description: "Reveal a possible jump.",
        run: (ctx) => ctx.game.commands.run("showHint", {}),
      },
      {
        id: "restartBoard",
        label: "Restart board",
        kind: "danger",
        description: "Clear every peg back to the starting layout.",
        run: (ctx) => ctx.game.commands.run("restartBoard", {}),
      },
    ],
  },
  camera: { rig: "none", followEntityId: null },
  touch: false,
});
