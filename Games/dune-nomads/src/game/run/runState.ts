import { advancePathFollow, createPathFollow, type PathFollowState, type Waypoint } from "@jgengine/core/nav/pathFollow";
import { raceOutcomeOf } from "@jgengine/core/game/race";
import type { DecayMeterSet } from "@jgengine/core/survival/decayMeter";
import type { TerrainField } from "@jgengine/core/world/terrain";
import { defineStore } from "@jgengine/core/store/defineStore";

import { RIVAL_WAYPOINTS } from "./deps";
import {
  FOLLOWER_CATCHUP_MULTIPLIER,
  FOLLOWER_SPACING,
  advanceFollowerToward,
  isStraggling,
  positionOnTrail,
  recordTrail,
  type TrailPoint,
} from "../caravan/chain";
import { PLAYER_BASE_SPEED, STEER_RATE, THROTTLE_EASE, THROTTLE_URGE, WORLD_CLAMP_MARGIN } from "../caravan/constants";
import { clamp, computePaceMultiplier, headingVector, slopeAlongHeading } from "../caravan/pace";
import { WATER_MAX, advanceDock, computeWaterDrainRate, headwindSeverity, startDock, type DockKind, type DockState } from "../caravan/water";
import { RIVAL_BASE_SPEED } from "../rival/route";
import { PLAYER_RACER_ID, RIVAL_RACER_ID } from "../race/track";
import { WIND_SHIFT_SECONDS, windStateAt, type WindShift } from "../wind/schedule";
import { CITY, SOUTH_GATE } from "../world/sites";

export type GamePhase = "start" | "playing" | "won" | "stranded";
export type StrandReason = "water" | "rival" | null;

export interface FlagPoint {
  x: number;
  z: number;
}

export interface DockChoicePrompt {
  oasisId: string;
}

export interface RunState {
  phase: GamePhase;
  reason: StrandReason;
  elapsed: number;
  player: { x: number; z: number; heading: number; speed: number };
  followers: readonly TrailPoint[];
  stragglers: readonly boolean[];
  trail: readonly TrailPoint[];
  water: number;
  dock: DockState | null;
  dockChoice: DockChoicePrompt | null;
  oasesVisited: readonly string[];
  flags: readonly FlagPoint[];
  mapOpen: boolean;
  rival: PathFollowState;
  paceMultiplier: number;
  windIndex: number;
  finishSeconds: number | null;
  finishWaterFraction: number | null;
}

const START_HEADING = Math.atan2(CITY.x - SOUTH_GATE.x, CITY.z - SOUTH_GATE.z);

export function initialRunState(phase: GamePhase, rivalWaypoints: readonly Waypoint[]): RunState {
  const start: TrailPoint = { x: SOUTH_GATE.x, z: SOUTH_GATE.z };
  return {
    phase,
    reason: null,
    elapsed: 0,
    player: { x: start.x, z: start.z, heading: START_HEADING, speed: 0 },
    followers: [start, start, start, start],
    stragglers: [false, false, false, false],
    trail: [start],
    water: WATER_MAX,
    dock: null,
    dockChoice: null,
    oasesVisited: [],
    flags: [],
    mapOpen: false,
    rival: createPathFollow({ waypoints: rivalWaypoints, speed: RIVAL_BASE_SPEED, loop: false }),
    paceMultiplier: 1,
    windIndex: 0,
    finishSeconds: null,
    finishWaterFraction: null,
  };
}

export const runStore = defineStore<RunState>("run", () => initialRunState("start", RIVAL_WAYPOINTS));

export interface RunInput {
  urge: boolean;
  ease: boolean;
  steerLeft: boolean;
  steerRight: boolean;
}

export interface RunDeps {
  terrainField: TerrainField;
  windSchedule: readonly WindShift[];
  rivalWaypoints: readonly Waypoint[];
  waterMeter: DecayMeterSet;
}

function clampCoord(value: number, half: number): number {
  return clamp(value, -half + WORLD_CLAMP_MARGIN, half - WORLD_CLAMP_MARGIN);
}

export function stepRun(state: RunState, dt: number, input: RunInput, deps: RunDeps): RunState {
  if (state.phase !== "playing" || dt <= 0) return state;
  const elapsed = state.elapsed + dt;
  const wind = windStateAt(deps.windSchedule, WIND_SHIFT_SECONDS, elapsed);

  if (state.dock !== null) {
    const result = advanceDock(state.dock, dt);
    if (result.refillAmount > 0) deps.waterMeter.refill("water", result.refillAmount);
    return {
      ...state,
      elapsed,
      dock: result.dock,
      water: deps.waterMeter.value("water"),
      windIndex: wind.index,
      paceMultiplier: 0,
    };
  }

  let heading = state.player.heading;
  if (input.steerLeft) heading += STEER_RATE * dt;
  if (input.steerRight) heading -= STEER_RATE * dt;

  const slope = slopeAlongHeading(deps.terrainField, state.player.x, state.player.z, heading);
  const pace = computePaceMultiplier({ slope, windVector: wind.vector, headingRad: heading });
  const throttle = input.urge ? THROTTLE_URGE : input.ease ? THROTTLE_EASE : 1;
  const speed = PLAYER_BASE_SPEED * pace.multiplier * throttle;
  const [hx, hz] = headingVector(heading);
  const x = clampCoord(state.player.x + hx * speed * dt, 1250);
  const z = clampCoord(state.player.z + hz * speed * dt, 1250);

  const headwind = headwindSeverity(pace.windAlignment);
  const drainRate = computeWaterDrainRate({ speed, headwind });
  deps.waterMeter.setRateModifier("water", drainRate);
  deps.waterMeter.tick(dt);
  const water = deps.waterMeter.value("water");

  const trail = recordTrail(state.trail, { x, z });
  const followers: TrailPoint[] = [];
  const stragglers: boolean[] = [];
  for (let index = 0; index < state.followers.length; index += 1) {
    const target = positionOnTrail(trail, FOLLOWER_SPACING * (index + 1));
    const next = advanceFollowerToward(state.followers[index]!, target, Math.max(speed, 1) * FOLLOWER_CATCHUP_MULTIPLIER, dt);
    followers.push(next);
    stragglers.push(isStraggling(next, target));
  }

  const rival = state.rival.done
    ? state.rival
    : (() => {
        const rivalSlope = slopeAlongHeading(deps.terrainField, state.rival.position[0], state.rival.position[2], state.rival.heading);
        const rivalPace = computePaceMultiplier({ slope: rivalSlope, windVector: wind.vector, headingRad: state.rival.heading });
        const rivalSpeed = RIVAL_BASE_SPEED * rivalPace.multiplier;
        return advancePathFollow({ waypoints: deps.rivalWaypoints, speed: rivalSpeed, loop: false }, state.rival, dt);
      })();

  const strandedByWater = water <= 0;

  return {
    ...state,
    elapsed,
    player: { x, z, heading, speed },
    water,
    trail,
    followers,
    stragglers,
    rival,
    windIndex: wind.index,
    paceMultiplier: pace.multiplier,
    phase: strandedByWater ? "stranded" : state.phase,
    reason: strandedByWater ? "water" : state.reason,
  };
}

export function beginRun(state: RunState): RunState {
  if (state.phase !== "start") return state;
  return { ...state, phase: "playing" };
}

export function openDockChoice(state: RunState, oasisId: string): RunState {
  if (state.phase !== "playing" || state.dock !== null || state.dockChoice !== null) return state;
  return { ...state, dockChoice: { oasisId } };
}

export function cancelDockChoice(state: RunState): RunState {
  if (state.dockChoice === null) return state;
  return { ...state, dockChoice: null };
}

export function commitDock(state: RunState, kind: DockKind): RunState {
  if (state.dockChoice === null) return state;
  const oasisId = state.dockChoice.oasisId;
  return {
    ...state,
    dockChoice: null,
    dock: startDock(oasisId, kind),
    oasesVisited: state.oasesVisited.includes(oasisId) ? state.oasesVisited : [...state.oasesVisited, oasisId],
  };
}

export function pinFlag(state: RunState, point: FlagPoint): RunState {
  if (state.flags.length >= 3) return state;
  return { ...state, flags: [...state.flags, point] };
}

export function unpinFlag(state: RunState, index: number): RunState {
  return { ...state, flags: state.flags.filter((_, flagIndex) => flagIndex !== index) };
}

export function toggleMap(state: RunState): RunState {
  return { ...state, mapOpen: !state.mapOpen };
}

export function resolveRaceOutcome(winnerId: string): { phase: "won" | "stranded"; reason: StrandReason } {
  return raceOutcomeOf([winnerId], PLAYER_RACER_ID) === "win"
    ? { phase: "won", reason: null }
    : { phase: "stranded", reason: "rival" };
}

export function applyRaceFinish(state: RunState, winnerId: string): RunState {
  if (state.phase !== "playing") return state;
  const outcome = resolveRaceOutcome(winnerId);
  return {
    ...state,
    phase: outcome.phase,
    reason: outcome.reason,
    finishSeconds: state.elapsed,
    finishWaterFraction: state.water / WATER_MAX,
  };
}

export function racerPositions(state: RunState): Record<string, readonly [number, number, number]> {
  return {
    [PLAYER_RACER_ID]: [state.player.x, 0, state.player.z],
    [RIVAL_RACER_ID]: state.rival.position,
  };
}

export function distanceToCity(state: RunState): number {
  return Math.hypot(state.player.x - CITY.x, state.player.z - CITY.z);
}
