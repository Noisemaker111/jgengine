import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { renderTracksideObject } from "./game/world/ObjectMeshes";
import { renderMover } from "./game/world/EntityMeshes";
import { RailRushersWorldOverlay } from "./game/world/WorldOverlay";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Rail Rushers",
  world,
  physics,
  input: keybinds,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  renderEntity: renderMover,
  renderObject: renderTracksideObject,
  WorldOverlay: RailRushersWorldOverlay,
  shadows: true,
  camera: {
    rig: "chase",
    chase: {
      distance: 8.5,
      height: 3.2,
      lookHeight: 1.1,
      springDamping: 6,
      fov: { base: 58, max: 74, speedForMax: 8 },
      shakePerSpeed: 0.01,
      view: "chase",
    },
  },
  settings: {
    variant: "sheet",
    hideBindings: ["restart", "confirm"],
    actions: [
      {
        id: "restart",
        label: "Restart run",
        kind: "danger",
        description: "Back to the terminus start, clock and junctions reset.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
