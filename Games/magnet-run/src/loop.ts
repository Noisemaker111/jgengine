import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { BOT_ENTITY_ID } from "./game/entities/catalog";
import { RunController } from "./game/systems/runController";
import { botPoseFor } from "./game/systems/pose";
import { setupWorld } from "./game/world/setup";

function controllerOf(ctx: GameContext): RunController {
  const existing = ctx.game.store.get("controller") as RunController | undefined;
  if (existing !== undefined) return existing;
  throw new Error("run controller accessed before onInit");
}

export function onInit(ctx: GameContext): void {
  const controller = new RunController();
  ctx.game.store.set("controller", controller);
  ctx.game.store.set("run", controller.snapshot());

  setupWorld(ctx);

  ctx.game.commands.define("startRun", {
    apply() {
      const phase = controller.snapshot().phase;
      if (phase === "sectorClear") controller.continueAfterClear();
      else controller.start();
    },
  });
  ctx.game.commands.define("laneLeft", { apply: () => controller.moveLane(-1) });
  ctx.game.commands.define("laneRight", { apply: () => controller.moveLane(1) });
  ctx.game.commands.define("polarityFlip", { apply: () => controller.flip() });
  ctx.game.commands.define("restartSector", { apply: () => controller.restartSector() });
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
  ctx.game.store.set("run", snapshot);

  const pose = botPoseFor(snapshot);
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: pose.position,
    rotationY: 0,
    rotationZ: pose.rotationZ,
    dt,
  });
}
