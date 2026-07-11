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
});
