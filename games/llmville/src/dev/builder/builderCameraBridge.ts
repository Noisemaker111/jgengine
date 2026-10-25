import type { Camera } from "three";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface BuilderCameraSnapshot {
  position: Vector3;
  target: Vector3;
}

let orbitControls: OrbitControlsImpl | null = null;

export function registerBuilderOrbitControls(controls: OrbitControlsImpl | null): void {
  orbitControls = controls;
}

export function saveBuilderCameraSnapshot(camera: Camera): BuilderCameraSnapshot {
  const target = orbitControls
    ? orbitControls.target.clone()
    : new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
  return {
    position: camera.position.clone(),
    target,
  };
}

export function restoreBuilderCameraSnapshot(camera: Camera, snapshot: BuilderCameraSnapshot): void {
  camera.position.copy(snapshot.position);
  if (orbitControls) {
    orbitControls.target.copy(snapshot.target);
    orbitControls.update();
    return;
  }
  camera.lookAt(snapshot.target);
}