import type { Object3D, Vector3 } from "three";

/** What a tool may do to the camera controls that own a scene's view: retarget them and switch them off for a drag. */
export interface ActiveCameraControls {
  target: Vector3;
  enabled: boolean;
  update(): void;
}

const controlsByScene = new WeakMap<Object3D, ActiveCameraControls>();

/**
 * Name `controls` as the ones driving `scene`'s camera, or clear them with `null`. The orbit rig
 * that owns a view registers here so tools outside it (the editor's focus and terrain brush) reach
 * it without a renderer-wide slot.
 * @internal
 */
export function setActiveCameraControls(scene: Object3D, controls: ActiveCameraControls | null): void {
  if (controls === null) controlsByScene.delete(scene);
  else controlsByScene.set(scene, controls);
}

/** The controls driving `scene`'s camera right now, or `null` when no orbit rig is mounted. @internal */
export function activeCameraControls(scene: Object3D): ActiveCameraControls | null {
  return controlsByScene.get(scene) ?? null;
}
