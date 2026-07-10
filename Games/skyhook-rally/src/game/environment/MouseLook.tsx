import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";

import { getBridge } from "../runtime/bridge";

const SENSITIVITY = 0.0024;
const MAX_PITCH = 1.15;

/**
 * Drives the courier's look/aim direction from the mouse — the chase camera
 * has no free-look of its own (it only follows the entity's `rotationY`), so
 * this component captures pointer-lock mouse deltas into the shared flight
 * bridge (see `game/runtime/bridge.ts`) and pushes yaw onto the entity every
 * frame so the chase rig follows it, and pitch feeds the hook aim cone.
 */
export function MouseLook() {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const domElement = useThree((state) => state.gl.domElement);

  useEffect(() => {
    const requestLock = () => {
      if (window.matchMedia?.("(pointer: coarse)").matches) return;
      if (document.pointerLockElement !== domElement) void domElement.requestPointerLock?.();
    };
    const onMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== domElement) return;
      const bridge = getBridge();
      bridge.aim.yaw -= event.movementX * SENSITIVITY;
      bridge.aim.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, bridge.aim.pitch - event.movementY * SENSITIVITY));
    };
    domElement.addEventListener("click", requestLock);
    window.addEventListener("mousemove", onMove);
    return () => {
      domElement.removeEventListener("click", requestLock);
      window.removeEventListener("mousemove", onMove);
    };
  }, [domElement]);

  useFrame(() => {
    ctx.scene.entity.update(userId, { rotationY: getBridge().aim.yaw });
  });

  return null;
}
