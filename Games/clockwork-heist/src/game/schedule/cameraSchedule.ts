import { triangleWave } from "@jgengine/core/anim/oscillator";

export interface CameraDef {
  id: string;
  name: string;
  roomName: string;
  position: readonly [number, number, number];
  baseAngle: number;
  sweepDeg: number;
  periodSeconds: number;
  range: number;
  angleDeg: number;
}

export interface CameraPose {
  angle: number;
}

/** Pure sweep angle at time `t` — a triangle wave between the camera's authored arc bounds. */
export function cameraAngleAt(camera: CameraDef, t: number): CameraPose {
  const halfSweep = (camera.sweepDeg * Math.PI) / 360;
  const v = triangleWave(t, camera.periodSeconds);
  return { angle: camera.baseAngle - halfSweep + v * halfSweep * 2 };
}
