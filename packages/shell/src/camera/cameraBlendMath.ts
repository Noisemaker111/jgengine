import type { Camera, PerspectiveCamera, Quaternion, Vector3 } from "three";

import { smoothstep } from "./rigMath";

export interface CameraBlendScratch {
  fromPos: Vector3;
  fromQuat: Quaternion;
  toPos: Vector3;
  toQuat: Quaternion;
  fov: number;
  elapsed: number;
  duration: number;
}

export function createCameraBlendScratch(
  Vector3Ctor: new () => Vector3,
  QuaternionCtor: new () => Quaternion,
): CameraBlendScratch {
  return {
    fromPos: new Vector3Ctor(),
    fromQuat: new QuaternionCtor(),
    toPos: new Vector3Ctor(),
    toQuat: new QuaternionCtor(),
    fov: 55,
    elapsed: 0,
    duration: 0,
  };
}

export function captureCameraBlendFrom(
  scratch: CameraBlendScratch,
  position: Vector3,
  quaternion: Quaternion,
  fov: number,
  duration: number,
): void {
  scratch.fromPos.copy(position);
  scratch.fromQuat.copy(quaternion);
  scratch.fov = fov;
  scratch.elapsed = 0;
  scratch.duration = duration;
}

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

export function applyCameraBlendStep(
  scratch: CameraBlendScratch,
  camera: Camera,
  targetFov: number,
  dt: number,
): boolean {
  scratch.elapsed += dt;
  const t = scratch.duration <= 0 ? 1 : Math.min(scratch.elapsed / scratch.duration, 1);
  const eased = smoothstep(t);
  scratch.toPos.copy(camera.position);
  scratch.toQuat.copy(camera.quaternion);
  camera.position.lerpVectors(scratch.fromPos, scratch.toPos, eased);
  camera.quaternion.slerpQuaternions(scratch.fromQuat, scratch.toQuat, eased);
  if (isPerspective(camera)) {
    camera.fov = scratch.fov + (targetFov - scratch.fov) * eased;
    camera.updateProjectionMatrix();
  }
  return t >= 1;
}
