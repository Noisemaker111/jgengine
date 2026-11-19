import { createContext, useContext } from "@jgengine/core/ui/jsx";
import type { Camera } from "three";

import { defaultCameraShake, type CameraShakeController, type CameraShakeOffset } from "./cameraShake";

/** Override which controller the rigs below apply; defaults to {@link defaultCameraShake}. */
export const CameraShakeContext = createContext<CameraShakeController>(defaultCameraShake);

/** @internal */
export function useCameraShake(): CameraShakeController {
  return useContext(CameraShakeContext);
}

/** @internal */
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

/** @internal */
export function removeCameraShake(camera: Camera, applied: CameraShakeOffset): void {
  camera.rotateZ(-applied.roll);
  camera.rotateY(-applied.yaw);
  camera.rotateX(-applied.pitch);
  camera.translateZ(-applied.z);
  camera.translateY(-applied.y);
  camera.translateX(-applied.x);
  applied.x = applied.y = applied.z = applied.pitch = applied.yaw = applied.roll = 0;
}
