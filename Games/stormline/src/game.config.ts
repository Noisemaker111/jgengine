import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { TRUCK_ENTITY_NAME } from "./game/entities/catalog";
import { keybinds } from "./game/keybinds";
import { OBJECT_IDS } from "./game/objects/catalog";
import { renderTruck } from "./game/render/TruckModel";
import { StormWallOverlay } from "./game/render/StormWallOverlay";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Stormline",
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: {
    rig: "chase",
    chase: {
      distance: 9,
      height: 3.2,
      lookHeight: 1.4,
      springDamping: 6,
      fov: { base: 62, max: 84, speedForMax: 32 },
      shakePerSpeed: 0.01,
    },
    frustum: { far: 1400 },
  },
  renderEntity: (entity) => (entity.name === TRUCK_ENTITY_NAME ? renderTruck() : undefined),
  WorldOverlay: StormWallOverlay,
  objectStyles: {
    [OBJECT_IDS.fencePost]: { color: "#3d4a5c" },
    [OBJECT_IDS.wreckTruck]: { color: "#5c4a3d" },
    [OBJECT_IDS.wreckSilo]: { color: "#6b6f63" },
  },
  settings: {
    variant: "panel",
    hideBindings: ["restart"],
    actions: [
      {
        id: "restart",
        label: "Restart run",
        kind: "danger",
        description: "Pull back to the checkpoint and outrun the storm again.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
