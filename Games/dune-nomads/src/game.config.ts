import { defineGame } from "@jgengine/shell/defineGame";

import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";
import { renderCaravanEntity } from "./game/world/renderCamels";
import { renderDuneObject } from "./game/world/renderProps";
import { oasisPrompts } from "./game/world/prompts";
import { lifecycle, onInit, onNewPlayer, onTick } from "./loop";
import { world } from "./world";

export const game = defineGame({
  name: "Dune Nomads",
  world,
  content,
  input: keybinds,
  loop: { onInit, onNewPlayer, onTick },
  lifecycle,
  GameUI,
  capture: { play: ["start"] },
  settings: {
    variant: "sheet",
    hideBindings: ["restart", "toggleMap", "start"],
    actions: [
      {
        id: "restart",
        label: "Restart caravan",
        kind: "danger",
        description: "Reset the caravan and route from the start oasis.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
      {
        id: "toggleMap",
        label: "Toggle route map",
        description: "Show or hide the caravan's pinned route.",
        run: (ctx) => ctx.game.commands.run("toggleMap", {}),
      },
    ],
  },
  renderEntity: renderCaravanEntity,
  renderObject: renderDuneObject,
  prompts: oasisPrompts,
  shadows: true,
  camera: {
    rig: "chase",
    chase: {
      distance: 15,
      height: 8.5,
      lookHeight: 2.2,
      springDamping: 4.5,
      fov: { base: 56, max: 64, speedForMax: 30 },
      shakePerSpeed: 0,
    },
    frustum: { far: 3200 },
  },
});
