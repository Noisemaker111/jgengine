import type { PlayableGame } from "@jgengine/shell/registry";
import { content } from "./content";
import { Environment } from "./Environment";
import { game } from "./game";
import { EYE_HEIGHT, loop } from "./loop";
import { getSelectedSlot } from "./selection";
import { GameUI } from "./ui/GameUI";

export const voxelMineGame: PlayableGame = {
  game,
  content,
  loop,
  GameUI,
  environment: Environment,
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: EYE_HEIGHT, reticle: true, viewmodel: false },
  },
  hotbarSelection: getSelectedSlot,
};
