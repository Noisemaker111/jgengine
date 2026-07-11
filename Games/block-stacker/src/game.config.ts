import { defineGame } from "@jgengine/shell/defineGame";

import { onInit, onNewPlayer, onTick } from "./loop";
import { physics, world } from "./world";
import { assets } from "./game/assets";
import { content } from "./game/content";
import { keybinds } from "./game/keybinds";
import { GameUI } from "./game/ui/GameUI";

export const game = defineGame({
  name: "Block Stacker",
  assets,
  world,
  physics,
  input: keybinds,
  server: { mode: "solo" },
  save: "none",
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  touch: {
    gestures: {
      tap: "rotateCw",
      swipeUp: "hold",
      swipeDown: "hardDrop",
      drag: { left: "shiftLeft", right: "shiftRight" },
    },
    buttons: [
      { action: "rotateCcw", label: "CCW" },
      { action: "softDrop", label: "Soft" },
    ],
  },
  camera: {
    rig: "rts",
    followEntityId: null,
    rts: { start: { x: 0, z: 0 }, height: 60, pitch: 1.0, panSpeed: 0, edgeScroll: false },
  },
  settings: {
    variant: "panel",
    hideBindings: ["restart"],
    actions: [
      {
        id: "restart",
        label: "Restart",
        kind: "danger",
        description: "Clear the board and start a fresh stack.",
        run: (ctx) => ctx.game.commands.run("restart", {}),
      },
    ],
  },
});
