import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Solid State Pinball",
  presentation: "hud",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  orientation: "portrait",
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["newGame"],
    actions: [
      {
        id: "newGame",
        label: "New game",
        kind: "danger",
        description: "Reset the table and start a fresh ball.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
    ],
  },
});
