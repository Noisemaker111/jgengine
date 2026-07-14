import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { LifecycleConfig } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { COMPACTOR_ENTITY, KART_PLAYER_ENTITY } from "./game/entities/catalog";
import { createRunSession, runSessionStore, type RunPhase, type RunSession } from "./game/run/session";
import { createWorldRuntime, driveInputStore, worldRuntimeStore } from "./game/run/store";
import { createDriveInput } from "./game/vehicle/input";
import { placeExitGate, placeGateBarricades, placePickupMarkers, placeZoneDressing, syncCompactorRow, syncPickupMarkers } from "./game/world/setup";

function syncPhase(ctx: GameContext, phase: RunPhase): void {
  setGamePhase(ctx, phase === "running" ? "playing" : phase === "start" ? "menu" : "ended");
}

export const lifecycle: LifecycleConfig<RunSession> = {
  store: runSessionStore,
  start(session) {
    session.start();
    return session;
  },
  restart(session) {
    session.restart();
    return session;
  },
  phaseOf(session) {
    const phase = session.snapshot().phase;
    return phase === "running" ? "playing" : phase === "start" ? "menu" : "ended";
  },
  commands: { start: "startRun" },
};

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
}

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.bind("racers").sync([
    { id: ctx.player.userId, kind: KART_PLAYER_ENTITY, position: [0, 0, 4], role: "player" },
    { id: COMPACTOR_ENTITY, kind: COMPACTOR_ENTITY, position: [0, 0, -35], role: "prop" },
  ]);
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

  ctx.scene.entity.bind("racers").sync(
    [
      { id: ctx.player.userId, kind: KART_PLAYER_ENTITY, position: snapshot.pose.position, rotationY: snapshot.pose.heading, role: "player" },
      {
        id: COMPACTOR_ENTITY,
        kind: COMPACTOR_ENTITY,
        position: [0, ctx.world.groundHeightAt(0, snapshot.compactorZ), snapshot.compactorZ],
        role: "prop",
      },
    ],
    dt,
  );

  syncPickupMarkers(ctx, snapshot.collectedIds, world.removedMarkers);
  syncCompactorRow(ctx, snapshot.compactorZ, world.propRows, world.cursor);

  runSessionStore.write(ctx, session);
}
