import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { BOT_ENTITY_ID } from "./game/entities/catalog";
import { controllerStore, RunController } from "./game/systems/runController";
import { botPoseFor } from "./game/systems/pose";
import { runStore, type RunPhase } from "./game/systems/runState";
import { setupWorld } from "./game/world/setup";

function controllerOf(ctx: GameContext): RunController {
  const existing = controllerStore.peek(ctx);
  if (existing !== undefined) return existing;
  throw new Error("run controller accessed before onInit");
}

function syncPhase(ctx: GameContext, phase: RunPhase): void {
  setGamePhase(ctx, phase === "menu" ? "menu" : phase === "running" ? "playing" : "ended");
}

export function onInit(ctx: GameContext): void {
  const controller = new RunController();
  controllerStore.write(ctx, controller);
  runStore.write(ctx, controller.snapshot());
  syncPhase(ctx, controller.snapshot().phase);

  setupWorld(ctx);

  function withPhaseSync(mutate: () => void): () => void {
    return () => {
      const previousPhase = controller.snapshot().phase;
      mutate();
      const nextPhase = controller.snapshot().phase;
      if (nextPhase !== previousPhase) syncPhase(ctx, nextPhase);
    };
  }

  ctx.game.commands.define("startRun", {
    apply: withPhaseSync(() => {
      const phase = controller.snapshot().phase;
      if (phase === "sectorClear") controller.continueAfterClear();
      else controller.start();
    }),
  });
  ctx.game.commands.define("laneLeft", { apply: withPhaseSync(() => controller.moveLane(-1)) });
  ctx.game.commands.define("laneRight", { apply: withPhaseSync(() => controller.moveLane(1)) });
  ctx.game.commands.define("polarityFlip", { apply: withPhaseSync(() => controller.flip()) });
  ctx.game.commands.define("restartSector", { apply: withPhaseSync(() => controller.restartSector()) });
}

export function onNewPlayer(ctx: GameContext): void {
  const controller = controllerOf(ctx);
  const pose = botPoseFor(controller.snapshot());
  ctx.scene.entity.spawn(BOT_ENTITY_ID, {
    id: ctx.player.userId,
    position: pose.position,
    rotationY: 0,
    rotationZ: pose.rotationZ,
    role: "player",
  });
}

export function onTick(ctx: GameContext, dt: number): void {
  const controller = controllerOf(ctx);
  const previousPhase = controller.snapshot().phase;
  const boosting = ctx.input.isDown("boost");
  const braking = ctx.input.isDown("brake");
  controller.tick(dt, { boosting, braking }, ctx.time.now());

  const snapshot = controller.snapshot();
  if (snapshot.phase !== previousPhase) syncPhase(ctx, snapshot.phase);
  runStore.write(ctx, snapshot);

  const pose = botPoseFor(snapshot);
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: pose.position,
    rotationY: 0,
    rotationZ: pose.rotationZ,
    dt,
  });
}
