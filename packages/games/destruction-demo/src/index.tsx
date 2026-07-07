import type { ComponentType } from "react";

import { defineGame } from "@jgengine/core/game/defineGame";
import type { PlayableGame } from "@jgengine/core/game/playableGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { DestructionOverlay } from "./overlay";
import { initDemo, stepDemo } from "./state";
import { DestructionUI } from "./ui";

const CAMERA_ANCHOR = "demoAnchor";

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [CAMERA_ANCHOR]: {},
};

const game = defineGame({
  name: "destruction-demo",
  assets: createAssetCatalog(),
  multiplayer: null,
  input: {},
});

function onInit(): void {
  initDemo();
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(CAMERA_ANCHOR, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function onTick(_ctx: GameContext, dt: number): void {
  stepDemo(dt);
}

export const destructionDemoGame: PlayableGame<ComponentType, ComponentType> = {
  game,
  content: {
    itemById: () => null,
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI: DestructionUI,
  WorldOverlay: DestructionOverlay,
  camera: {
    perspective: "third",
    minDistance: 6,
    maxDistance: 200,
    initialDistance: 52,
    initialHeight: 30,
    targetHeight: 2,
    minPolarAngle: 0.15,
    maxPolarAngle: 1.45,
  },
};

export default destructionDemoGame;
