import { defineGame } from "@jgengine/shell/defineGame";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { objectStyles } from "./game/objects/catalog";
import { GameUI } from "./game/ui/GameUI";
import { renderVehicleEntity } from "./game/world/vehicleRender";
import { loop } from "./loop";
import { physics, world } from "./world";

export const game = defineGame({
  name: "Canyon Chase",
  world,
  physics,
  input: keybinds,
  content,
  loop,
  GameUI,
  camera: {
    rig: "chase",
    chase: {
      distance: 9.5,
      springDamping: 6,
      fov: { base: 62, max: 80, speedForMax: 34 },
      shakePerSpeed: 0.012,
      view: "chase",
    },
  },
  renderEntity: renderVehicleEntity,
  objectStyles,
  orientation: { mobile: "landscape-required" },
  touch: {
    movement: { axis: "horizontal" },
    style: "mechanical",
    layout: { utility: "top-right" },
    buttons: [
      { action: "throttle", shape: "pedal", anchor: "right" },
      { action: "brake", shape: "pedal", anchor: "right" },
      { action: "handbrake", shape: "lever", anchor: "bottom-right" },
      { action: "surveyMap", kind: "utility" },
    ],
  },
  settings: {
    variant: "sheet",
    hideBindings: ["restart", "startRun"],
    actions: [
      {
        id: "restart",
        label: "Restart run",
        kind: "danger",
        description: "Chase the smuggler again from the border checkpoint.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
  devtools: true,
});
