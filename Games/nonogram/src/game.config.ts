import { defineGame } from "@jgengine/shell/defineGame";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  capture: { play: [{ name: "selectPuzzle", input: { id: "heart" } }] },
  name: "Nonogram",
  presentation: "hud",
  input: keybinds,
  save: "none",
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  settings: {
    variant: "sidebar",
    hideBindings: ["clearBoard"],
    actions: [
      {
        id: "clearBoard",
        label: "Clear board",
        kind: "danger",
        description: "Wipe every fill and cross, keep the same puzzle.",
        run: (ctx) => ctx.game.commands.run("clearBoard", {}),
      },
    ],
  },
  camera: { followEntityId: null },
  touch: false,
});
