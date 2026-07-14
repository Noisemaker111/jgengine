import { cameraShake } from "@jgengine/shell/camera";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameLoop } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { RUNNER_CATALOG_ID, RUNNER_HOVER_OFFSET } from "./game/entities/catalog";
import { engineStore } from "./game/session/engineStore";
import { createRunnerEngine, type RunnerPhase } from "./game/session/runnerEngine";
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

function onInit(ctx: GameContext): void {
  const engine = createRunnerEngine();
  engineStore.write(ctx, engine);
  placeWorldDressing(ctx);
  syncPhase(ctx, "idle");

  ctx.game.commands.define("start", {
    apply(_state: GameContext, _input: unknown) {
      engine.start();
    },
  });
  ctx.game.commands.define("restart", {
    apply(_state: GameContext, _input: unknown) {
      engine.restart();
    },
  });
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

function onNewPlayer(ctx: GameContext): void {
  const engine = requireEngine(ctx);
  const snapshot = engine.snapshot();
  const groundY = ctx.world.groundHeightAt(snapshot.laneX, snapshot.worldZ);
  ctx.scene.entity.spawn(RUNNER_CATALOG_ID, {
    id: ctx.player.userId,
    position: [snapshot.laneX, groundY + RUNNER_HOVER_OFFSET, snapshot.worldZ],
    role: "player",
  });
}

function onTick(ctx: GameContext, dt: number): void {
  const engine = requireEngine(ctx);
  engine.tick(dt);
  const snapshot = engine.snapshot();
  syncPhase(ctx, snapshot.phase);
  const groundY = ctx.world.groundHeightAt(snapshot.laneX, snapshot.worldZ);
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: [snapshot.laneX, groundY + RUNNER_HOVER_OFFSET, snapshot.worldZ],
    dt,
  });
  for (const event of engine.drainEvents()) {
    if (event.kind === "beat") cameraShake(BEAT_SHAKE_AMPLITUDE, BEAT_SHAKE_DECAY);
    if (event.kind === "resonanceStart") cameraShake(RESONANCE_SHAKE_AMPLITUDE, RESONANCE_SHAKE_DECAY);
  }
}

export const loop: Partial<GameLoop<GameContext>> = { onInit, onNewPlayer, onTick };
