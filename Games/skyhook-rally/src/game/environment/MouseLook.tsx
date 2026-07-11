import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGameContext } from "@jgengine/react/provider";
import { usePlayer } from "@jgengine/react/hooks";
import { createMouseLookTracker, type MouseLookTracker } from "@jgengine/shell/input/mouseLook";

import { getBridge } from "../runtime/bridge";

const SENSITIVITY = 0.0024;
const MAX_PITCH = 1.15;

/**
 * Drives the courier's look/aim direction from the mouse — the chase camera
 * has no free-look of its own (it only follows the entity's `rotationY`), so
 * this component runs the shell's mouse-look tracker and mirrors its aim into
 * the shared flight bridge (see `game/runtime/bridge.ts`), pushing yaw onto
 * the entity every frame so the chase rig follows it; pitch feeds the hook aim cone.
 */
export function MouseLook() {
  const ctx = useGameContext();
  const { userId } = usePlayer();
  const domElement = useThree((state) => state.gl.domElement);
  const trackerRef = useRef<MouseLookTracker | null>(null);
  const bridgeRef = useRef<ReturnType<typeof getBridge> | null>(null);

  useEffect(() => {
    const bridge = getBridge();
    const tracker = createMouseLookTracker(domElement, {
      sensitivity: SENSITIVITY,
      maxPitch: MAX_PITCH,
      initialYaw: bridge.aim.yaw,
      initialPitch: bridge.aim.pitch,
    });
    trackerRef.current = tracker;
    return () => {
      trackerRef.current = null;
      tracker.dispose();
    };
  }, [domElement]);

  useFrame(() => {
    const tracker = trackerRef.current;
    if (tracker === null) return;
    const bridge = getBridge();
    if (bridgeRef.current !== bridge) {
      bridgeRef.current = bridge;
      tracker.setAim(bridge.aim.yaw, bridge.aim.pitch);
    }
    const aim = tracker.aim();
    bridge.aim.yaw = aim.yaw;
    bridge.aim.pitch = aim.pitch;
    ctx.scene.entity.update(userId, { rotationY: aim.yaw });
  });

  return null;
}
