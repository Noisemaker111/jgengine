import { createContext, useContext } from "react";
import type { Camera } from "three";

import type { CameraShakeConfig as RigShakeConfig } from "@jgengine/core/game/cameraConfig";
import {
  createCameraShake,
  type CameraShakeConfig,
  type CameraShakeController,
  type CameraShakeOffset,
} from "@jgengine/core/vfx/cameraShake";

/** Trauma decay the engine's impact presets are calibrated against, trauma/second. */
export const CALIBRATED_TRAUMA_DECAY_PER_SECOND = 1.4;

/**
 * The core shake config a camera rig runs: positional kick on the camera's X/Y plus roll, with the
 * game's `camera.shake` overrides. Pitch and yaw stay still so aim never drifts under a hit.
 * @internal
 */
export function rigShakeConfig(config?: RigShakeConfig): CameraShakeConfig {
  const offset = config?.maxOffset ?? 0.5;
  return {
    decayPerSecond: config?.decayPerSecond ?? 1.6,
    traumaExponent: config?.exponent ?? 2,
    maxTranslation: [offset, offset, 0],
    maxRotation: [0, 0, config?.maxRoll ?? 0.06],
    frequency: config?.frequency ?? 24,
  };
}

/**
 * The one camera-shake controller the rigs apply. Game systems with no React context (a
 * `loop.onTick` reacting to `entity.died`) feed it through {@link cameraShake}; a rig reads it through
 * {@link useCameraShake}. It is the core `createCameraShake` model, so a demo or test can drive the
 * same controller directly.
 */
export const defaultCameraShake: CameraShakeController = createCameraShake(rigShakeConfig());

/**
 * Add camera trauma from anywhere. `decayPerSecond`, when given, retunes how fast it bleeds off.
 * @capability camera-shake add trauma to the active camera rig's shake from any game system
 */
export function cameraShake(amplitude: number, decayPerSecond?: number): void {
  if (decayPerSecond !== undefined) defaultCameraShake.configure({ decayPerSecond });
  defaultCameraShake.add(amplitude);
}

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
