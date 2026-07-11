import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Echo Lights",
  presentation: "hud",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  settings: {
    variant: "panel",
    hideBindings: ["newGame", "toggleMode", "daily"],
    actions: [
      {
        id: "newGame",
        label: "New game",
        kind: "danger",
        description: "Scrap the current sequence and start a fresh one.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
      {
        id: "toggleMode",
        label: "Switch mode",
        description: "Swap between Classic and Practice.",
        run: (ctx) => ctx.game.commands.run("toggleMode", {}),
      },
      {
        id: "daily",
        label: "Daily challenge",
        description: "Play today's shared sequence.",
        run: (ctx) => ctx.game.commands.run("daily", {}),
      },
    ],
  },
  touch: false,
});
