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

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [CAMERA_ANCHOR]: {},
};

const game = defineGame({
  name: "stress-bench",
  assets: createAssetCatalog(),
  multiplayer: null,
  input: {
    resetBench: ["KeyR"],
    rekickChaos: ["KeyC"],
    toggleTint: ["KeyT"],
  },
});

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

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(CAMERA_ANCHOR, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function onTick(_ctx: GameContext, dt: number): void {
  const bench = currentBench();
  if (bench === null) return;
  const stats = bench.world.step(dt);
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
