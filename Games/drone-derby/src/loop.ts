import { createRaceState, firstPastPost, type RaceState, type RaceTrack } from "@jgengine/core/game/race";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { DecayMeterSet } from "@jgengine/core/survival/decayMeter";
import type { WindField } from "@jgengine/core/world/wind";

import { chargeBattery, computeLoad, createBattery, currentDrainRate, drainBattery, estimateRangeMeters } from "./game/battery/battery";
import { buildTrack, COURSES, spawnPoseFor, type CourseId, type SpawnPose } from "./game/race/courses";
import { createDroneController, type DroneController } from "./game/drone/controller";
import { NEUTRAL_DRONE_AXES, sampleDroneInput, type DroneAxes } from "./game/drone/input";
import {
  consumeChargeToggleRequest,
  consumeCourseRequest,
  consumeRestartRequest,
  consumeStartRequest,
  requestStart,
} from "./game/drone/menuIntent";
import { samplePointerTilt } from "./game/drone/pointerInput";
import { DRONE_ENTITY_KIND } from "./game/entities/catalog";
import {
  applyRingEvents,
  beginCountdownForCourse,
  createRunStore,
  crashDnf,
  finishRun,
  type RunPhase,
  type RunState,
  selectCourse,
  tickCountdown,
  tickFlying,
  withTelemetry,
} from "./game/race/run";
import { createAmbientWind, generateGustSchedule, windAt, type GustEvent } from "./game/wind/wind";
import { placeCourseRings, placeStaticProps, type ResolvedPad } from "./game/world/setup";

const DEFAULT_COURSE: CourseId = "short";
const LANDING_TOLERANCE = 3;

export const runStore = createRunStore(DEFAULT_COURSE);

function syncPhase(ctx: GameContext, phase: RunPhase): void {
  setGamePhase(ctx, phase === "menu" ? "menu" : phase === "countdown" || phase === "flying" ? "playing" : "ended");
}

function setRunState(ctx: GameContext, updater: (state: RunState) => RunState): void {
  const previousPhase = runStore.getState().phase;
  runStore.setState(updater);
  const nextPhase = runStore.getState().phase;
  if (nextPhase !== previousPhase) syncPhase(ctx, nextPhase);
}

interface Sim {
  spawn: SpawnPose;
  controller: DroneController;
  battery: DecayMeterSet;
  ambientWind: WindField;
  gustSchedule: readonly GustEvent[];
  track: RaceTrack;
  raceState: RaceState;
  axes: DroneAxes;
  charging: boolean;
  chargingPadId: string | null;
}

let sim: Sim | null = null;
let resolvedPads: readonly ResolvedPad[] = [];

const edgeState = { start: false, restart: false, charge: false, c1: false, c2: false, c3: false };

function pressedEdge(ctx: GameContext, action: string, key: keyof typeof edgeState): boolean {
  const down = ctx.input.isDown(action);
  const pressed = down && !edgeState[key];
  edgeState[key] = down;
  return pressed;
}

function createSim(courseId: CourseId, ctx: GameContext): Sim {
  const spawn = spawnPoseFor(courseId, ctx.world.groundHeightAt);
  const track = buildTrack(courseId, ctx.world.groundHeightAt);
  const raceState = createRaceState({ track, win: firstPastPost(1) });
  raceState.addRacer(ctx.player.userId, 0);
  return {
    spawn,
    controller: createDroneController(spawn),
    battery: createBattery(),
    ambientWind: createAmbientWind(courseId),
    gustSchedule: generateGustSchedule(courseId, COURSES[courseId].clockCapSec),
    track,
    raceState,
    axes: NEUTRAL_DRONE_AXES,
    charging: false,
    chargingPadId: null,
  };
}

function holdSpawnPose(ctx: GameContext): void {
  if (sim === null) return;
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: sim.spawn.position,
    rotationY: sim.spawn.heading,
    rotationX: 0,
    rotationZ: 0,
  });
}

function beginRun(ctx: GameContext, courseId: CourseId): void {
  setRunState(ctx, (state) => beginCountdownForCourse(state, courseId));
  sim = createSim(courseId, ctx);
  placeCourseRings(ctx, courseId, ctx.world.groundHeightAt);
  ctx.scene.entity.setPose(ctx.player.userId, {
    position: sim.spawn.position,
    rotationY: sim.spawn.heading,
    rotationX: 0,
    rotationZ: 0,
  });
}

function switchCourse(ctx: GameContext, courseId: CourseId): void {
  setRunState(ctx, () => selectCourse(courseId));
  sim = createSim(courseId, ctx);
  placeCourseRings(ctx, courseId, ctx.world.groundHeightAt);
  holdSpawnPose(ctx);
}

function nearestPad(position: readonly [number, number, number]): { pad: ResolvedPad; distance: number } | null {
  let best: { pad: ResolvedPad; distance: number } | null = null;
  for (const pad of resolvedPads) {
    const dx = position[0] - pad.position[0];
    const dz = position[2] - pad.position[2];
    const distance = Math.hypot(dx, dz);
    if (best === null || distance < best.distance) best = { pad, distance };
  }
  return best;
}

function reachablePad(position: readonly [number, number, number]): ResolvedPad | null {
  for (const pad of resolvedPads) {
    const dx = position[0] - pad.position[0];
    const dz = position[2] - pad.position[2];
    const horizontal = Math.hypot(dx, dz);
    const vertical = Math.abs(position[1] - pad.position[1]);
    if (horizontal <= pad.radius && vertical <= LANDING_TOLERANCE) return pad;
  }
  return null;
}

export function onInit(ctx: GameContext): void {
  ctx.game.commands.define("start", {
    validate: () => (runStore.getState().phase === "menu" ? null : { reason: "race already underway" }),
    apply: () => requestStart(),
  });
}

export function onNewPlayer(ctx: GameContext): void {
  edgeState.start = false;
  edgeState.restart = false;
  edgeState.charge = false;
  edgeState.c1 = false;
  edgeState.c2 = false;
  edgeState.c3 = false;
  setRunState(ctx, (state) => selectCourse(state.courseId));
  syncPhase(ctx, runStore.getState().phase);
  resolvedPads = placeStaticProps(ctx);
  const courseId = runStore.getState().courseId;
  sim = createSim(courseId, ctx);
  placeCourseRings(ctx, courseId, ctx.world.groundHeightAt);
  ctx.scene.entity.spawn(DRONE_ENTITY_KIND, {
    id: ctx.player.userId,
    position: sim.spawn.position,
    rotationY: sim.spawn.heading,
    role: "player",
  });
}

export function onTick(ctx: GameContext, dt: number): void {
  if (sim === null) return;
  const state = runStore.getState();

  const clickedCourse = consumeCourseRequest();
  const keyCourse = pressedEdge(ctx, "courseShort", "c1")
    ? "short"
    : pressedEdge(ctx, "courseTechnical", "c2")
      ? "technical"
      : pressedEdge(ctx, "courseEndurance", "c3")
        ? "endurance"
        : null;
  const courseChange = clickedCourse ?? (keyCourse as CourseId | null);
  const courseSelectAllowed = state.phase === "menu" || state.phase === "finished" || state.phase === "dnf";
  if (courseChange !== null && courseSelectAllowed && courseChange !== state.courseId) {
    switchCourse(ctx, courseChange);
    return;
  }

  const restartPressed = pressedEdge(ctx, "restart", "restart") || consumeRestartRequest();
  if (restartPressed && state.phase !== "menu") {
    beginRun(ctx, state.courseId);
    return;
  }

  if (state.phase === "menu") {
    const startPressed = pressedEdge(ctx, "startRace", "start") || consumeStartRequest();
    if (startPressed) beginRun(ctx, state.courseId);
    return;
  }

  if (state.phase === "countdown") {
    setRunState(ctx, (s) => tickCountdown(s, dt));
    holdSpawnPose(ctx);
    return;
  }

  if (state.phase === "finished" || state.phase === "dnf") {
    return;
  }

  const pointerTilt = samplePointerTilt();
  sim.axes = sampleDroneInput((action) => ctx.input.isDown(action), sim.axes, dt, pointerTilt);

  const now = state.elapsed;
  const wind = windAt(sim.ambientWind, sim.gustSchedule, now);

  const player = ctx.scene.entity.get(ctx.player.userId);
  const currentPos = player?.position ?? sim.spawn.position;

  const pad = reachablePad(currentPos);
  const chargePressed = pressedEdge(ctx, "chargeToggle", "charge") || consumeChargeToggleRequest();
  if (chargePressed) {
    if (sim.charging) {
      sim.charging = false;
      sim.chargingPadId = null;
    } else if (pad !== null) {
      sim.charging = true;
      sim.chargingPadId = pad.id;
    }
  }
  if (sim.charging && pad === null) {
    sim.charging = false;
    sim.chargingPadId = null;
  }

  let load = 1;
  let position: readonly [number, number, number];
  let heading: number;
  let pitchVisual = 0;
  let rollVisual = 0;
  let speed = 0;

  if (sim.charging) {
    position = currentPos;
    heading = player?.rotationY ?? sim.spawn.heading;
    chargeBattery(sim.battery, dt);
  } else {
    const pose = sim.controller.tick(dt, sim.axes, wind.vector);
    position = pose.position;
    heading = pose.heading;
    pitchVisual = pose.pitchVisual;
    rollVisual = pose.rollVisual;
    speed = pose.speed;
    const travelDirX = pose.speed > 0.2 ? pose.velocityX / pose.speed : Math.sin(pose.heading);
    const travelDirZ = pose.speed > 0.2 ? pose.velocityZ / pose.speed : Math.cos(pose.heading);
    const headwind = -(wind.vector[0] * travelDirX + wind.vector[1] * travelDirZ);
    load = computeLoad({
      throttleMagnitude: pose.throttleMagnitude,
      verticalSpeed: pose.verticalSpeed,
      boost: sim.axes.boost,
      headwind,
    });
    drainBattery(sim.battery, dt, load);
  }

  ctx.scene.entity.setPose(ctx.player.userId, {
    position,
    rotationY: heading,
    rotationX: pitchVisual,
    rotationZ: rollVisual,
    dt,
  });

  const events = sim.raceState.update(now, { [ctx.player.userId]: position });
  let nextState = tickFlying(state, dt);
  nextState = applyRingEvents(nextState, events);

  const cellsRemaining = sim.battery.value("cell");
  const cellsUsed = Math.round(100 - cellsRemaining);
  const nearest = nearestPad(position);

  const telemetry = {
    position,
    heading,
    speed,
    altitude: position[1],
    batteryCells: cellsRemaining,
    drawRate: sim.charging ? -11 : currentDrainRate(load),
    rangeMeters: estimateRangeMeters(cellsRemaining, load),
    windVector: wind.vector,
    windSpeed: Math.hypot(wind.vector[0], wind.vector[1]),
    gustActive: wind.gust !== null,
    charging: sim.charging,
    chargingPadId: sim.chargingPadId,
    chargeFraction: sim.battery.state("cell").fraction,
    nearestPadId: nearest?.pad.id ?? null,
    nearestPadDistance: nearest?.distance ?? null,
  };
  nextState = withTelemetry(nextState, telemetry);

  if (cellsRemaining <= 0) {
    nextState = crashDnf(nextState, "battery", position, cellsUsed);
  } else if (events.some((event) => event.type === "race.finished")) {
    nextState = finishRun(nextState, cellsUsed);
  } else if (nextState.elapsed >= COURSES[state.courseId].clockCapSec) {
    nextState = crashDnf(nextState, "time", position, cellsUsed);
  }

  setRunState(ctx, () => nextState);
}
