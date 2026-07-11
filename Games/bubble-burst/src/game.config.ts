import { defineGame } from "@jgengine/shell/defineGame";

import { onInit, onNewPlayer, onTick } from "./loop";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";

export const game = defineGame({
  name: "Bubble Burst",
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
    variant: "panel",
    hideBindings: ["restart"],
    actions: [
      {
        id: "restart",
        label: "Restart",
        kind: "danger",
        description: "Clear the tank and start a fresh climb from the top.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
