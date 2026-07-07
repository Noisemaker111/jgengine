import type { ComponentType } from "react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PlayableGame } from "@jgengine/core/game/playableGame";
import { game } from "./game.config";
import { content } from "./content";
import { loop } from "./loop";
import { stagePreview } from "./session/raid";
import { GameUI } from "./ui/GameUI";

export function lootShooterUiScenario(ctx: GameContext): void {
  for (let i = 0; i < 60; i += 1) loop.onTick(ctx, 1 / 60);
  stagePreview();
}

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
};

export default lootShooterGame;
