import { cameraShake } from "@jgengine/shell/camera";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameLoop, LifecycleConfig } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { RUNNER_CATALOG_ID, RUNNER_HOVER_OFFSET } from "./game/entities/catalog";
import { engineStore } from "./game/session/engineStore";
import { createRunnerEngine, type RunnerEngine, type RunnerPhase } from "./game/session/runnerEngine";
import { placeWorldDressing } from "./game/world/setup";

const BEAT_SHAKE_AMPLITUDE = 0.035;
const BEAT_SHAKE_DECAY = 5;
const RESONANCE_SHAKE_AMPLITUDE = 0.14;
const RESONANCE_SHAKE_DECAY = 3;

function requireEngine(ctx: GameContext) {
  const engine = engineStore.peek(ctx);
  if (engine === undefined) {
    throw new Error("pulse-runner: engine not installed — onInit must run before this call");
  }
  return engine;
}

function syncPhase(ctx: GameContext, phase: RunnerPhase): void {
  setGamePhase(ctx, phase === "playing" ? "playing" : phase === "idle" ? "menu" : "ended");
}

export const lifecycle: LifecycleConfig<RunnerEngine> = {
  store: engineStore,
  start(engine) {
    engine.start();
    return engine;
  },
  restart(engine) {
    engine.restart();
    return engine;
  },
  phaseOf(engine) {
    const phase = engine.snapshot().phase;
    return phase === "playing" ? "playing" : phase === "idle" ? "menu" : "ended";
  },
};

function onInit(ctx: GameContext): void {
  const engine = createRunnerEngine();
  engineStore.write(ctx, engine);
  placeWorldDressing(ctx);
  syncPhase(ctx, "idle");

  ctx.game.commands.define("strideBeat", {
    apply(_state: GameContext, _input: unknown) {
      engine.tapStride();
    },
  });
  ctx.game.commands.define("laneLeft", {
    apply(_state: GameContext, _input: unknown) {
      engine.setLane(-1);
    },
  });
  ctx.game.commands.define("laneRight", {
    apply(_state: GameContext, _input: unknown) {
      engine.setLane(1);
    },
  });
  ctx.game.commands.define("lean", {
    apply(_state: GameContext, _input: unknown) {
      engine.lean();
    },
  });
}

function poseRunner(ctx: GameContext, laneX: number, worldZ: number, dt?: number): void {
  const groundY = ctx.world.groundHeightAt(laneX, worldZ);
  ctx.scene.entity.bind("runner").sync(
    [
      {
        id: ctx.player.userId,
        kind: RUNNER_CATALOG_ID,
        position: [laneX, groundY + RUNNER_HOVER_OFFSET, worldZ],
        role: "player",
      },
    ],
    dt,
  );
}

function onNewPlayer(ctx: GameContext): void {
  const engine = requireEngine(ctx);
  const snapshot = engine.snapshot();
  poseRunner(ctx, snapshot.laneX, snapshot.worldZ);
}

function onTick(ctx: GameContext, dt: number): void {
  const engine = requireEngine(ctx);
  engine.tick(dt);
  const snapshot = engine.snapshot();
  syncPhase(ctx, snapshot.phase);
  poseRunner(ctx, snapshot.laneX, snapshot.worldZ, dt);
  for (const event of engine.drainEvents()) {
    if (event.kind === "beat") cameraShake(BEAT_SHAKE_AMPLITUDE, BEAT_SHAKE_DECAY);
    if (event.kind === "resonanceStart") cameraShake(RESONANCE_SHAKE_AMPLITUDE, RESONANCE_SHAKE_DECAY);
  }
}

export const loop: Partial<GameLoop<GameContext>> = { onInit, onNewPlayer, onTick };
