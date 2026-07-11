import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Slide 2048",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  presentation: "hud",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  settings: {
    variant: "sidebar",
    hideBindings: ["newGame", "undo"],
    actions: [
      {
        id: "newGame",
        label: "New game",
        kind: "danger",
        description: "Scramble a fresh board and start over.",
        run: (ctx) => ctx.game.commands.run("newGame", {}),
      },
      {
        id: "undo",
        label: "Undo",
        description: "Step back to the board before your last slide.",
        run: (ctx) => ctx.game.commands.run("undo", {}),
      },
    ],
  },
});
