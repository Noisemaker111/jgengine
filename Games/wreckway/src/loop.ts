import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { COMPACTOR_ENTITY, KART_PLAYER_ENTITY } from "./game/entities/catalog";
import { createRunSession, RUN_STORE_KEY, type RunSession } from "./game/run/session";
import { createWorldRuntime, INPUT_STORE_KEY, WORLD_STORE_KEY, type WorldRuntime } from "./game/run/store";
import { createDriveInput, type DriveInput } from "./game/vehicle/input";
import { placeExitGate, placeGateBarricades, placePickupMarkers, placeZoneDressing, syncCompactorRow, syncPickupMarkers } from "./game/world/setup";

export function onInit(ctx: GameContext): void {
  const previousInput = ctx.game.store.get(INPUT_STORE_KEY) as DriveInput | undefined;
  previousInput?.detach();

  const propRows = placeZoneDressing(ctx);
  placeGateBarricades(ctx);
  placePickupMarkers(ctx);
  placeExitGate(ctx);
  ctx.game.store.set(WORLD_STORE_KEY, createWorldRuntime(propRows));

  const session = createRunSession(ctx.world.groundHeightAt);
  ctx.game.store.set(RUN_STORE_KEY, session);

  const input = createDriveInput();
  input.attach();
  ctx.game.store.set(INPUT_STORE_KEY, input);

  if (!ctx.game.commands.has("startRun")) {
    ctx.game.commands.define("startRun", {
      apply: (state) => (state.game.store.get(RUN_STORE_KEY) as RunSession | undefined)?.start(),
    });
  }
  if (!ctx.game.commands.has("restart")) {
    ctx.game.commands.define("restart", {
      apply: (state) => (state.game.store.get(RUN_STORE_KEY) as RunSession | undefined)?.restart(),
    });
  }
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.despawn(ctx.player.userId);
  ctx.scene.entity.spawn(KART_PLAYER_ENTITY, { id: ctx.player.userId, position: [0, 0, 4], role: "player" });

  ctx.scene.entity.despawn(COMPACTOR_ENTITY);
  ctx.scene.entity.spawn(COMPACTOR_ENTITY, { id: COMPACTOR_ENTITY, position: [0, 0, -35], role: "prop" });
}

export function onTick(ctx: GameContext, dt: number): void {
  const session = ctx.game.store.get(RUN_STORE_KEY) as RunSession | undefined;
  const input = ctx.game.store.get(INPUT_STORE_KEY) as DriveInput | undefined;
  const world = ctx.game.store.get(WORLD_STORE_KEY) as WorldRuntime | undefined;
  if (session === undefined || input === undefined || world === undefined) return;

  if (input.consumeRestart()) session.restart();
  if (input.consumeStart()) session.start();

  const axis = input.sample(dt);
  const jumpPressed = input.consumeJump();
  const plowBracing = input.isPlowBracing();
  session.tick(dt, axis, { jumpPressed, plowBracing });

  const snapshot = session.snapshot();
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: snapshot.pose.position,
    rotationY: snapshot.pose.heading,
    dt,
  });
  ctx.scene.entity.setPose(COMPACTOR_ENTITY, {
    position: [0, ctx.world.groundHeightAt(0, snapshot.compactorZ), snapshot.compactorZ],
    dt,
  });

  syncPickupMarkers(ctx, snapshot.collectedIds, world.removedMarkers);
  syncCompactorRow(ctx, snapshot.compactorZ, world.propRows, world.cursor);

  ctx.game.store.set(RUN_STORE_KEY, session);
}
