import type { ComponentType } from "react";

import type { PlayableGame } from "@jgengine/core/game/playableGame";
import { EnvironmentScene } from "@jgengine/shell/environment";
import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { content } from "./content";
import { game } from "./game.config";
import { onInit, onNewPlayer, onTick } from "./loop";
import { blockStackerStore } from "./tetris/store";
import { GameUI } from "./ui/GameUI";
import { world } from "./world";

function Backdrop() {
  return <EnvironmentScene feature={world} />;
}

export const blockStackerGame: PlayableGame<ComponentType, ComponentType> = {
  game,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  environment: Backdrop,
  camera: {
    rig: "rts",
    followEntityId: null,
    rts: { start: { x: 0, z: 0 }, height: 60, pitch: 1.0, panSpeed: 0, edgeScroll: false },
  },
};

export const blockStackerUiScenario: UiPreviewScenario = () => {
  blockStackerStore.reset("preview");
  const layout: { dx: number; rot: number }[] = [
    { dx: -4, rot: 0 },
    { dx: -2, rot: 1 },
    { dx: 0, rot: 0 },
    { dx: 2, rot: 1 },
    { dx: 4, rot: 0 },
    { dx: -3, rot: 0 },
  ];
  for (const { dx, rot } of layout) {
    if (rot !== 0) blockStackerStore.rotate(1);
    blockStackerStore.shift(dx);
    blockStackerStore.hardDrop();
  }
  blockStackerStore.shift(-1);
  blockStackerStore.rotate(1);
};
