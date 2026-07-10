import { clamp, headingToVec, type Vec2, vecAdd, vecDot, vecLength } from "../shared/vec2";

export interface BoatState {
  x: number;
  z: number;
  headingRad: number;
  speed: number;
}

export interface BoatInput {
  throttle: -1 | 0 | 1;
  rudder: -1 | 0 | 1;
  brake: boolean;
}

export const BOAT_MAX_FORWARD_SPEED = 16;
export const BOAT_MAX_REVERSE_SPEED = 6;
export const BOAT_ACCEL = 11;
export const BOAT_DRAG = 3.4;
export const BOAT_TURN_RATE = 1.55;
export const BOAT_TURN_MIN_FACTOR = 0.4;
export const BOAT_BRAKE_TURN_MULTIPLIER = 1.85;
export const BOAT_BRAKE_DRAG_MULTIPLIER = 2.6;
export const CURRENT_ASSIST_SURF_THRESHOLD = 1.0;
export const CURRENT_ASSIST_FIGHT_THRESHOLD = -1.0;

export const NEUTRAL_INPUT: BoatInput = { throttle: 0, rudder: 0, brake: false };
export const BOAT_Y = 0.6;

export function createBoatState(x: number, z: number, headingRad: number): BoatState {
  return { x, z, headingRad, speed: 0 };
}

function nextSpeed(speed: number, input: BoatInput, dt: number): number {
  const throttleTarget =
    input.throttle > 0 ? BOAT_MAX_FORWARD_SPEED : input.throttle < 0 ? -BOAT_MAX_REVERSE_SPEED : 0;
  const drag = input.brake ? BOAT_DRAG * BOAT_BRAKE_DRAG_MULTIPLIER : BOAT_DRAG;
  if (input.throttle === 0) {
    if (speed > 0) return Math.max(0, speed - drag * dt);
    if (speed < 0) return Math.min(0, speed + drag * dt);
    return 0;
  }
  const delta = throttleTarget - speed;
  const step = Math.sign(delta) * Math.min(Math.abs(delta), BOAT_ACCEL * dt);
  return speed + step;
}

function nextHeading(headingRad: number, speed: number, input: BoatInput, dt: number): number {
  if (input.rudder === 0) return headingRad;
  const speedFactor =
    BOAT_TURN_MIN_FACTOR + (1 - BOAT_TURN_MIN_FACTOR) * clamp(Math.abs(speed) / BOAT_MAX_FORWARD_SPEED, 0, 1);
  const turnRate = BOAT_TURN_RATE * speedFactor * (input.brake ? BOAT_BRAKE_TURN_MULTIPLIER : 1);
  const reverseFlip = speed < 0 ? -1 : 1;
  return headingRad + input.rudder * turnRate * reverseFlip * dt;
}

export function ownVelocity(state: BoatState): Vec2 {
  const forward = headingToVec(state.headingRad);
  return [forward[0] * state.speed, forward[1] * state.speed];
}

export function currentAssist(headingRad: number, currentVec: Vec2): number {
  return vecDot(headingToVec(headingRad), currentVec);
}

export function stepBoat(state: BoatState, input: BoatInput, currentVec: Vec2, dt: number): BoatState {
  const speed = nextSpeed(state.speed, input, dt);
  const headingRad = nextHeading(state.headingRad, speed, input, dt);
  const forward = headingToVec(headingRad);
  const forwardVelocity: Vec2 = [forward[0] * speed, forward[1] * speed];
  const netVelocity = vecAdd(forwardVelocity, currentVec);
  return {
    x: state.x + netVelocity[0] * dt,
    z: state.z + netVelocity[1] * dt,
    headingRad,
    speed,
  };
}

export function groundSpeed(state: BoatState, currentVec: Vec2): number {
  return vecLength(vecAdd(ownVelocity(state), currentVec));
}

export type CurrentAssistMood = "surf" | "fight" | "neutral";

export function currentAssistMood(headingRad: number, currentVec: Vec2): CurrentAssistMood {
  const assist = currentAssist(headingRad, currentVec);
  if (assist >= CURRENT_ASSIST_SURF_THRESHOLD) return "surf";
  if (assist <= CURRENT_ASSIST_FIGHT_THRESHOLD) return "fight";
  return "neutral";
}
