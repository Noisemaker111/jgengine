import type { RenderCallback } from "@react-three/fiber";
import { useSharedFrame } from "@jgengine/core/render/useSharedFrame.draw";

/**
 * `useFrame` that joins the frame loop only while `active`. For per-model work that most models
 * never have (a rig to pose, clips to play, paint to sync). Active copies share one r3f subscriber
 * per priority through `useSharedFrame`, so a scene of a thousand animated props pays one dispatch
 * a frame, not a thousand: r3f calls and re-sorts each subscriber of its own.
 * @internal
 */
export function useFrameWhile(active: boolean, callback: RenderCallback, priority = 0): void {
  useSharedFrame(callback, priority, active);
}
