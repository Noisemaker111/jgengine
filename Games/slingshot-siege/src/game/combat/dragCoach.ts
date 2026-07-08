import {
  GRAVITY,
  GROUND_FIELD,
  MAX_LAUNCH_SPEED,
  MAX_PULL,
  POWER_SCALE,
  SLING_ANCHOR,
  TRAJECTORY_DT,
  TRAJECTORY_STEPS,
  type ShotPhase,
} from "../state/slingshotStore";
import { clampPull, launchVelocity, sampleTrajectory, type Vec3 } from "../physics/trajectory";

export const DRAG_COACH_PULL_POINT: Vec3 = [-1.8, 0.5, 0];

export const DRAG_COACH_CYCLE_SECONDS = 2.5;
const APPEAR_END = 0.1;
const PULL_END = 0.5;
const HOLD_END = 0.75;
const ARC_START_PULL_FRACTION = 0.35;

export function coachVisible(phase: ShotPhase, hasDragged: boolean): boolean {
  return phase === "aiming" && !hasDragged;
}

export function demoTrajectory(): readonly Vec3[] {
  const velocity = launchVelocity({
    anchor: SLING_ANCHOR,
    pulledPoint: DRAG_COACH_PULL_POINT,
    maxPull: MAX_PULL,
    powerScale: POWER_SCALE,
    maxSpeed: MAX_LAUNCH_SPEED,
  });
  const origin = clampPull(SLING_ANCHOR, DRAG_COACH_PULL_POINT, MAX_PULL);
  const floorY = GROUND_FIELD.sampleHeight(origin[0], origin[2]);
  return sampleTrajectory(origin, velocity, GRAVITY, TRAJECTORY_STEPS, TRAJECTORY_DT, floorY);
}

function ease(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped * (3 - 2 * clamped);
}

function lerpVec3(from: Vec3, to: Vec3, t: number): Vec3 {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

export interface CoachFrame {
  position: Vec3;
  opacity: number;
  showArc: boolean;
}

export function coachFrame(elapsedSeconds: number): CoachFrame {
  const cycle = ((elapsedSeconds % DRAG_COACH_CYCLE_SECONDS) + DRAG_COACH_CYCLE_SECONDS) % DRAG_COACH_CYCLE_SECONDS;
  const t = cycle / DRAG_COACH_CYCLE_SECONDS;

  if (t < APPEAR_END) {
    return { position: SLING_ANCHOR, opacity: ease(t / APPEAR_END), showArc: false };
  }
  if (t < PULL_END) {
    const pullT = ease((t - APPEAR_END) / (PULL_END - APPEAR_END));
    return {
      position: lerpVec3(SLING_ANCHOR, DRAG_COACH_PULL_POINT, pullT),
      opacity: 1,
      showArc: pullT > ARC_START_PULL_FRACTION,
    };
  }
  if (t < HOLD_END) {
    return { position: DRAG_COACH_PULL_POINT, opacity: 1, showArc: true };
  }
  const fadeT = (t - HOLD_END) / (1 - HOLD_END);
  return { position: DRAG_COACH_PULL_POINT, opacity: 1 - ease(fadeT), showArc: true };
}
