import { createContext, useContext } from "react";
import type { Camera } from "three";

import { defaultCameraShake, type CameraShakeController, type CameraShakeOffset } from "./cameraShake";

/** Override which controller the rigs below apply; defaults to {@link defaultCameraShake}. */
export const CameraShakeContext = createContext<CameraShakeController>(defaultCameraShake);

/** The controller the active rig applies. @internal */
export function useCameraShake(): CameraShakeController {
  return useContext(CameraShakeContext);
}

/**
 * Advance `controller` by `dt` and kick `camera` by its offset in the camera's own frame. Writes the kick it
 * applied into `applied`, so {@link removeCameraShake} can take exactly that back off before a rig that
 * reads the camera's pose (orbit controls) runs again.
 * @internal
 */
export function applyCameraShake(camera: Camera, controller: CameraShakeController, dt: number, applied?: CameraShakeOffset): void {
  controller.update(dt);
  const offset = controller.offset();
  camera.translateX(offset.x);
  camera.translateY(offset.y);
  camera.translateZ(offset.z);
  camera.rotateX(offset.pitch);
  camera.rotateY(offset.yaw);
  camera.rotateZ(offset.roll);
  if (applied !== undefined) Object.assign(applied, offset);
}

/** Undo the kick {@link applyCameraShake} recorded in `applied`, leaving the rig's own pose. @internal */
export function removeCameraShake(camera: Camera, applied: CameraShakeOffset): void {
  camera.rotateZ(-applied.roll);
  camera.rotateY(-applied.yaw);
  camera.rotateX(-applied.pitch);
  camera.translateZ(-applied.z);
  camera.translateY(-applied.y);
  camera.translateX(-applied.x);
  applied.x = applied.y = applied.z = applied.pitch = applied.yaw = applied.roll = 0;
}
