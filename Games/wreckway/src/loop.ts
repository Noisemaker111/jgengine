import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { COMPACTOR_ENTITY, KART_PLAYER_ENTITY } from "./game/entities/catalog";
import { createRunSession, runSessionStore, type RunPhase } from "./game/run/session";
import { createWorldRuntime, driveInputStore, worldRuntimeStore } from "./game/run/store";
import { createDriveInput } from "./game/vehicle/input";
import { placeExitGate, placeGateBarricades, placePickupMarkers, placeZoneDressing, syncCompactorRow, syncPickupMarkers } from "./game/world/setup";

function syncPhase(ctx: GameContext, phase: RunPhase): void {
  setGamePhase(ctx, phase === "running" ? "playing" : phase === "start" ? "menu" : "ended");
}

export function onInit(ctx: GameContext): void {
  const previousInput = driveInputStore.peek(ctx);
  previousInput?.detach();

  const propRows = placeZoneDressing(ctx);
  placeGateBarricades(ctx);
  placePickupMarkers(ctx);
  placeExitGate(ctx);
  worldRuntimeStore.write(ctx, createWorldRuntime(propRows));

  const session = createRunSession(ctx.world.groundHeightAt);
  runSessionStore.write(ctx, session);
  syncPhase(ctx, "start");

  const input = createDriveInput();
  input.attach();
  driveInputStore.write(ctx, input);

  if (!ctx.game.commands.has("startRun")) {
    ctx.game.commands.define("startRun", {
      apply: (state) => runSessionStore.peek(state)?.start(),
    });
  }
  if (!ctx.game.commands.has("restart")) {
    ctx.game.commands.define("restart", {
      apply: (state) => runSessionStore.peek(state)?.restart(),
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
  const session = runSessionStore.peek(ctx);
  const input = driveInputStore.peek(ctx);
  const world = worldRuntimeStore.peek(ctx);
  if (session === undefined || input === undefined || world === undefined) return;

  const previousPhase = session.snapshot().phase;

  if (input.consumeRestart()) session.restart();
  if (input.consumeStart()) session.start();

  const axis = input.sample(dt);
  const jumpPressed = input.consumeJump();
  const plowBracing = input.isPlowBracing();
  session.tick(dt, axis, { jumpPressed, plowBracing });

  const snapshot = session.snapshot();
  if (snapshot.phase !== previousPhase) syncPhase(ctx, snapshot.phase);

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

  runSessionStore.write(ctx, session);
}
