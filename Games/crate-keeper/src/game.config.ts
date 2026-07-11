import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Crate Keeper",
  assets: createAssetCatalog(),
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  presentation: "hud",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  settings: {
    variant: "panel",
    hideBindings: ["restart", "undo", "select"],
    actions: [
      {
        id: "restart",
        label: "Restart level",
        kind: "danger",
        description: "Reset the current crate layout from scratch.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
      {
        id: "undo",
        label: "Undo move",
        description: "Step back one push.",
        run: (ctx) => ctx.game.commands.run("undo", {}),
      },
      {
        id: "select",
        label: "Level select",
        description: "Back out to the level menu.",
        run: (ctx) => ctx.game.commands.run("select", {}),
      },
    ],
  },
  camera: { followEntityId: null },
  touch: false,
});
