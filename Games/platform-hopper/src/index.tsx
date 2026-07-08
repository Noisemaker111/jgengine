import type { PlayableGame } from "@jgengine/shell/registry";

import { entityById } from "./content";
import { game } from "./game.config";
import { onInit, onNewPlayer, onTick } from "./loop";
import { GameUI } from "./ui/GameUI";

const SIDE_VIEW_ENTITY = "dev-player";

export const platformHopperGame: PlayableGame = {
  game,
  content: { entityById },
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: {
    rig: "observer",
    observer: {
      bind: { kind: "entity", entityId: SIDE_VIEW_ENTITY },
      orbitSpeed: 0,
      startAngle: Math.PI,
      distance: 15,
      height: 3,
      lookHeight: 1.1,
    },
    transitionSeconds: 0,
  },
  worldHealthBars: false,
};
