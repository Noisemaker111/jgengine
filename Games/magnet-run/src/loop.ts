import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { LifecycleConfig } from "@jgengine/core/game/defineGame";

import { BOT_ENTITY_ID } from "./game/entities/catalog";
import { controllerStore, RunController } from "./game/systems/runController";
import { botPoseFor } from "./game/systems/pose";
import { runStore } from "./game/systems/runState";
import { setupWorld } from "./game/world/setup";

function controllerOf(ctx: GameContext): RunController {
  const existing = controllerStore.peek(ctx);
  if (existing !== undefined) return existing;
  throw new Error("run controller accessed before onInit");
}

export const lifecycle: LifecycleConfig<RunController> = {
  store: controllerStore,
  start(controller) {
    if (controller.snapshot().phase === "sectorClear") controller.continueAfterClear();
    else controller.start();
    return controller;
  },
  restart(controller) {
    controller.restartSector();
    return controller;
  },
  phaseOf(controller) {
    const phase = controller.snapshot().phase;
    return phase === "menu" ? "menu" : phase === "running" ? "playing" : "ended";
  },
  commands: { start: "startRun", restart: "restartSector" },
};

export function onInit(ctx: GameContext): void {
  const controller = new RunController();
  controllerStore.write(ctx, controller);
  runStore.write(ctx, controller.snapshot());

  setupWorld(ctx);

  ctx.game.commands.define("laneLeft", { apply: () => controller.moveLane(-1) });
  ctx.game.commands.define("laneRight", { apply: () => controller.moveLane(1) });
  ctx.game.commands.define("polarityFlip", { apply: () => controller.flip() });
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
  const boosting = ctx.input.isDown("boost");
  const braking = ctx.input.isDown("brake");
  controller.tick(dt, { boosting, braking }, ctx.time.now());

  const snapshot = controller.snapshot();
  runStore.write(ctx, snapshot);

  const pose = botPoseFor(snapshot);
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: pose.position,
    rotationY: 0,
    rotationZ: pose.rotationZ,
    dt,
  });
}
