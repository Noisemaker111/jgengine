import type { ComponentType, ReactNode } from "react";

import { defineGame } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { PlayableGame } from "@jgengine/core/game/playableGame";

import { attachInput, currentCircuit, initCircuit, resetCar, stepCircuit } from "./track";
import { CircuitOverlay } from "./overlay";
import { KartCircuitUI } from "./ui";

const CAR_ANCHOR = "kartAnchor";

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [CAR_ANCHOR]: {},
};

const game = defineGame({
  name: "kart-circuit",
  assets: createAssetCatalog(),
  multiplayer: null,
  input: {
    resetCar: ["KeyR"],
  },
});

function onInit(ctx: GameContext): void {
  initCircuit();
  attachInput();
  ctx.game.commands.define("resetCar", {
    apply(state) {
      resetCar();
      return state;
    },
  });
}

function onNewPlayer(ctx: GameContext): void {
  const circuit = currentCircuit();
  const start = circuit?.car.position ?? [0, 1.4, 0];
  ctx.scene.entity.spawn(CAR_ANCHOR, { id: ctx.player.userId, position: start, role: "player" });
}

function onTick(ctx: GameContext, dt: number): void {
  stepCircuit(dt);
  const circuit = currentCircuit();
  if (circuit === null) return;
  const [x, y, z] = circuit.car.position;
  ctx.scene.entity.setPose(ctx.player.userId, { position: [x, y, z], rotationY: circuit.car.heading, dt });
}

export const kartCircuitGame: PlayableGame<ComponentType, ComponentType, (entity: SceneEntity) => ReactNode> = {
  game,
  content: {
    itemById: () => null,
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI: KartCircuitUI,
  WorldOverlay: CircuitOverlay,
  renderEntity: (entity) => (entity.name === CAR_ANCHOR ? <group /> : null),
  camera: {
    perspective: "third",
    minDistance: 6,
    maxDistance: 60,
    initialDistance: 16,
    initialHeight: 7,
    targetHeight: 1.5,
    minPolarAngle: 0.2,
    maxPolarAngle: 1.35,
  },
};

export default kartCircuitGame;
