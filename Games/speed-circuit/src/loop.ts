import { createRaceState, type RaceState } from "@jgengine/core/game/race";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { attachDriveInput, consumeRestart, sampleDriveInput } from "./game/vehicle/input";
import { createVehicleController, type VehicleController } from "./game/vehicle/controller";
import { LAPS, SPAWN_HEADING, SPAWN_POSITION, TRACK } from "./game/race/track";
import { applyRaceEvent, createRunStore, initialRunState, tickCountdown, tickRace, type RunStore } from "./game/race/runState";
import { spawnCar } from "./game/world/setup";

export const runStore: RunStore = createRunStore(LAPS);

const vehicle: VehicleController = createVehicleController({ position: SPAWN_POSITION, heading: SPAWN_HEADING });

let raceState: RaceState = createRaceState({ track: TRACK });

let restPose: { position: readonly [number, number, number]; heading: number } = {
  position: SPAWN_POSITION,
  heading: SPAWN_HEADING,
};

let detachInput: (() => void) | null = null;

function holdRestPose(ctx: GameContext): void {
  ctx.scene.entity.setPose(ctx.player.userId, { position: restPose.position, rotationY: restPose.heading });
}

export function onInit(): void {}

export function onNewPlayer(ctx: GameContext): void {
  spawnCar(ctx);
  raceState.addRacer(ctx.player.userId, ctx.time.now());
  detachInput?.();
  detachInput = attachDriveInput();
}

function restart(ctx: GameContext): void {
  vehicle.resetTo(SPAWN_POSITION, SPAWN_HEADING);
  raceState = createRaceState({ track: TRACK });
  raceState.addRacer(ctx.player.userId, ctx.time.now());
  runStore.setState(() => initialRunState(LAPS));
  restPose = { position: SPAWN_POSITION, heading: SPAWN_HEADING };
  holdRestPose(ctx);
}

export function onTick(ctx: GameContext, dt: number): void {
  const state = runStore.getState();

  if (state.phase === "finished") {
    if (consumeRestart()) restart(ctx);
    else holdRestPose(ctx);
    return;
  }

  if (state.phase === "countdown") {
    if (consumeRestart()) restart(ctx);
    holdRestPose(ctx);
    runStore.setState((s) => tickCountdown(s, dt));
    return;
  }

  const axis = sampleDriveInput(dt);
  const pose = vehicle.tick(dt, axis);
  restPose = { position: pose.position, heading: pose.heading };
  ctx.scene.entity.setPose(ctx.player.userId, { position: pose.position, rotationY: pose.heading, dt });

  const events = raceState.update(ctx.time.now(), { [ctx.player.userId]: pose.position });
  runStore.setState((s) => {
    let next = tickRace(s, dt, pose.speedKmh, pose.offTrack);
    for (const event of events) next = applyRaceEvent(next, event);
    return next;
  });
}
