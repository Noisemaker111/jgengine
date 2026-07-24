import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { entityModels, scatterModels } from "./game/models";
import { systems } from "./game/systems";
import { GameUI } from "./game/ui/GameUI";
import { TowerGuardWorldOverlay } from "./game/world/WorldOverlay";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Tower Guard",
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "defense" },
  content,
  systems,
  loop,
  GameUI,
  settings: {
    variant: "panel",
  },
  entityModels,
  // Draped creep path + instanced foliage render from the document; towers/creeps/props spawn as
  // entities in the loop, so object placement stays off — no double render.
  editorLayers,
  scenePlacement: false,
  sceneScatterModels: scatterModels,
  WorldOverlay: TowerGuardWorldOverlay,
  worldHealthBars: { statId: "health" },
  pointer: { moveCommand: "tower.build" },
  shadows: true,
  // Warm low sun rakes the relief so mounds, towers, and the keep cast long readable shadows; a cool
  // hemisphere fill keeps the shadow sides from going muddy black.
  lighting: {
    ambient: { color: "#9fb4cc", intensity: 0.4 },
    hemisphere: { skyColor: "#cfe0f2", groundColor: "#4a5a2e", intensity: 0.55 },
    directional: [
      {
        color: "#ffeccb",
        intensity: 1.35,
        position: [-34, 46, 22],
        castShadow: true,
        shadowMapSize: 2048,
        shadowCameraSize: 58,
      },
    ],
  },
  camera: {
    rig: "topDown",
    followEntityId: null,
    topDown: { height: 38, pitch: 1.08, yaw: Math.PI / 4, zoom: { min: 0.6, max: 1.8 } },
  },
});
