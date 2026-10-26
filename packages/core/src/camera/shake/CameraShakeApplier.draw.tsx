import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import type { CameraShakeOffset } from "@jgengine/core/camera/shake/cameraShake";

import { GAME_SIM_FRAME_PRIORITY } from "@jgengine/core/camera/orbitCameraMath";
import { applyCameraShake, removeCameraShake, useCameraShake } from "./shakeChannel.draw";

/** Runs before orbit controls (drei updates them at priority -1), so they never read a shaken pose. */
const SHAKE_REMOVE_PRIORITY = -2;

/**
 * Applies the shared camera shake for rigs that pose the camera themselves (orbit, first person,
 * inspection). It kicks the camera after the rig each frame and takes the kick back off before the rig
 * runs again, so orbit controls never fold the shake into their distance or angles.
 * @internal
 */
export function CameraShakeApplier(): null {
  const camera = useThree((state) => state.camera);
  const shake = useCameraShake();
  const applied = useRef<CameraShakeOffset>({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });
  useFrame(() => removeCameraShake(camera, applied.current), SHAKE_REMOVE_PRIORITY);
  useFrame((_, dt) => applyCameraShake(camera, shake, dt, applied.current), GAME_SIM_FRAME_PRIORITY);
  return null;
}
