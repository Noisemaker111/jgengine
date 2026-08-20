import { DEFAULT_WALK_CODES, defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { assets } from "./game/assets";
import { entityModels, objectModels } from "./game/models";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Flight Lab",
  assets,
  world,
  physics,
  // Per-mode bindings + POV live on the thing they control.
  // Creative: WASD strafe (A left, D right — never roll), Space/Ctrl vertical, Shift sprint.
  // Each mount declares its own bindings + camera; here the player flight declares creative bindings + a slightly wider chase.
  input: { ...DEFAULT_WALK_CODES, crouch: ["ControlLeft", "KeyC"], interact: ["KeyE"] },
  movement: {
    flight: {
      mode: "creative",
      speed: 10,
      verticalSpeed: 10,
      sprintMultiplier: 2.2,
      // bindings are per-flight — e.g. Q/E for vertical instead of Space/Ctrl, or Arrow keys for a cockpit:
      // bindings: { vertical: { positive: ["KeyQ"], negative: ["KeyE"] } },
      // camera: { distance: 10, height: 3, fov: { base: 68, max: 88, speedForMax: 22 } },
      camera: { distance: 12, height: 4 },
    },
  },
  capture: {
    probe: (ctx) => {
      const p = ctx.scene.entity.get(ctx.player.userId)?.position ?? [0, 0, 0];
      return { x: p[0], y: p[1], z: p[2] };
    },
  },
  systems,
  loop: { onNewPlayer },
  GameUI,
  editorLayers,
  entityModels,
  objectModels,
});
