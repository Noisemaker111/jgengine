import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "FreeCell",
  presentation: "hud",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  settings: {
    variant: "sidebar",
    hideBindings: ["newDeal", "restart", "undo", "toggleAuto", "collect"],
    actions: [
      {
        id: "newDeal",
        label: "New deal",
        description: "Shuffle and deal a fresh random game.",
        run: (ctx) => ctx.game.commands.run("newDeal", {}),
      },
      {
        id: "restart",
        label: "Restart deal",
        kind: "danger",
        description: "Redeal the same game from the start.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
      {
        id: "undo",
        label: "Undo",
        description: "Take back the last move.",
        run: (ctx) => ctx.game.commands.run("undo", {}),
      },
      {
        id: "toggleAuto",
        label: "Toggle auto-play",
        description: "Turn automatic safe moves on or off.",
        run: (ctx) => ctx.game.commands.run("toggleAuto", {}),
      },
      {
        id: "collect",
        label: "Collect to foundations",
        description: "Auto-move eligible cards up to the foundations.",
        run: (ctx) => ctx.game.commands.run("collect", {}),
      },
    ],
  },
});
