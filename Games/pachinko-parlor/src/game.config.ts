import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Pachinko Parlor",
  presentation: "hud",
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  touch: false,
});
