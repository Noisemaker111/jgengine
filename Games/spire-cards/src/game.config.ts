import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";

export const game = defineGame({
  name: "Spire Cards",
  assets: createAssetCatalog(),
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { followEntityId: null },
  touch: false,
  settings: {
    variant: "sidebar",
    hideBindings: ["startNewRun"],
    actions: [
      {
        id: "startNewRun",
        label: "New run",
        kind: "danger",
        description: "Abandon this run and climb the spire again from the start.",
        run: (ctx) => ctx.game.commands.run("startNewRun", {}),
      },
    ],
  },
});
