import { clampAxis, rampToward } from "@jgengine/core/input/axisInput";

export interface DroneAxes {
  throttle: number;
  yaw: number;
  pitch: number;
  strafe: number;
  boost: boolean;
}

export const NEUTRAL_DRONE_AXES: DroneAxes = { throttle: 0, yaw: 0, pitch: 0, strafe: 0, boost: false };

export interface PointerTilt {
  pitch: number;
  strafe: number;
}

const AXIS_RANGE = { min: -1, max: 1 };
const SMOOTHING = 6;

function digital(isDown: (action: string) => boolean, positive: string, negative: string): number {
  const pos = isDown(positive) ? 1 : 0;
  const neg = isDown(negative) ? 1 : 0;
  return pos - neg;
}

export function sampleDroneInput(
  isDown: (action: string) => boolean,
  prev: DroneAxes,
  dt: number,
  pointerTilt: PointerTilt | null = null,
): DroneAxes {
  const throttleTarget = digital(isDown, "throttleUp", "throttleDown");
  const yawTarget = digital(isDown, "yawRight", "yawLeft");
  const pitchTarget =
    pointerTilt !== null ? clampAxis(pointerTilt.pitch, AXIS_RANGE) : digital(isDown, "pitchForward", "pitchBack");
  const strafeTarget =
    pointerTilt !== null ? clampAxis(pointerTilt.strafe, AXIS_RANGE) : digital(isDown, "strafeRight", "strafeLeft");
  return {
    throttle: clampAxis(rampToward(prev.throttle, throttleTarget, SMOOTHING, dt), AXIS_RANGE),
    yaw: clampAxis(rampToward(prev.yaw, yawTarget, SMOOTHING, dt), AXIS_RANGE),
    pitch: clampAxis(rampToward(prev.pitch, pitchTarget, SMOOTHING, dt), AXIS_RANGE),
    strafe: clampAxis(rampToward(prev.strafe, strafeTarget, SMOOTHING, dt), AXIS_RANGE),
    boost: isDown("boost"),
  };
}
