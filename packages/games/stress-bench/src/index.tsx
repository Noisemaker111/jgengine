import type { ComponentType } from "react";

import { defineGame } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { PlayableGame } from "@jgengine/core/game/playableGame";

import {
  benchStats,
  currentBench,
  initBench,
  rekickChaos,
  resetBench,
  toggleDebugTint,
  type BenchStats,
} from "./benchState";
import { BenchWorldOverlay } from "./overlay";
import { resolveParams } from "./params";
import { StressBenchUI } from "./ui";

declare global {
  // eslint-disable-next-line no-var
  interface Window {
    __stressBenchStats?: BenchStats;
  }
}

const CAMERA_ANCHOR = "benchAnchor";
const BOULDER = "benchBoulder";

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [CAMERA_ANCHOR]: { movement: { poses: ["standing", "running"], walkSpeed: 9 } },
  [BOULDER]: {},
};

const game = defineGame({
  name: "stress-bench",
  assets: createAssetCatalog(),
  multiplayer: null,
  input: {
    moveForward: ["KeyW"],
    moveBack: ["KeyS"],
    moveLeft: ["KeyA"],
    moveRight: ["KeyD"],
    sprint: ["ShiftLeft"],
    resetBench: ["KeyR"],
    rekickChaos: ["KeyC"],
    toggleTint: ["KeyT"],
  },
});

function boulderId(k: number): string {
  return `${BOULDER}-${k}`;
}

function currentSearch(): string {
  return typeof window !== "undefined" ? window.location.search : "";
}

function onInit(ctx: GameContext): void {
  initBench(resolveParams(currentSearch()));
  if (typeof window !== "undefined") window.__stressBenchStats = benchStats;
  ctx.game.commands.define("resetBench", {
    apply(state) {
      resetBench();
      return state;
    },
  });
  ctx.game.commands.define("rekickChaos", {
    apply(state) {
      const bench = currentBench();
      if (bench !== null) rekickChaos(bench);
      return state;
    },
  });
  ctx.game.commands.define("toggleTint", {
    apply(state) {
      toggleDebugTint();
      return state;
    },
  });
}

function spawnBoulders(ctx: GameContext): void {
  const bench = currentBench();
  if (bench === null) return;
  const world = bench.world;
  for (let k = 0; k < bench.boulderCount; k += 1) {
    const i = bench.boulderStart + k;
    ctx.scene.entity.spawn(BOULDER, {
      id: boulderId(k),
      position: [world.posX[i]!, world.posY[i]!, world.posZ[i]!],
      role: "prop",
    });
  }
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(CAMERA_ANCHOR, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  spawnBoulders(ctx);
}

function onTick(ctx: GameContext, dt: number): void {
  const bench = currentBench();
  if (bench === null) return;
  const world = bench.world;

  // A real gameplay entity drives the kinematic plow into the sleeping pile.
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player !== null) {
    world.setBodyPose(bench.plow, player.position[0], bench.plowHalf, player.position[2]);
  }

  const stats = world.step(dt);

  // Mirror the physics-driven boulder bodies onto their scene entities so the engine's
  // per-entity render path (GLB models, primitives) draws them — physics driving real entities.
  for (let k = 0; k < bench.boulderCount; k += 1) {
    const i = bench.boulderStart + k;
    ctx.scene.entity.setPose(boulderId(k), {
      position: [world.posX[i]!, world.posY[i]!, world.posZ[i]!],
      rotationY: 0,
    });
  }

  benchStats.total = stats.count;
  benchStats.awake = stats.awake;
  benchStats.sleeping = stats.sleeping;
  benchStats.contacts = stats.contacts;
  benchStats.pairs = stats.pairs;
  benchStats.physicsMs = stats.stepMs;
  benchStats.substeps = stats.substeps;
}

export const stressBenchGame: PlayableGame<ComponentType, ComponentType> = {
  game,
  content: {
    itemById: () => null,
    entityById: (catalogId) => entityCatalog[catalogId] ?? null,
  },
  loop: { onInit, onNewPlayer, onTick },
  GameUI: StressBenchUI,
  WorldOverlay: BenchWorldOverlay,
  camera: {
    perspective: "third",
    minDistance: 4,
    maxDistance: 900,
    initialDistance: 210,
    initialHeight: 120,
    targetHeight: 12,
    minPolarAngle: 0.12,
    maxPolarAngle: 1.5,
  },
};

export default stressBenchGame;
