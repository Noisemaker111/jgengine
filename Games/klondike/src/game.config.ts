import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Klondike Solitaire",
  presentation: "hud",
  input: keybinds,
  server: "persistent",
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  touch: false,
  settings: {
    variant: "sidebar",
    hideBindings: ["newDeal", "dailyDeal", "restart", "toggleDrawMode", "undo"],
    actions: [
      {
        id: "newDeal",
        label: "New game",
        kind: "danger",
        description: "Shuffle a fresh random deal.",
        run: (ctx) => ctx.game.commands.run("newDeal", {}),
      },
      {
        id: "dailyDeal",
        label: "Daily deal",
        kind: "danger",
        description: "Play today's shared daily deal.",
        run: (ctx) => ctx.game.commands.run("dailyDeal", {}),
      },
      {
        id: "restart",
        label: "Restart",
        kind: "danger",
        description: "Redeal the current game from the start.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
      {
        id: "toggleDrawMode",
        label: "Toggle draw mode",
        description: "Switch between drawing 1 or 3 cards at a time.",
        run: (ctx) => ctx.game.commands.run("toggleDrawMode", {}),
      },
      {
        id: "undo",
        label: "Undo",
        description: "Undo the last move.",
        run: (ctx) => ctx.game.commands.run("undo", {}),
      },
    ],
  },
});
