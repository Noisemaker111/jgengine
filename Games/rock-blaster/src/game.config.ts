import { defineGame } from "@jgengine/shell/defineGame";

import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Rock Blaster",
  assets,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  presentation: "hud",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { followEntityId: null },
  touch: false,
  settings: {
    variant: "sheet",
    hideBindings: ["restart"],
    actions: [
      {
        id: "restart",
        label: "Restart game",
        kind: "danger",
        description: "Reset score, lives, and wave back to the start.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
