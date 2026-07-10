import type { PathFollowConfig, PathFollowState, Waypoint } from "@jgengine/core/nav/pathFollow";
import { BOAT_MAX_FORWARD_SPEED } from "./momentum";
import { GATES, LAPS, type StartSlot } from "../course/track";
import { type Vec2, vecDot, vecNormalize } from "../shared/vec2";

export const RIVAL_ASSIST_FACTOR = 0.75;
export const RIVAL_MIN_SPEED = 3.5;

export function rivalWaypoints(startSlot: StartSlot): readonly Waypoint[] {
  const start: Waypoint = [startSlot.x, 0.6, startSlot.z];
  const laps: Waypoint[] = [];
  for (let lap = 0; lap < LAPS; lap += 1) {
    for (const gate of GATES) laps.push(gate.center);
  }
  return [start, ...laps];
}

export function rivalBaseSpeed(skill: number): number {
  return BOAT_MAX_FORWARD_SPEED * skill;
}

export function rivalDirectionToTarget(state: PathFollowState, waypoints: readonly Waypoint[]): Vec2 {
  const dest = waypoints[state.target] ?? state.position;
  return vecNormalize([dest[0] - state.position[0], dest[2] - state.position[2]]);
}

export function rivalEffectiveSpeed(baseSpeed: number, dirToTarget: Vec2, currentVec: Vec2): number {
  const assist = vecDot(dirToTarget, currentVec);
  return Math.max(RIVAL_MIN_SPEED, baseSpeed + assist * RIVAL_ASSIST_FACTOR);
}

export function rivalPathConfig(waypoints: readonly Waypoint[], speed: number): PathFollowConfig {
  return { waypoints, speed, loop: false };
}
