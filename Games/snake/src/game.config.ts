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
});
