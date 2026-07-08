import { defineGame } from "@jgengine/shell/defineGame";
import { assets } from "./game/assets";
import { SlingshotOverlay } from "./game/combat/SlingshotOverlay";
import { GameUI } from "./game/ui/GameUI";
import { Backdrop } from "./game/world/Backdrop";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Slingshot Siege",
  assets,
  world,
  physics,
  loop,
  GameUI,
  WorldOverlay: SlingshotOverlay,
  environment: Backdrop,
  camera: {
    rig: "observer",
    observer: {
      bind: { kind: "point", position: { x: 9, y: 2, z: 0 } },
      distance: 20,
      height: 9,
      lookHeight: 2,
      orbitSpeed: 0,
      fov: 48,
    },
  },
});
