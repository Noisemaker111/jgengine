import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { ROOF_OBJECTS } from "./game/objects/catalog";
import { renderRunner } from "./game/runners/render";
import { RUNNER_HALF_WIDTH, RUNNER_HEIGHT, RUNNER_STEP_HEIGHT } from "./game/tuning";
import { GameUI } from "./game/ui/GameUI";
import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";

const objectStyles = Object.fromEntries(Object.values(ROOF_OBJECTS).map((def) => [def.id, { color: def.color }]));

export const game = defineGame({
  name: "Rooftop Relay",
  world,
  physics,
  input: keybinds,
  server: "persistent",
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  renderEntity: renderRunner,
  objectStyles,
  collision: {
    voxel: true,
    halfWidth: RUNNER_HALF_WIDTH,
    height: RUNNER_HEIGHT,
    stepHeight: RUNNER_STEP_HEIGHT,
  },
  camera: {
    rig: "orbit",
    initialDistance: 8,
    minDistance: 4,
    maxDistance: 15,
    targetHeight: 1.6,
    minPolarAngle: 0.55,
    maxPolarAngle: 1.25,
    frustum: { far: 420 },
  },
});
