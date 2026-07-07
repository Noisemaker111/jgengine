import type { ComponentType } from "react";
import type { PlayableGame } from "@jgengine/core/game/playableGame";
import { buses, entitySounds, sounds } from "./audio";
import { game } from "./game.config";
import { content } from "./content";
import { loop } from "./loop";
import { GameUI } from "./ui/GameUI";

export const lootShooterGame: PlayableGame<ComponentType, ComponentType> = {
  game,
  content,
  loop,
  GameUI,
  worldHealthBars: true,
  camera: {
    perspective: "first",
    firstPerson: { eyeHeight: 1.6, sensitivity: 0.0025, reticle: true, viewmodel: true },
  },
  audio: { sounds, buses },
  entitySounds,
};

export default lootShooterGame;
