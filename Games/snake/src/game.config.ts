import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Snake",
  assets: createAssetCatalog(),
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  presentation: "hud",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  touch: {
    gestures: {
      swipeUp: "steerUp",
      swipeDown: "steerDown",
      swipeLeft: "steerLeft",
      swipeRight: "steerRight",
      tap: "confirm",
    },
  },
  settings: {
    variant: "panel",
    hideBindings: ["restart"],
    actions: [
      {
        id: "restart",
        label: "Restart",
        kind: "danger",
        description: "Clear the board and start a fresh run.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
