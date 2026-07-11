import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { createRunController, type RunController, type RunPhase } from "./game/rail/controller";
import { JUNCTION_NODE_IDS } from "./game/rail/network";
import { CONTROLLER_STORE_KEY as CONTROLLER_KEY } from "./game/rail/storeKeys";
import { setupWorld, spawnMovers } from "./game/world/setup";

const NORMAL_LANTERN = "#386641";
const REVERSE_LANTERN = "#bc4749";

function syncPhase(ctx: GameContext, phase: RunPhase): void {
  setGamePhase(ctx, phase === "racing" ? "playing" : phase === "start" ? "menu" : "ended");
}

export function onInit(ctx: GameContext): void {
  const previous = ctx.game.store.get(CONTROLLER_KEY) as RunController | undefined;
  previous?.detach();

  const controller = createRunController((x, z) => ctx.world.groundHeightAt(x, z));
  controller.attach();
  ctx.game.store.set(CONTROLLER_KEY, controller);
  syncPhase(ctx, controller.snapshot().phase);

  if (!ctx.game.commands.has("confirm")) {
    ctx.game.commands.define<undefined>("confirm", {
      apply: (state) => (state.game.store.get(CONTROLLER_KEY) as RunController | undefined)?.confirm(),
    });
  }
  if (!ctx.game.commands.has("restart")) {
    ctx.game.commands.define<undefined>("restart", {
      apply: (state) => (state.game.store.get(CONTROLLER_KEY) as RunController | undefined)?.restart(),
    });
  }
  if (!ctx.game.commands.has("throwJunction")) {
    ctx.game.commands.define<{ nodeId: string }>("throwJunction", {
      apply: (state, input) => (state.game.store.get(CONTROLLER_KEY) as RunController | undefined)?.throwJunction(input.nodeId),
    });
  }

  setupWorld(ctx);
}

export function onNewPlayer(ctx: GameContext): void {
  const controller = ctx.game.store.get(CONTROLLER_KEY) as RunController | undefined;
  if (controller === undefined) return;
  const snapshot = controller.snapshot();
  spawnMovers(ctx, snapshot.playerPose.position, snapshot.playerPose.heading);
}

export function onTick(ctx: GameContext, dt: number): void {
  const controller = ctx.game.store.get(CONTROLLER_KEY) as RunController | undefined;
  if (controller === undefined) return;

  controller.tick(dt);
  const snapshot = controller.snapshot();
  syncPhase(ctx, snapshot.phase);

  ctx.scene.entity.setPose(ctx.player.userId, {
    position: snapshot.playerPose.position,
    rotationY: snapshot.playerPose.heading,
    dt,
  });
  for (const [trainId, pose] of Object.entries(snapshot.trainPoses)) {
    ctx.scene.entity.setPose(trainId, { position: pose.position, rotationY: pose.heading, dt });
  }

  for (const nodeId of JUNCTION_NODE_IDS) {
    const state = snapshot.session.throwStates[nodeId] ?? "normal";
    ctx.scene.object.setVisual(`stand-${nodeId}`, { color: state === "reverse" ? REVERSE_LANTERN : NORMAL_LANTERN });
  }

  ctx.game.store.set(CONTROLLER_KEY, controller);
}
