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

function pingPong01(t: number, period: number): number {
  if (period <= 0) return 0;
  const phase = ((t % period) + period) % period;
  const cyclePos = phase / period;
  return cyclePos < 0.5 ? cyclePos * 2 : 2 - cyclePos * 2;
}

/** Pure sweep angle at time `t` — a triangle wave between the camera's authored arc bounds. */
export function cameraAngleAt(camera: CameraDef, t: number): CameraPose {
  const halfSweep = (camera.sweepDeg * Math.PI) / 360;
  const v = pingPong01(t, camera.periodSeconds);
  return { angle: camera.baseAngle - halfSweep + v * halfSweep * 2 };
}
