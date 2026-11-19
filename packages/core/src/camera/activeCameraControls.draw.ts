import type { Object3D, Vector3 } from "three";

export interface ActiveCameraControls {
  target: Vector3;
  enabled: boolean;
  update(): void;
}

const controlsByScene = new WeakMap<Object3D, ActiveCameraControls>();

/** @internal */
export function setActiveCameraControls(scene: Object3D, controls: ActiveCameraControls | null): void {
  if (controls === null) controlsByScene.delete(scene);
  else controlsByScene.set(scene, controls);
}

/** @internal */
export function activeCameraControls(scene: Object3D): ActiveCameraControls | null {
  return controlsByScene.get(scene) ?? null;
}
