import { clamp01, lerp } from "@jgengine/core/anim/easing";
import type { Vec3 } from "../world/canyonMath";
import { clamp } from "../world/canyonMath";

export interface CarState {
  readonly position: Vec3;
  readonly heading: number;
  readonly speed: number;
}

export interface CarInput {
  readonly throttle: boolean;
  readonly brake: boolean;
  readonly steerLeft: boolean;
  readonly steerRight: boolean;
  readonly handbrake: boolean;
}

export const NEUTRAL_CAR_INPUT: CarInput = {
  throttle: false,
  brake: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
};

export interface CarTuning {
  readonly accel: number;
  readonly brakeDecel: number;
  readonly dragDecel: number;
  readonly maxSpeed: number;
  readonly reverseMaxSpeed: number;
  readonly turnRateAtMax: number;
  readonly turnRateAtMin: number;
  readonly handbrakeTurnBoost: number;
  readonly handbrakeSpeedDecay: number;
}

export const DEFAULT_CAR_TUNING: CarTuning = {
  accel: 16,
  brakeDecel: 26,
  dragDecel: 6,
  maxSpeed: 34,
  reverseMaxSpeed: -10,
  turnRateAtMax: 1.1,
  turnRateAtMin: 2.4,
  handbrakeTurnBoost: 1.6,
  handbrakeSpeedDecay: 18,
};

export function createCarState(position: Vec3, heading: number): CarState {
  return { position, heading, speed: 0 };
}

export function advanceCar(
  state: CarState,
  input: CarInput,
  dt: number,
  tuning: CarTuning = DEFAULT_CAR_TUNING,
  speedMultiplier = 1,
): CarState {
  let speed = state.speed;
  if (input.throttle) speed += tuning.accel * dt;
  else if (input.brake) speed -= tuning.brakeDecel * dt;
  else speed -= Math.sign(speed) * tuning.dragDecel * dt;
  if (input.handbrake) speed -= tuning.handbrakeSpeedDecay * dt;

  const maxSpeed = tuning.maxSpeed * speedMultiplier;
  speed = clamp(speed, tuning.reverseMaxSpeed, maxSpeed);
  if (Math.abs(speed) < 0.05 && !input.throttle && !input.brake) speed = 0;

  const speedFraction = clamp01(Math.abs(speed) / tuning.maxSpeed);
  const baseTurnRate = lerp(tuning.turnRateAtMin, tuning.turnRateAtMax, speedFraction);
  const turnRate = input.handbrake ? baseTurnRate * tuning.handbrakeTurnBoost : baseTurnRate;
  const steerDir = (input.steerLeft ? -1 : 0) + (input.steerRight ? 1 : 0);
  const movingSign = speed >= 0 ? 1 : -1;
  const heading = state.heading + steerDir * turnRate * dt * movingSign;

  const dx = Math.sin(heading) * speed * dt;
  const dz = Math.cos(heading) * speed * dt;
  const position: Vec3 = [state.position[0] + dx, state.position[1], state.position[2] + dz];
  return { position, heading, speed };
}
