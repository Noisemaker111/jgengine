import type { FlowSample, Vec3 } from "./flowTube";

export interface GliderTuning {
  readonly yawRate: number;
  readonly pitchRate: number;
  readonly maxPitch: number;
  readonly selfTopSpeed: number;
  readonly airbrakeFactor: number;
  readonly damping: number;
  readonly buffetStrength: number;
  readonly minControlAtBuffet: number;
}

export const DEFAULT_GLIDER_TUNING: GliderTuning = {
  yawRate: 1.8,
  pitchRate: 1.4,
  maxPitch: 0.6,
  selfTopSpeed: 7,
  airbrakeFactor: 0.75,
  damping: 2.6,
  buffetStrength: 7,
  minControlAtBuffet: 0.4,
};

export interface GliderPhysicsState {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly heading: number;
  readonly pitch: number;
}

export interface GliderInput {
  readonly yaw: number;
  readonly pitch: number;
  readonly thrust: number;
  readonly brake: number;
}

export const NEUTRAL_GLIDER_INPUT: GliderInput = { yaw: 0, pitch: 0, thrust: 0, brake: 0 };

export function controlDegradation(buffet: number, minControl = DEFAULT_GLIDER_TUNING.minControlAtBuffet): number {
  const clamped = Math.min(1, Math.max(0, buffet));
  return 1 - (1 - minControl) * clamped;
}

export function headingVector(heading: number, pitch: number): Vec3 {
  return [Math.sin(heading) * Math.cos(pitch), Math.sin(pitch), Math.cos(heading) * Math.cos(pitch)];
}

export function rightVector(heading: number): Vec3 {
  return [Math.cos(heading), 0, -Math.sin(heading)];
}

export function initialGliderState(position: Vec3, heading = 0): GliderPhysicsState {
  return { position, velocity: [0, 0, 0], heading, pitch: 0 };
}

export function stepGlider(
  state: GliderPhysicsState,
  input: GliderInput,
  flow: FlowSample,
  ambientWind: readonly [number, number],
  dt: number,
  time: number,
  tuning: GliderTuning = DEFAULT_GLIDER_TUNING,
): GliderPhysicsState {
  const degrade = controlDegradation(flow.buffet, tuning.minControlAtBuffet);
  const heading = state.heading + input.yaw * tuning.yawRate * degrade * dt;
  const pitch = Math.min(tuning.maxPitch, Math.max(-tuning.maxPitch, state.pitch + input.pitch * tuning.pitchRate * degrade * dt));

  const forward = headingVector(heading, pitch);
  const selfSpeed = Math.max(0, tuning.selfTopSpeed * input.thrust - tuning.selfTopSpeed * tuning.airbrakeFactor * input.brake);

  const tubeVelocity: Vec3 = flow.inTube ? [flow.axialDir[0] * flow.axialSpeed, flow.axialDir[1] * flow.axialSpeed, flow.axialDir[2] * flow.axialSpeed] : [0, 0, 0];

  const buffetPhase = time * 9 + state.position[0] * 0.7 + state.position[2] * 0.31;
  const buffetKick = flow.buffet > 0 ? flow.buffet * tuning.buffetStrength * Math.sin(buffetPhase) : 0;
  const buffetVelocity: Vec3 = [flow.radialDir[0] * buffetKick, flow.radialDir[1] * buffetKick * 0.4, flow.radialDir[2] * buffetKick];

  const selfVelocity: Vec3 = [forward[0] * selfSpeed, forward[1] * selfSpeed, forward[2] * selfSpeed];

  const targetVelocity: Vec3 = [
    selfVelocity[0] + tubeVelocity[0] + buffetVelocity[0] + ambientWind[0],
    selfVelocity[1] + tubeVelocity[1] + buffetVelocity[1],
    selfVelocity[2] + tubeVelocity[2] + buffetVelocity[2] + ambientWind[1],
  ];

  const blend = Math.min(1, tuning.damping * dt);
  const velocity: Vec3 = [
    state.velocity[0] + (targetVelocity[0] - state.velocity[0]) * blend,
    state.velocity[1] + (targetVelocity[1] - state.velocity[1]) * blend,
    state.velocity[2] + (targetVelocity[2] - state.velocity[2]) * blend,
  ];

  const position: Vec3 = [state.position[0] + velocity[0] * dt, state.position[1] + velocity[1] * dt, state.position[2] + velocity[2] * dt];

  return { position, velocity, heading, pitch };
}

export interface RawSteerInput {
  readonly pitchUp: boolean;
  readonly pitchDown: boolean;
  readonly yawLeft: boolean;
  readonly yawRight: boolean;
  readonly mouseX: number;
  readonly mouseY: number;
}

export function resolveSteerInput(raw: RawSteerInput): { yaw: number; pitch: number } {
  const arrowYaw = (raw.yawRight ? 1 : 0) - (raw.yawLeft ? 1 : 0);
  const arrowPitch = (raw.pitchUp ? 1 : 0) - (raw.pitchDown ? 1 : 0);
  const clampedMouseX = Math.min(1, Math.max(-1, raw.mouseX));
  const clampedMouseY = Math.min(1, Math.max(-1, raw.mouseY));
  const yaw = arrowYaw !== 0 ? arrowYaw : clampedMouseX;
  const pitch = arrowPitch !== 0 ? arrowPitch : -clampedMouseY;
  return { yaw, pitch };
}
