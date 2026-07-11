import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Spider Solitaire",
  presentation: "hud",
  input: keybinds,
  server: "persistent",
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  touch: false,
  settings: {
    variant: "sidebar",
    hideBindings: ["newDeal", "dailyDeal", "restart", "dealStock", "undo"],
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
        description: "Reshuffle the current deal from scratch.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
      {
        id: "dealStock",
        label: "Deal",
        description: "Deal another row from the stock.",
        run: (ctx) => ctx.game.commands.run("dealStock", {}),
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
