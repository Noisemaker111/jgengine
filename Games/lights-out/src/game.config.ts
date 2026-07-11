import { defineGame } from "@jgengine/shell/defineGame";

import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Lights Out",
  presentation: "hud",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { rig: "none", followEntityId: null },
  touch: false,
  settings: {
    variant: "panel",
    hideBindings: ["restart", "newBoard", "hint", "undo"],
    actions: [
      {
        id: "restart",
        label: "Restart puzzle",
        kind: "danger",
        description: "Reset the current board and replay it from scratch.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
      {
        id: "newBoard",
        label: "New random puzzle",
        description: "Scramble a fresh random board.",
        run: (ctx) => ctx.game.commands.run("newBoard", {}),
      },
      {
        id: "hint",
        label: "Show hint",
        description: "Reveal a cell that helps solve the board.",
        run: (ctx) => ctx.game.commands.run("hint", {}),
      },
      {
        id: "undo",
        label: "Undo last move",
        description: "Take back your last press.",
        run: (ctx) => ctx.game.commands.run("undo", {}),
      },
    ],
  },
});
