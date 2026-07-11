import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Paddle Duel",
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  presentation: "hud",
  camera: { followEntityId: null },
  orientation: "landscape",
  touch: false,
  settings: {
    variant: "panel",
    actions: [
      {
        id: "rematch",
        label: "Rematch",
        kind: "danger",
        description: "Reset the score and serve a fresh match.",
        run: (ctx) => ctx.game.commands.run("rematch", {}),
      },
    ],
  },
});
