import type { FanState } from "../flight/fanSchedule";
import { NO_FLOW, resolveActiveFlow, type Vec3 } from "../flight/flowTube";
import { DEFAULT_GLIDER_TUNING, initialGliderState, stepGlider, type GliderInput, type GliderPhysicsState } from "../flight/glider";
import { CANYON_C_FAN_IDS, FLOW_TUBES, LOOP_VIA_CANYON, LOOP_VIA_CONNECTOR, type RouteNode } from "./route";

export type PacerFork = "canyon" | "connector";

export interface PacerRuntime {
  readonly glider: GliderPhysicsState;
  readonly waypointIndex: number;
  readonly forkChoice: PacerFork | null;
}

const FORK_DECISION_INDEX = 7;
const ARRIVAL_RADIUS = 10;
const STEER_GAIN = 2.2;

export function choosePacerFork(fanStates: ReadonlyMap<string, FanState>): PacerFork {
  const powers = CANYON_C_FAN_IDS.map((id) => fanStates.get(id)?.power ?? 0);
  const avg = powers.reduce((sum, p) => sum + p, 0) / powers.length;
  return avg >= 0.5 ? "canyon" : "connector";
}

function activeLoop(forkChoice: PacerFork | null): readonly RouteNode[] {
  return forkChoice === "canyon" ? LOOP_VIA_CANYON : LOOP_VIA_CONNECTOR;
}

export function initPacer(spawnPosition: Vec3, spawnHeading: number): PacerRuntime {
  return { glider: initialGliderState(spawnPosition, spawnHeading), waypointIndex: 1, forkChoice: null };
}

function angleDiff(target: number, current: number): number {
  const raw = target - current;
  return Math.atan2(Math.sin(raw), Math.cos(raw));
}

export interface PacerAdvanceResult {
  readonly runtime: PacerRuntime;
  readonly position: Vec3;
  readonly heading: number;
}

export function advancePacer(
  runtime: PacerRuntime,
  dt: number,
  time: number,
  fanPowerOf: (fanId: string) => { power: number; direction: 1 | -1 },
  fanStatesForFork: ReadonlyMap<string, FanState>,
  ambientWind: readonly [number, number],
): PacerAdvanceResult {
  let waypointIndex = runtime.waypointIndex;
  let forkChoice = runtime.forkChoice;

  let loop = activeLoop(forkChoice);
  if (waypointIndex >= loop.length) {
    waypointIndex = 0;
    forkChoice = null;
    loop = activeLoop(forkChoice);
  }
  if (waypointIndex >= FORK_DECISION_INDEX && forkChoice === null) {
    forkChoice = choosePacerFork(fanStatesForFork);
    loop = activeLoop(forkChoice);
  }

  const targetIndex = Math.min(waypointIndex, loop.length - 1);
  const target = loop[targetIndex]!.position;

  const dx = target[0] - runtime.glider.position[0];
  const dy = target[1] - runtime.glider.position[1];
  const dz = target[2] - runtime.glider.position[2];
  const flatDist = Math.hypot(dx, dz);

  const desiredHeading = Math.atan2(dx, dz);
  const desiredPitch = Math.atan2(dy, Math.max(1, flatDist));

  const input: GliderInput = {
    yaw: Math.min(1, Math.max(-1, angleDiff(desiredHeading, runtime.glider.heading) * STEER_GAIN)),
    pitch: Math.min(1, Math.max(-1, angleDiff(desiredPitch, runtime.glider.pitch) * STEER_GAIN)),
    thrust: 1,
    brake: 0,
  };

  const flow = resolveActiveFlow(FLOW_TUBES, fanPowerOf, runtime.glider.position) ?? NO_FLOW;
  const glider = stepGlider(runtime.glider, input, flow, ambientWind, dt, time, DEFAULT_GLIDER_TUNING);

  let nextWaypointIndex = waypointIndex;
  if (flatDist < ARRIVAL_RADIUS && Math.abs(dy) < ARRIVAL_RADIUS) {
    nextWaypointIndex = waypointIndex + 1;
  }

  return {
    runtime: { glider, waypointIndex: nextWaypointIndex, forkChoice },
    position: glider.position,
    heading: glider.heading,
  };
}
