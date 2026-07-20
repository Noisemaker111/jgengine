import { useFrame, useThree } from "@react-three/fiber";
import type { ReactNode } from "react";
import * as THREE from "three";

import type { CameraShakeController } from "@jgengine/core/vfx/cameraShake";

import { GAME_SIM_FRAME_PRIORITY } from "./orbitCameraMath";

// Reused scratch objects — never allocate inside the frame loop.
const shakeEuler = new THREE.Euler();
const shakeQuat = new THREE.Quaternion();

/** Props for {@link ControllerCameraShake}. */
export interface ControllerCameraShakeProps {
  /**
   * The core camera-shake controller to drive and apply. Feed it impacts with
   * `controller.add(amount, kind?)` from anywhere; this component ticks its decay
   * and applies the resulting offset to the active camera every frame.
   */
  controller: CameraShakeController;
  /**
   * `useFrame` priority. Must run AFTER the camera rig has posed the camera this
   * frame so the shake lands on top of the freshly-set base pose (the rig
   * overwrites the base each frame, so no manual restore is needed). Default
   * {@link GAME_SIM_FRAME_PRIORITY} (`0`) which runs after the orbit/rig cameras
   * (priority `-1`). Keep it `<= 0` so R3F's automatic render is preserved.
   */
  priority?: number;
}

/**
 * The shell-side consumer of a core {@link CameraShakeController}: each frame it
 * calls `controller.update(delta)` to bleed trauma, reads the pooled
 * `controller.offset()`, and applies it additively to the active camera — a
 * positional kick plus a pitch/yaw/roll rotation — so the view VISIBLY shakes on
 * impacts. It runs after the camera rig (which re-poses the camera to its base
 * every frame), so the shake composes with any rig without a manual save/restore
 * and without fighting the built-in `shakeChannel`. Renders nothing.
 *
 * @capability controller-camera-shake R3F consumer that applies a core camera-shake controller's pooled per-frame offset to the active camera (translation + pitch/yaw/roll) so the view visibly shakes
 */
export function ControllerCameraShake({
  controller,
  priority = GAME_SIM_FRAME_PRIORITY,
}: ControllerCameraShakeProps): ReactNode {
  const camera = useThree((state) => state.camera);

  useFrame((_, delta) => {
    controller.update(delta);
    const offset = controller.offset();
    // Additive on top of the rig's freshly-set base pose (rig runs at priority -1).
    camera.position.x += offset.x;
    camera.position.y += offset.y;
    camera.position.z += offset.z;
    if (offset.pitch !== 0 || offset.yaw !== 0 || offset.roll !== 0) {
      shakeEuler.set(offset.pitch, offset.yaw, offset.roll, "XYZ");
      shakeQuat.setFromEuler(shakeEuler);
      camera.quaternion.multiply(shakeQuat);
    }
  }, priority);

  return null;
}
