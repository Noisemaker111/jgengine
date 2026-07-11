import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Mahjong Solitaire",
  presentation: "hud",
  input: keybinds,
  server: "persistent",
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["restart", "reshuffle", "newDeal", "dailyDeal"],
    actions: [
      {
        id: "restart",
        label: "Restart deal",
        kind: "danger",
        description: "Replay this exact deal from the start.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
      {
        id: "reshuffle",
        label: "Reshuffle board",
        description: "Reshuffle remaining tiles in place (uses a reshuffle).",
        run: (ctx) => ctx.game.commands.run("reshuffle", {}),
      },
      {
        id: "newDeal",
        label: "New deal",
        description: "Start a fresh random deal.",
        run: (ctx) => ctx.game.commands.run("newDeal", {}),
      },
      {
        id: "dailyDeal",
        label: "Daily deal",
        description: "Play today's daily deal.",
        run: (ctx) => ctx.game.commands.run("dailyDeal", {}),
      },
    ],
  },
});
