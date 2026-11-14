import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { LifecycleConfig } from "@jgengine/core/game/defineGame";

import { COMPACTOR_ENTITY, FREIGHT_CAR_ENTITY, KART_GHOST_ENTITY, KART_PLAYER_ENTITY } from "./game/entities/catalog";
import { upgradeBodies } from "./game/art/upgrades";
import { impactBursts } from "./game/impact";
import { RIVAL_DEFS } from "./game/race/opponents";
import { createRunSession, runSessionStore, type RunSession } from "./game/run/session";
import { autopilotFrame, registerCaptureCommands } from "./game/capture";
import { createWorldRuntime, driveInputStore, worldRuntimeStore } from "./game/run/store";
import { AISLE_NINE_TRACK, trackById, type Track } from "./game/tracks/catalog";
import { createDriveInput } from "./game/vehicle/input";
import { tumbleBursts } from "./game/world/hazardFx";
import {
  clearRunObjects,
  freightWagons,
  placeRunObjects,
  placeTrackScenery,
  placeZoneDressing,
  syncClearedGates,
  syncCompactorRow,
  syncDroppedGates,
  syncMarbles,
  syncPickupMarkers,
  syncShelfItems,
} from "./game/world/setup";

const trackOf = (session: RunSession): Track => trackById(session.snapshot().track.id) ?? AISLE_NINE_TRACK;

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
    return phase === "running" ? session.snapshot().paused ? "paused" : "playing" : phase === "start" ? "menu" : "ended";
  },
  commands: { start: "startRun" },
};

export function onInit(ctx: GameContext): void {
  const propRows = placeZoneDressing(ctx);
  placeTrackScenery(ctx);
  const session = createRunSession(ctx.world.groundHeightAt, undefined, ctx.game.notices);
  const track = trackOf(session);
  placeRunObjects(ctx, track);
  worldRuntimeStore.write(ctx, createWorldRuntime(propRows, track.id));
  runSessionStore.write(ctx, session);

  const input = createDriveInput();
  driveInputStore.write(ctx, input);
  registerCaptureCommands(ctx);
}

export function onNewPlayer(ctx: GameContext): void {
  const session = runSessionStore.peek(ctx);
  const track = session === undefined ? AISLE_NINE_TRACK : trackOf(session);
  const at = (run: number, lateral: number): [number, number, number] => {
    const point = track.point("main", run, lateral);
    return [point.x, ctx.world.groundHeightAt(point.x, point.z), point.z];
  };
  ctx.scene.entity.bind("racers").sync([
    { id: ctx.player.userId, kind: KART_PLAYER_ENTITY, position: [...track.spawn.position], rotationY: track.spawn.heading, role: "player" },
    ...RIVAL_DEFS.map((def) => ({
      id: def.id,
      kind: def.entityKind,
      position: at(def.grid.z, def.grid.x),
      rotationY: track.spawn.heading,
      role: "npc" as const,
    })),
    compactorBody(ctx, track, -35),
  ]);
}

export function onTick(ctx: GameContext, dt: number): void {
  const session = runSessionStore.peek(ctx);
  const input = driveInputStore.peek(ctx);
  const world = worldRuntimeStore.peek(ctx);
  if (session === undefined || input === undefined || world === undefined) return;

  // Swap the run objects over when the next event races another track, and restore all consumed
  // scenery when a new run resets the session.
  const track = trackOf(session);
  if (track.id !== world.trackId) {
    clearRunObjects(ctx, trackById(world.trackId) ?? AISLE_NINE_TRACK);
    placeRunObjects(ctx, track);
    worldRuntimeStore.write(ctx, createWorldRuntime(track === AISLE_NINE_TRACK ? placeZoneDressing(ctx) : world.propRows, track.id));
    input.reset();
  } else if (session.snapshot().collectedIds.size < world.removedMarkers.size || session.snapshot().shelvesTaken.size < world.removedShelves.size || session.snapshot().runTime < world.lastRunTime) {
    const rows = track === AISLE_NINE_TRACK ? placeZoneDressing(ctx) : world.propRows;
    placeRunObjects(ctx, track);
    worldRuntimeStore.write(ctx, createWorldRuntime(rows, track.id));
    input.reset();
  }
  const currentWorld = worldRuntimeStore.peek(ctx)!;

  const before = session.snapshot();
  const axis = input.sample(dt, ctx.input, before.phase === "running" && !before.paused);
  const jumpPressed = input.consumeJump() || ctx.input.justPressed("jumpHop");
  const usePower = input.consumePower() || ctx.input.justPressed("usePower");
  const plowBracing = ctx.input.isDown("plowBrace") || input.isDown("plowBrace");
  const ride = ctx.input.isDown("rideBar") || input.isDown("rideBar");
  const pilot = autopilotFrame(ctx, before, track);
  const effects = { marks: ctx.tireMarks, particles: ctx.particles };
  if (pilot !== null) session.tick(dt, pilot.axis, { ...pilot.input, effects });
  else session.tick(dt, axis, { jumpPressed, plowBracing, ride, usePower, salvageSwap: ctx.input.isDown("salvageSwap") || input.isDown("salvageSwap"), effects });

  const snapshot = session.snapshot();
  for (const burst of impactBursts(before, snapshot)) {
    ctx.particles.burst(burst.config, burst.count, burst.blending);
    // Cue ids match impact kinds one-to-one (see game/audio.ts), so each visible impact is also heard.
    ctx.game.audio.play(burst.kind);
  }

  ctx.scene.entity.bind("racers").sync(
    [
      { id: ctx.player.userId, kind: KART_PLAYER_ENTITY, position: snapshot.pose.position, rotationY: snapshot.pose.heading, role: "player" },
      // The cart under the shopper: its id carries the chassis, so a cart swap spawns the new body.
      { id: `${ctx.player.userId}:cart:${snapshot.chassis.id}`, kind: snapshot.chassis.entityKind, position: snapshot.pose.position, rotationY: snapshot.pose.heading, role: "prop" as const },
      ...snapshot.rivals.map((rival) => ({
        id: rival.id,
        kind: rival.entityKind,
        position: rival.position,
        rotationY: rival.heading,
        role: "npc" as const,
      })),
      compactorBody(ctx, track, snapshot.compactorZ),
    ],
    dt,
  );
  ctx.scene.entity.bind("freight").sync(
    freightWagons(track, snapshot.runTime).map((wagon) => ({ ...wagon, kind: FREIGHT_CAR_ENTITY, role: "prop" as const })),
    dt,
  );
  if (snapshot.phase === "running" && !snapshot.paused) {
    for (const burst of tumbleBursts(track, snapshot.runTime, currentWorld, snapshot.pose.position)) ctx.particles.burst(burst.config, burst.count, burst.blending);
  }

  const ghost = snapshot.ghost?.pose ?? null;
  ctx.scene.entity.bind("ghost").sync(
    ghost === null ? [] : [{ id: "ghost", kind: KART_GHOST_ENTITY, position: ghost.position, rotationY: ghost.rotationY, role: "prop" as const }],
    dt,
  );

  syncPickupMarkers(ctx, snapshot.collectedIds, currentWorld.removedMarkers, track);
  syncShelfItems(ctx, snapshot.shelvesTaken, currentWorld.removedShelves, track);
  syncMarbles(ctx, snapshot.marbles, currentWorld.marbles);
  ctx.scene.entity.bind("installed-upgrades").sync(upgradeBodies(ctx.player.userId, snapshot), dt);
  syncDroppedGates(ctx, track, snapshot.runTime, snapshot.clearedGateIds, currentWorld.droppedGates);
  syncClearedGates(ctx, snapshot.clearedGateIds, currentWorld.removedGates, track);
  // Only Aisle 9's corridor props stand in the shutters' path; the other departments keep their scenery.
  if (track === AISLE_NINE_TRACK) syncCompactorRow(ctx, snapshot.compactorZ, currentWorld.propRows, currentWorld.cursor);
  currentWorld.lastRunTime = snapshot.runTime;

  runSessionStore.write(ctx, session);
}

/** The shutter and its floor scrubber, square across the department's aisle at its run mark. */
function compactorBody(ctx: GameContext, track: Track, compactorRun: number) {
  if (track === AISLE_NINE_TRACK) {
    return { id: COMPACTOR_ENTITY, kind: COMPACTOR_ENTITY, position: [0, ctx.world.groundHeightAt(0, compactorRun), compactorRun] as [number, number, number], role: "prop" as const };
  }
  const at = track.point("main", Math.max(-track.origin, compactorRun), 0);
  return {
    id: COMPACTOR_ENTITY,
    kind: COMPACTOR_ENTITY,
    position: [at.x, ctx.world.groundHeightAt(at.x, at.z), at.z] as [number, number, number],
    rotationY: at.heading,
    role: "prop" as const,
  };
}
