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

export function onInit(): void {}

export function onNewPlayer(ctx: GameContext): void {
  spawnCar(ctx);
  raceState.addRacer(ctx.player.userId, ctx.time.now());
  attachDriveInput();
}

function restart(ctx: GameContext): void {
  vehicle.resetTo(SPAWN_POSITION, SPAWN_HEADING);
  raceState = createRaceState({ track: TRACK });
  raceState.addRacer(ctx.player.userId, ctx.time.now());
  runStore.setState(() => initialRunState(LAPS));
  ctx.scene.entity.setPose(ctx.player.userId, { position: SPAWN_POSITION, rotationY: SPAWN_HEADING });
}

export function onTick(ctx: GameContext, dt: number): void {
  const state = runStore.getState();

  if (state.phase === "finished") {
    if (consumeRestart()) restart(ctx);
    return;
  }

  if (state.phase === "countdown") {
    if (consumeRestart()) restart(ctx);
    runStore.setState((s) => tickCountdown(s, dt));
    return;
  }

  const axis = sampleDriveInput(dt);
  const pose = vehicle.tick(dt, axis);
  ctx.scene.entity.setPose(ctx.player.userId, { position: pose.position, rotationY: pose.heading, dt });

  const events = raceState.update(ctx.time.now(), { [ctx.player.userId]: pose.position });
  runStore.setState((s) => {
    let next = tickRace(s, dt, pose.speedKmh, pose.offTrack);
    for (const event of events) next = applyRaceEvent(next, event);
    return next;
  });
}
